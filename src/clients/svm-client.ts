/**
 * Solana (SVM) Client
 *
 * Handles Solana blockchain interactions including connection management,
 * keypair parsing, and basic operations like balance checks.
 */

import { Connection, Keypair, PublicKey, type ConnectionConfig } from '@solana/web3.js';
import bs58 from 'bs58';
import { getConfig } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('SvmClient');

// Connection configuration for Solana
const CONNECTION_CONFIG: ConnectionConfig = {
  commitment: 'finalized', // Wait for finalized commitment for consistency with EVM
  confirmTransactionInitialTimeout: 60000, // 60 second timeout
};

// Cache connection to avoid creating multiple instances
let connectionCache: Connection | null = null;

/**
 * Get Solana connection instance
 * Uses finalized commitment level for consistency
 */
export function getSolanaConnection(): Connection {
  if (!connectionCache) {
    const config = getConfig();
    connectionCache = new Connection(config.solanaRpcUrl, CONNECTION_CONFIG);
    log.info(`Connected to Solana RPC: ${config.solanaRpcUrl}`);
  }
  return connectionCache;
}

/**
 * Parse Solana private key from multiple formats
 *
 * Supported formats:
 * - Base58: '5Jd7F...' (default Solana format)
 * - JSON array: '[1,2,3,...]' (64 numbers)
 * - Comma-separated: '1,2,3,...' (64 numbers)
 *
 * @param privateKey - Private key in any supported format
 * @returns Keypair instance
 */
export function parseSolanaPrivateKey(privateKey: string): Keypair {
  try {
    // Array format: [1,2,3,...]
    if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
      const bytes = JSON.parse(privateKey);
      if (!Array.isArray(bytes) || bytes.length !== 64) {
        throw new Error('Private key array must contain exactly 64 bytes');
      }
      return Keypair.fromSecretKey(new Uint8Array(bytes));
    }

    // Comma-separated format: 1,2,3,...
    if (privateKey.includes(',')) {
      const bytes = privateKey.split(',').map(b => parseInt(b.trim(), 10));
      if (bytes.length !== 64) {
        throw new Error('Private key must contain exactly 64 bytes');
      }
      if (bytes.some(isNaN)) {
        throw new Error('Invalid byte values in private key');
      }
      return Keypair.fromSecretKey(new Uint8Array(bytes));
    }

    // Base58 format (default)
    const bytes = bs58.decode(privateKey);
    if (bytes.length !== 64) {
      throw new Error('Private key must be 64 bytes');
    }
    return Keypair.fromSecretKey(bytes);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse Solana private key: ${errorMsg}`);
  }
}

/**
 * Get Solana keypair from configuration
 * Uses SOLANA_PRIVATE_KEY if available, otherwise attempts to derive from PRIVATE_KEY
 */
export function getSolanaKeypair(): Keypair {
  const config = getConfig();

  // Prefer dedicated Solana private key
  if (config.solanaPrivateKey) {
    return parseSolanaPrivateKey(config.solanaPrivateKey);
  }

  // Fallback: try to use EVM private key if it's in a compatible format
  // (This is unlikely to work but provides a helpful error message)
  throw new Error(
    'SOLANA_PRIVATE_KEY not found in environment. Please set SOLANA_PRIVATE_KEY with your Solana private key in Base58 format.'
  );
}

/**
 * Get SOL balance for an address
 * @param address - Public key or address string
 * @returns Balance in lamports (1 SOL = 1,000,000,000 lamports)
 */
export async function getSolanaBalance(address: string | PublicKey): Promise<bigint> {
  try {
    const connection = getSolanaConnection();
    const publicKey = typeof address === 'string' ? new PublicKey(address) : address;
    const balance = await connection.getBalance(publicKey);
    return BigInt(balance);
  } catch (error) {
    log.error({ address, error }, 'Failed to get Solana balance');
    return 0n;
  }
}

/**
 * Get SPL token balance for an address
 * @param walletAddress - Wallet public key
 * @param tokenMintAddress - SPL token mint address (e.g., USDC)
 * @returns Token balance in smallest unit
 */
export async function getSplTokenBalance(
  walletAddress: string | PublicKey,
  tokenMintAddress: string | PublicKey
): Promise<bigint> {
  try {
    const connection = getSolanaConnection();
    const walletPubkey = typeof walletAddress === 'string' ? new PublicKey(walletAddress) : walletAddress;
    const mintPubkey = typeof tokenMintAddress === 'string' ? new PublicKey(tokenMintAddress) : tokenMintAddress;

    // Get token accounts owned by wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
      mint: mintPubkey,
    });

    if (tokenAccounts.value.length === 0) {
      // No token account exists yet
      return 0n;
    }

    // Return balance from first token account
    const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount;
    return BigInt(balance);
  } catch (error) {
    log.error({ walletAddress, tokenMintAddress, error }, 'Failed to get SPL token balance');
    return 0n;
  }
}

/**
 * Test connection to Solana RPC
 * @returns true if connection successful
 */
export async function testSolanaConnection(): Promise<boolean> {
  try {
    const connection = getSolanaConnection();
    const slot = await connection.getSlot();
    log.info(`Solana connection test successful. Current slot: ${slot}`);
    return true;
  } catch (error) {
    log.error({ error }, 'Solana connection test failed');
    return false;
  }
}
