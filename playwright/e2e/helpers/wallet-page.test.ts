import { chromium } from '@playwright/test';

import { ChromeWalletPage } from './wallet-page';
import { TimelineRecorder } from '../harness/timeline-recorder';
import { runStressDriver } from '../stress/stress-driver';

jest.mock('@playwright/test', () => ({
  expect: jest.fn(),
  chromium: {
    launch: jest.fn(async () => ({
      newPage: async () => ({ evaluate: jest.fn(), waitForFunction: jest.fn(async () => undefined) })
    }))
  }
}));
jest.mock('../harness/timeline-recorder', () => ({
  TimelineRecorder: jest.fn(() => ({ emit: jest.fn() }))
}));

async function makeWallet() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  jest.mocked(page.evaluate).mockImplementation(async (callback, arg) => {
    if (typeof callback !== 'function') throw new Error('Expected an evaluate callback');
    return callback(arg);
  });
  const wallet = new ChromeWalletPage(page, 'test-extension');
  jest.spyOn(wallet, 'navigateHome').mockResolvedValue(undefined);
  return wallet;
}

describe('ChromeWalletPage.getBalance', () => {
  const chromeDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const storeDescriptor = Object.getOwnPropertyDescriptor(window, '__TEST_STORE__');
  const fetchBalances = jest.fn(async () => undefined);

  beforeEach(() => {
    Object.defineProperty(window, '__TEST_STORE__', {
      configurable: true,
      value: {
        getState: () => ({
          currentAccount: { publicKey: 'account' },
          fetchBalances,
          balances: {
            account: [
              { amount: '3', metadata: { symbol: 'TST' } },
              { balance: '7', metadata: { symbol: 'MIDEN' } },
              { amount: '1' }
            ]
          }
        })
      }
    });
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: {
            get: (_keys: string[], callback: (value: unknown) => void) =>
              callback({
                miden_sync_data: {
                  notes: [
                    { id: 'tst', amountBaseUnits: '200', metadata: { symbol: 'TST', decimals: 2 } },
                    { id: 'fee', amountBaseUnits: '50000000', metadata: { symbol: 'MIDEN', decimals: 8 } },
                    { id: 'unknown', amountBaseUnits: '100000000' }
                  ]
                }
              })
          }
        }
      }
    });
  });

  afterEach(() => {
    if (chromeDescriptor) Object.defineProperty(globalThis, 'chrome', chromeDescriptor);
    else Reflect.deleteProperty(globalThis, 'chrome');
    if (storeDescriptor) Object.defineProperty(window, '__TEST_STORE__', storeDescriptor);
    else Reflect.deleteProperty(window, '__TEST_STORE__');
    jest.clearAllMocks();
  });

  it.each(['TST', 'tst'])('counts only %s consumed assets and pending notes', async symbol => {
    const wallet = await makeWallet();
    expect(await wallet.getBalance(symbol)).toBe(5);
    expect(fetchBalances).toHaveBeenCalledWith('account', {});
  });

  it('returns zero for an absent token instead of another asset balance', async () => {
    expect(await (await makeWallet()).getBalance('ABSENT')).toBe(0);
  });

  it('preserves the all-asset total when no symbol is requested', async () => {
    expect(await (await makeWallet()).getBalance()).toBe(14.5);
  });
});

describe('stress driver token conservation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each([undefined, 'ALT'])('ignores fee-asset spending when conserving %s', async tokenSymbol => {
    const walletA = await makeWallet();
    const walletB = await makeWallet();
    const balances = { A: 10, B: 10 };
    const fees = { A: 4, B: 4 };
    const symbol = tokenSymbol ?? 'TST';

    function connect(wallet: ChromeWalletPage, sender: 'A' | 'B', receiver: 'A' | 'B') {
      jest.spyOn(wallet, 'claimAllNotes').mockResolvedValue(undefined);
      jest.spyOn(wallet, 'sendTokens').mockImplementation(async ({ amount }) => {
        balances[sender] -= Number(amount);
        balances[receiver] += Number(amount);
        fees[sender] -= 1;
      });
      jest.spyOn(wallet, 'quickBalanceSnapshot').mockImplementation(async opts => {
        const balance = opts?.symbol === symbol ? balances[sender] : balances[sender] + fees[sender];
        return {
          balance,
          pendingNotes: [],
          pendingSum: 0,
          totalReportable: balance,
          pendingTxCount: 0,
          unidentified: 0
        };
      });
    }
    connect(walletA, 'A', 'B');
    connect(walletB, 'B', 'A');

    const running = runStressDriver(
      { walletA, walletB, addressA: 'A', addressB: 'B', tokenSymbol },
      new TimelineRecorder('unused'),
      {
        numNotes: 2,
        delayMinMs: 0,
        delayMaxMs: 0,
        privateRatio: 0,
        sendAmountMin: 1,
        sendAmountMax: 1,
        claimAfterSendProb: 0,
        idleEvery: 0,
        idleMinMs: 0,
        idleMaxMs: 0,
        lockEvery: 0,
        reloadEvery: 0,
        concurrentProb: 0,
        perTurnSendTimeoutMs: 1_000,
        transportFailProb: 0,
        seed: 1
      }
    );

    await jest.runAllTimersAsync();
    const result = await running;
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.firstDivergenceOp).toBeNull();
    expect(balances.A + balances.B).toBe(20);
    expect(fees.A + fees.B).toBe(6);
  });
});
