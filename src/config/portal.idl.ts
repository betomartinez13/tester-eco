/**
 * Portal Program IDL (Interface Definition Language)
 *
 * Simplified IDL for Solana Portal program interactions.
 * Contains only the fund instruction and IntentPublished event
 * that we need for publishing intents.
 */

import type { Idl } from '@coral-xyz/anchor';

/**
 * Get Portal program IDL with the provided program address
 * Note: Portal address comes from solver API quote response
 */
export function getPortalIdl(programAddress: string): Idl {
  return {
    address: programAddress,
    metadata: {
      name: 'portal',
      version: '0.1.0',
      spec: '0.1.0',
      description: 'Portal program for cross-chain intents',
    },
    instructions: [
      {
        name: 'fund',
        discriminator: [218, 188, 111, 221, 152, 113, 174, 7],
        accounts: [
          { name: 'payer', signer: true },
          { name: 'funder', writable: true, signer: true },
          { name: 'vault', writable: true },
          { name: 'token_program', address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { name: 'token_2022_program', address: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' },
          { name: 'associated_token_program', address: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' },
          { name: 'system_program', address: '11111111111111111111111111111111' },
        ],
        args: [
          {
            name: 'args',
            type: { defined: { name: 'FundArgs' } },
          },
        ],
      },
      {
        name: 'publish',
        discriminator: [129, 177, 182, 160, 184, 224, 219, 5],
        accounts: [],
        args: [
          {
            name: 'args',
            type: { defined: { name: 'PublishArgs' } },
          },
        ],
      },
    ],
    events: [
      {
        name: 'IntentPublished',
        discriminator: [194, 169, 103, 197, 21, 235, 236, 166],
      },
      {
        name: 'IntentFunded',
        discriminator: [14, 106, 10, 45, 124, 28, 211, 173],
      },
    ],
    errors: [],
    types: [
      {
        name: 'Bytes32',
        type: {
          kind: 'struct',
          fields: [{ array: ['u8', 32] }],
        },
      },
      {
        name: 'FundArgs',
        type: {
          kind: 'struct',
          fields: [
            { name: 'destination', type: 'u64' },
            { name: 'route_hash', type: { defined: { name: 'Bytes32' } } },
            { name: 'reward', type: { defined: { name: 'Reward' } } },
            { name: 'allow_partial', type: 'bool' },
          ],
        },
      },
      {
        name: 'PublishArgs',
        type: {
          kind: 'struct',
          fields: [
            { name: 'destination', type: 'u64' },
            { name: 'route', type: 'bytes' },
            { name: 'reward', type: { defined: { name: 'Reward' } } },
          ],
        },
      },
      {
        name: 'Reward',
        type: {
          kind: 'struct',
          fields: [
            { name: 'deadline', type: 'u64' },
            { name: 'creator', type: 'pubkey' },
            { name: 'prover', type: 'pubkey' },
            { name: 'native_amount', type: 'u64' },
            { name: 'tokens', type: { vec: { defined: { name: 'TokenAmount' } } } },
          ],
        },
      },
      {
        name: 'TokenAmount',
        type: {
          kind: 'struct',
          fields: [
            { name: 'token', type: 'pubkey' },
            { name: 'amount', type: 'u64' },
          ],
        },
      },
      {
        name: 'IntentPublished',
        type: {
          kind: 'struct',
          fields: [
            { name: 'intent_hash', type: { defined: { name: 'Bytes32' } } },
            { name: 'destination', type: 'u64' },
            { name: 'route', type: 'bytes' },
            { name: 'reward', type: { defined: { name: 'Reward' } } },
          ],
        },
      },
      {
        name: 'IntentFunded',
        type: {
          kind: 'struct',
          fields: [
            { name: 'intent_hash', type: { defined: { name: 'Bytes32' } } },
            { name: 'funder', type: 'pubkey' },
            { name: 'complete', type: 'bool' },
          ],
        },
      },
    ],
  } as const;
}

/**
 * Helper to convert hex string to Bytes32 array
 */
export function hexToBytes32Array(hex: string): number[] {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = [];
  for (let i = 0; i < 64; i += 2) {
    bytes.push(parseInt(cleanHex.substr(i, 2), 16));
  }
  return bytes;
}

/**
 * Helper to convert Bytes32 array to hex string
 */
export function bytes32ArrayToHex(bytes: number[] | Uint8Array): string {
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex}`;
}
