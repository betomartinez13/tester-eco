/**
 * Solana SVM Publisher Types
 *
 * Type definitions for Solana intent publishing operations.
 */

import type { Keypair, Connection } from '@solana/web3.js';
import type { Hash } from 'viem';

/**
 * Context for publishing Solana intent
 * Contains all data needed for transaction building
 */
export interface PublishContext {
  connection: Connection;
  keypair: Keypair;
  intentHash: Hash;
  routeHash: Hash;
  rewardHash: Hash;
  destination: bigint;
  encodedRoute: string;
  reward: {
    deadline: bigint;
    creator: string;
    prover: string;
    nativeAmount: string;
    tokens: Array<{
      token: string;
      amount: string;
    }>;
  };
  portalAddress: string;
}

/**
 * Result from transaction submission
 */
export interface TransactionResult {
  success: boolean;
  signature: string;
  intentHash?: Hash;
}

/**
 * Error types for Solana operations
 */
export enum SvmErrorType {
  INVALID_KEY = 'INVALID_KEY',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  CONFIRMATION_TIMEOUT = 'CONFIRMATION_TIMEOUT',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  TOKEN_ACCOUNT_ERROR = 'TOKEN_ACCOUNT_ERROR',
  EVENT_EXTRACTION_FAILED = 'EVENT_EXTRACTION_FAILED',
}

/**
 * Custom error class for Solana operations
 */
export class SvmError extends Error {
  constructor(
    public type: SvmErrorType,
    message: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'SvmError';
  }
}

/**
 * Decoded IntentPublished event from Solana transaction
 */
export interface DecodedIntentPublished {
  intentHash: string;
  destination: string;
  route: string;
  reward: {
    deadline: string;
    creator: string;
    prover: string;
    nativeAmount: string;
    tokens: Array<{
      token: string;
      amount: string;
    }>;
  };
}
