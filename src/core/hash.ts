// Shared hash utility — lightweight string hashing for fingerprints and event IDs
// No DOM, no Node.js APIs — pure function.

/**
 * Simple string hash returning a base-36 string.
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
