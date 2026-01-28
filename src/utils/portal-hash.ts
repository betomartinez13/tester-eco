/**
 * Portal Hash Utilities
 *
 * Functions for calculating intent hashes, route hashes, and reward hashes
 * following the Portal protocol specification with chain-specific encoding.
 *
 * CRITICAL: Encoding must be chain-specific:
 * - EVM chains (Optimism, Base, Arbitrum): ABI encoding
 * - Solana (SVM): Borsh serialization
 */

import { keccak256, encodePacked, encodeAbiParameters, type Hex } from 'viem';
import type { UniversalAddress } from '../types/universal-address.js';
import { ChainType } from '../types/chain.js';
import { getChainConfig } from '../config/chains.js';
import { getPortalBorshCoder } from './portal-borsh-coder.js';
import { toBorshReward, type BorshReward } from './borsh-converter.js';

/**
 * Reward structure for hash calculation
 */
export interface RewardForHash {
  deadline: string | bigint;
  creator: UniversalAddress;
  prover: UniversalAddress;
  nativeAmount: string;
  tokens: Array<{
    token: UniversalAddress;
    amount: string;
  }>;
}

/**
 * Detect chain type from chain ID
 */
function getChainType(chainId: bigint): ChainType {
  // Solana chain ID
  if (chainId === 1399811149n) {
    return ChainType.SVM;
  }
  // Default to EVM for other chains
  return ChainType.EVM;
}

/**
 * Calculate intent hash from source, destination, route, and reward
 *
 * intentHash = keccak256(abi.encodePacked(destination, routeHash, rewardHash))
 *
 * @param source - Source chain ID
 * @param destination - Destination chain ID
 * @param encodedRoute - Encoded route data (from solver)
 * @param reward - Reward structure
 */
export function getIntentHashFromReward(
  source: bigint,
  destination: bigint,
  encodedRoute: Hex,
  reward: RewardForHash
): { intentHash: Hex; routeHash: Hex; rewardHash: Hex } {
  // routeHash is always keccak256 of the encoded route (from solver)
  const routeHash = keccak256(encodedRoute);

  // rewardHash uses source chain encoding
  const rewardHash = computeRewardHash(reward, source);

  // intentHash = keccak256(abi.encodePacked(destination, routeHash, rewardHash))
  const intentHash = keccak256(
    encodePacked(
      ['uint64', 'bytes32', 'bytes32'],
      [destination, routeHash, rewardHash]
    )
  );

  return { intentHash, routeHash, rewardHash };
}

/**
 * Compute reward hash using chain-specific encoding
 *
 * For EVM: rewardHash = keccak256(abi.encode(source, reward))
 * For SVM: rewardHash = keccak256(borsh.encode(reward))
 *
 * @param reward - Reward data structure
 * @param sourceChainId - Source chain ID to determine encoding type
 */
export function computeRewardHash(reward: RewardForHash, sourceChainId: bigint): Hex {
  const chainType = getChainType(sourceChainId);

  if (chainType === ChainType.SVM) {
    // Solana: Use Borsh encoding
    return computeRewardHashSvm(reward);
  } else {
    // EVM: Use ABI encoding
    return computeRewardHashEvm(reward, sourceChainId);
  }
}

/**
 * Compute reward hash for EVM chains using ABI encoding
 */
function computeRewardHashEvm(reward: RewardForHash, source: bigint): Hex {
  // Encode token array
  const tokenHashes = reward.tokens.map(token => {
    return keccak256(
      encodePacked(
        ['bytes32', 'uint256'],
        [token.token as Hex, BigInt(token.amount)]
      )
    );
  });

  // Combine all token hashes
  const tokensHash = tokenHashes.length > 0
    ? keccak256(encodePacked(['bytes32[]'], [tokenHashes]))
    : keccak256('0x');

  // Full reward encoding: (source, deadline, creator, prover, nativeAmount, tokensHash)
  return keccak256(
    encodePacked(
      ['uint64', 'uint64', 'bytes32', 'bytes32', 'uint256', 'bytes32'],
      [
        source,
        BigInt(reward.deadline),
        reward.creator as Hex,
        reward.prover as Hex,
        BigInt(reward.nativeAmount),
        tokensHash,
      ]
    )
  );
}

/**
 * Compute reward hash for Solana using Borsh encoding
 */
function computeRewardHashSvm(reward: RewardForHash): Hex {
  // Convert to Borsh-compatible format
  const borshReward: BorshReward = toBorshReward(reward);

  // Encode using Anchor's Borsh coder
  const coder = getPortalBorshCoder();
  const encoded = coder.types.encode('Reward', borshReward);

  // Hash the Borsh-encoded data
  const hex = '0x' + Buffer.from(encoded).toString('hex');
  return keccak256(hex as Hex);
}
