/**
 * Borsh Converter Utilities
 *
 * Converts Intent data structures to Borsh-compatible format for Solana encoding.
 */

import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';
import type { Hex } from 'viem';
import { AddressNormalizer } from './address-normalizer.js';
import { ChainType } from '../types/chain.js';

/**
 * Reward structure for Borsh encoding
 */
export interface BorshReward {
  deadline: BN;
  creator: PublicKey;
  prover: PublicKey;
  native_amount: BN;
  tokens: Array<{
    token: PublicKey;
    amount: BN;
  }>;
}

/**
 * Route structure for Borsh encoding
 */
export interface BorshRoute {
  salt: { 0: number[] };
  deadline: BN;
  native_amount: BN;
  portal: { 0: number[] };
  tokens: Array<{
    token: PublicKey;
    amount: BN;
  }>;
  calls: Array<{
    target: { 0: number[] };
    data: Buffer;
  }>;
}

/**
 * Convert hex string to Buffer
 */
function hexToBuffer(hex: Hex): Buffer {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Buffer.from(cleanHex, 'hex');
}

/**
 * Convert Bytes32 hex to 32-byte array
 */
function hexToBytes32Array(hex: Hex): number[] {
  const buffer = hexToBuffer(hex);
  if (buffer.length !== 32) {
    throw new Error(`Expected 32 bytes, got ${buffer.length}`);
  }
  return Array.from(buffer);
}

/**
 * Convert reward to Borsh-compatible format
 */
export function toBorshReward(reward: {
  deadline: string;
  creator: string;
  prover: string;
  nativeAmount: string;
  tokens: Array<{
    token: string;
    amount: string;
  }>;
}): BorshReward {
  return {
    deadline: new BN(reward.deadline),
    creator: new PublicKey(AddressNormalizer.denormalize(reward.creator as any, ChainType.SVM)),
    prover: new PublicKey(AddressNormalizer.denormalize(reward.prover as any, ChainType.SVM)),
    native_amount: new BN(reward.nativeAmount),
    tokens: reward.tokens.map((t) => ({
      token: new PublicKey(AddressNormalizer.denormalize(t.token as any, ChainType.SVM)),
      amount: new BN(t.amount),
    })),
  };
}

/**
 * Convert route to Borsh-compatible format
 * Note: Routes include additional fields like salt, portal, and calls
 */
export function toBorshRoute(route: {
  salt: Hex;
  deadline: string;
  portal: string;
  nativeAmount: string;
  tokens: Array<{
    token: string;
    amount: string;
  }>;
  calls: Array<{
    target: string;
    data: Hex;
    value?: string;
  }>;
}): BorshRoute {
  return {
    salt: { 0: hexToBytes32Array(route.salt) },
    deadline: new BN(route.deadline),
    native_amount: new BN(route.nativeAmount),
    portal: {
      0: Array.from(
        new PublicKey(AddressNormalizer.denormalize(route.portal as any, ChainType.SVM)).toBytes()
      ),
    },
    tokens: route.tokens.map((t) => ({
      token: new PublicKey(AddressNormalizer.denormalize(t.token as any, ChainType.SVM)),
      amount: new BN(t.amount),
    })),
    calls: route.calls.map((c) => ({
      target: {
        0: Array.from(
          new PublicKey(AddressNormalizer.denormalize(c.target as any, ChainType.SVM)).toBytes()
        ),
      },
      data: hexToBuffer(c.data),
    })),
  };
}
