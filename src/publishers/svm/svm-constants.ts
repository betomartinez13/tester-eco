/**
 * Solana SVM Publisher Constants
 *
 * Configuration constants, error messages, and connection settings
 * for Solana intent publishing.
 */

import type { ConnectionConfig } from '@solana/web3.js';

/**
 * Solana connection configuration
 * Uses 'finalized' commitment for consistency with EVM finality
 */
export const SVM_CONNECTION_CONFIG: ConnectionConfig = {
  commitment: 'finalized',
  disableRetryOnRateLimit: true,
  wsEndpoint: undefined,
  confirmTransactionInitialTimeout: 60000, // 60 seconds
};

/**
 * Transaction confirmation configuration
 */
export const SVM_CONFIRMATION_CONFIG = {
  DEFAULT_COMMITMENT: 'finalized' as const,
  MAX_CONFIRMATION_RETRIES: 30,
  CONFIRMATION_POLLING_INTERVAL_MS: 1000,
  PREFLIGHT_COMMITMENT: 'confirmed' as const,
  SKIP_PREFLIGHT: false,
  MAX_SEND_RETRIES: 3,
};

/**
 * Error messages for Solana operations
 */
export const SVM_ERROR_MESSAGES = {
  INVALID_PRIVATE_KEY: 'Invalid Solana private key format',
  KEYPAIR_PARSE_FAILED: 'Failed to parse Solana private key',
  CONNECTION_FAILED: 'Failed to connect to Solana RPC',
  TRANSACTION_FAILED: 'Transaction execution failed',
  FUNDING_FAILED: 'Intent funding transaction failed',
  CONFIRMATION_TIMEOUT: (retries: number) =>
    `Transaction confirmation timeout after ${retries} attempts`,
  INSUFFICIENT_BALANCE: 'Insufficient SOL balance for transaction',
  TOKEN_ACCOUNT_CREATE_FAILED: 'Failed to create Associated Token Account',
  EVENT_EXTRACTION_FAILED: 'Failed to extract IntentPublished event from transaction',
  PORTAL_ADDRESS_MISSING: 'Portal address not provided',
};

/**
 * Log messages for Solana operations
 */
export const SVM_LOG_MESSAGES = {
  PUBLISHING_INTENT: 'Publishing and funding Solana intent...',
  FUNDING_INTENT: 'Funding Solana intent...',
  FUNDING_CONFIRMED: 'Intent funding confirmed on Solana',
  TX_SIGNATURE: (signature: string) => `Transaction signature: ${signature}`,
  TX_CONFIRMED: (status: string) => `Transaction confirmed with status: ${status}`,
};
