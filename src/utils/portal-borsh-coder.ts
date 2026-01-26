/**
 * Portal Borsh Coder
 *
 * Provides Borsh encoding/decoding for Solana Portal program data structures.
 * Uses Anchor's BorshCoder with the Portal IDL.
 */

import { BorshCoder, Idl } from '@coral-xyz/anchor';
import { getPortalIdl } from '../config/portal.idl.js';

// Create a Borsh coder instance using the Portal IDL
// Note: Using a placeholder program address since we only need the type definitions
const PLACEHOLDER_PROGRAM_ID = '11111111111111111111111111111111';

let borshCoderCache: BorshCoder | null = null;

/**
 * Get or create Borsh coder instance
 */
export function getPortalBorshCoder(): BorshCoder {
  if (!borshCoderCache) {
    const idl = getPortalIdl(PLACEHOLDER_PROGRAM_ID);
    borshCoderCache = new BorshCoder(idl as Idl);
  }
  return borshCoderCache;
}
