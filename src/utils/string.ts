export function truncateHash(hash: string, front = 7, back = 4): string {
  if (!hash) return '';
  return `${hash.slice(0, front)}…${hash.slice(-back)}`;
}

/**
 * Shortens an origin without hiding the hostname suffix that identifies the
 * requesting dApp. Keeping the scheme and the end is safer than CSS end
 * truncation, which can leave only attacker-controlled leading subdomains.
 */
export function truncateOrigin(origin: string, maxLength = 30): string {
  if (!origin || origin.length <= maxLength) return origin || '';

  const schemeEnd = origin.indexOf('://');
  const prefixLength = schemeEnd === -1 ? Math.max(1, Math.floor(maxLength / 3)) : schemeEnd + 3;
  const suffixLength = maxLength - prefixLength - 1;

  if (suffixLength < 1) return `${origin.slice(0, Math.max(1, maxLength - 1))}…`;
  return `${origin.slice(0, prefixLength)}…${origin.slice(-suffixLength)}`;
}

// mtst1aplqzwh6s4gvcyzsvx726y6xvsgt5qv5_qruqqypuyph -> mtst1a...5qv5...uyph
export function truncateAddress(address: string, includeBack = true, front = 6, middle = 4, back = 4): string {
  if (!address) return '';

  const underscoreIndex = address.indexOf('_');
  if (underscoreIndex === -1) return truncateHash(address, front, back);

  const frontPart = address.slice(0, front);
  const middlePart = address.slice(underscoreIndex - middle, underscoreIndex);

  if (includeBack) {
    const backPart = address.slice(-back);
    return `${frontPart}...${middlePart}...${backPart}`;
  }
  return `${frontPart}...${middlePart}`;
}

/**
 * Capitalizes the first letter of a string
 * @param str The string to capitalize
 * @returns The string with the first letter capitalized
 */
export const capitalizeFirstLetter = (str: string): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};
