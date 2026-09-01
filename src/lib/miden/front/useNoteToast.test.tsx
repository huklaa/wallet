/* eslint-disable import/first */

import { renderHook, waitFor } from '@testing-library/react';

const _g = globalThis as any;
_g.__noteToastTest = {
  claimableNotes: [] as Array<{ id: string }>,
  isExtension: false,
  isMobile: false
};

_g.__noteToastTest.checkForNewNotes = jest.fn();

jest.mock('lib/store', () => {
  const fn = (selector?: any) => {
    const state = {
      checkForNewNotes: (globalThis as any).__noteToastTest.checkForNewNotes,
      seenNoteIds: new Set<string>()
    };
    return selector ? selector(state) : state;
  };
  (fn as any).getState = () => ({
    seenNoteIds: new Set<string>(),
    checkForNewNotes: (globalThis as any).__noteToastTest.checkForNewNotes
  });
  (fn as any).setState = jest.fn();
  return { useWalletStore: fn };
});

const mockCheckForNewNotes = _g.__noteToastTest.checkForNewNotes;
const mockClearNoteReceivedNotification = jest.fn();

jest.mock('lib/platform', () => ({
  isExtension: () => (globalThis as any).__noteToastTest.isExtension,
  isMobile: () => (globalThis as any).__noteToastTest.isMobile
}));

jest.mock('lib/mobile/native-notifications', () => ({
  clearNoteReceivedNotification: (...args: unknown[]) => mockClearNoteReceivedNotification(...args)
}));

jest.mock('./claimable-notes', () => ({
  useClaimableNotes: () => ({
    data: (globalThis as any).__noteToastTest.claimableNotes
  })
}));

const mockGetPersistedSeenNoteIds = jest.fn();
const mockPersistSeenNoteIds = jest.fn();
jest.mock('lib/miden/back/note-checker-storage', () => ({
  getPersistedSeenNoteIds: () => mockGetPersistedSeenNoteIds(),
  persistSeenNoteIds: (...args: unknown[]) => mockPersistSeenNoteIds(...args)
}));

import { useNoteToastMonitor } from './useNoteToast';

beforeEach(() => {
  mockCheckForNewNotes.mockReset();
  mockClearNoteReceivedNotification.mockReset().mockResolvedValue(undefined);
  mockGetPersistedSeenNoteIds.mockReset().mockResolvedValue(new Set<string>());
  mockPersistSeenNoteIds.mockReset().mockResolvedValue(undefined);
  _g.__noteToastTest.isExtension = false;
  _g.__noteToastTest.isMobile = false;
  _g.__noteToastTest.claimableNotes = [];
});

describe('useNoteToastMonitor', () => {
  it('does nothing on first fetch (seeds seen notes silently)', async () => {
    _g.__noteToastTest.claimableNotes = [{ id: 'n1' }];
    renderHook(() => useNoteToastMonitor('pk-1'));
    await waitFor(() => {
      expect(mockCheckForNewNotes).not.toHaveBeenCalled();
    });
  });

  it('clears a stale native notification when the authoritative set is empty', async () => {
    _g.__noteToastTest.isMobile = true;
    renderHook(() => useNoteToastMonitor('pk-1'));
    await waitFor(() => {
      expect(mockClearNoteReceivedNotification).toHaveBeenCalledTimes(1);
    });
  });

  it('skips when enabled is false', async () => {
    _g.__noteToastTest.claimableNotes = [{ id: 'n1' }];
    renderHook(() => useNoteToastMonitor('pk-1', false));
    await waitFor(() => {
      expect(mockCheckForNewNotes).not.toHaveBeenCalled();
    });
  });

  it('hydrates from persisted IDs in extension mode', async () => {
    _g.__noteToastTest.isExtension = true;
    mockGetPersistedSeenNoteIds.mockResolvedValueOnce(new Set(['old-1']));
    renderHook(() => useNoteToastMonitor('pk-1'));
    await waitFor(() => {
      expect(mockGetPersistedSeenNoteIds).toHaveBeenCalled();
    });
  });

  it('does not hydrate on non-extension', async () => {
    _g.__noteToastTest.isExtension = false;
    renderHook(() => useNoteToastMonitor('pk-1'));
    await waitFor(() => {
      expect(mockGetPersistedSeenNoteIds).not.toHaveBeenCalled();
    });
  });
});
