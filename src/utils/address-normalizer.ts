/**
 * Address Normalizer
 *
 * Provides bidirectional conversion between chain-native address formats
 * and the universal 32-byte hex format.
 *
 * Supports:
 * - EVM: 20-byte hex addresses (0x...)
 * - SVM: 32-byte base58 addresses (Solana)
 */

import { PublicKey } from '@solana/web3.js';
import { Address } from 'viem';
import { ChainType } from '../types/chain.js';
import {
  UniversalAddress,
  padTo32Bytes,
  unpadFrom32Bytes,
  toUniversalAddress,
} from '../types/universal-address.js';

// Chain-specific address types
export type EvmAddress = Address; // from viem (20 bytes)
export type SvmAddress = string; // base58 format (32 bytes)
export type BlockchainAddress = EvmAddress | SvmAddress;

/**
 * AddressNormalizer
 *
 * Converts between chain-native formats and UniversalAddress
 */
export class AddressNormalizer {
  /**
   * Normalize: chain-native → UniversalAddress
   *
   * @param address - Address in chain-native format
   * @param chainType - Type of blockchain (EVM or SVM)
   * @returns 32-byte hex UniversalAddress
   */
  static normalize(address: BlockchainAddress, chainType: ChainType): UniversalAddress {
    switch (chainType) {
      case ChainType.EVM:
        return this.normalizeEvm(address as EvmAddress);
      case ChainType.SVM:
        return this.normalizeSvm(address as SvmAddress);
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  /**
   * Denormalize: UniversalAddress → chain-native
   *
   * @param address - UniversalAddress (32-byte hex)
   * @param chainType - Target chain type
   * @returns Address in chain-native format
   */
  static denormalize(address: UniversalAddress, chainType: ChainType): BlockchainAddress {
    switch (chainType) {
      case ChainType.EVM:
        return this.denormalizeToEvm(address);
      case ChainType.SVM:
        return this.denormalizeToSvm(address);
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  /**
   * Normalize EVM address (20 bytes → 32 bytes)
   * Example: 0x742d35Cc... (40 chars) → 0x000000000000000000000000742d35cc... (64 chars)
   */
  static normalizeEvm(address: EvmAddress): UniversalAddress {
    // Validate EVM address format
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error(`Invalid EVM address format: ${address}`);
    }

    // Pad to 32 bytes
    return padTo32Bytes(address);
  }

  /**
   * Normalize Solana address (base58 → 32-byte hex)
   * Example: EPjFWdd5... → 0x06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9
   */
  static normalizeSvm(address: SvmAddress): UniversalAddress {
    try {
      // Convert base58 to PublicKey
      const publicKey = new PublicKey(address);

      // Get 32-byte array
      const bytes = publicKey.toBytes();

      // Convert to hex string
      const hex = Buffer.from(bytes).toString('hex');

      // Already 32 bytes, just add 0x prefix
      return toUniversalAddress(`0x${hex}`);
    } catch (error) {
      throw new Error(`Invalid Solana address format: ${address}. ${error instanceof Error ? error.message : ''}`);
    }
  }

  /**
   * Denormalize to EVM address (32 bytes → 20 bytes)
   * Removes zero-padding to get original 20-byte address
   */
  static denormalizeToEvm(address: UniversalAddress): EvmAddress {
    // Remove padding
    const unpaddedHex = unpadFrom32Bytes(address);

    // Ensure it's 20 bytes (40 hex chars + 0x)
    if (unpaddedHex.length !== 42) {
      // Pad to 20 bytes if needed
      const hex = unpaddedHex.slice(2);
      const padded = hex.padStart(40, '0');
      return `0x${padded}` as EvmAddress;
    }

    return unpaddedHex as EvmAddress;
  }

  /**
   * Denormalize to Solana address (32-byte hex → base58)
   */
  static denormalizeToSvm(address: UniversalAddress): SvmAddress {
    try {
      // Remove 0x prefix
      const hex = address.slice(2);

      // Convert hex to bytes
      const bytes = Buffer.from(hex, 'hex');

      // Create PublicKey from bytes
      const publicKey = new PublicKey(bytes);

      // Return base58 string
      return publicKey.toBase58();
    } catch (error) {
      throw new Error(`Failed to denormalize to Solana address: ${address}. ${error instanceof Error ? error.message : ''}`);
    }
  }

  /**
   * Validate address format for a specific chain type
   */
  static isValidAddressForChain(address: string, chainType: ChainType): boolean {
    try {
      switch (chainType) {
        case ChainType.EVM:
          return /^0x[a-fA-F0-9]{40}$/.test(address);
        case ChainType.SVM:
          // Try to create PublicKey - will throw if invalid
          new PublicKey(address);
          return true;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }
}
