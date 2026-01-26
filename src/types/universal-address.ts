/**
 * Universal Address Format
 *
 * A 32-byte hex format that normalizes addresses across different blockchain types:
 * - EVM addresses (20 bytes) are zero-padded to 32 bytes
 * - Solana addresses (32 bytes) are used directly
 *
 * This allows for consistent cross-chain address handling.
 */

/**
 * UniversalAddress - A branded type for 32-byte hex addresses
 * Format: 0x followed by 64 hex characters (32 bytes)
 */
export type UniversalAddress = string & { readonly __brand: 'UniversalAddress' };

/**
 * Check if a string is a valid UniversalAddress
 */
export function isUniversalAddress(value: string): value is UniversalAddress {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

/**
 * Convert a string to UniversalAddress (with validation)
 * @throws Error if string is not a valid 32-byte hex address
 */
export function toUniversalAddress(value: string): UniversalAddress {
  if (!isUniversalAddress(value)) {
    throw new Error(
      `Invalid UniversalAddress format: ${value}. Expected 0x followed by 64 hex characters.`
    );
  }
  return value;
}

/**
 * Pad an address to 32 bytes (zero-pad on the left)
 * Used for EVM addresses (20 bytes → 32 bytes)
 */
export function padTo32Bytes(address: string): UniversalAddress {
  // Remove 0x prefix if present
  const hex = address.startsWith('0x') ? address.slice(2) : address;

  // Pad to 64 characters (32 bytes)
  const padded = hex.padStart(64, '0');

  return toUniversalAddress(`0x${padded}`);
}

/**
 * Remove padding from a 32-byte address
 * Used when converting back to EVM addresses
 */
export function unpadFrom32Bytes(universal: UniversalAddress): string {
  // Remove 0x prefix
  const hex = universal.slice(2);

  // Remove leading zeros (but keep at least 1 character)
  const unpadded = hex.replace(/^0+/, '') || '0';

  // Add back 0x prefix
  return `0x${unpadded}`;
}
