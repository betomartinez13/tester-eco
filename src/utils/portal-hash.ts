/**
 * Portal Hash Utilities
 *
 * Functions for calculating intent hashes, route hashes, and reward hashes
 * following the Portal protocol specification.
 */

import { keccak256, encodePacked, type Hex } from 'viem';
import type { UniversalAddress } from '../types/universal-address.js';

/**
 * Reward structure for hash calculation
 */
export interface RewardForHash {
  deadline: string;
  creator: UniversalAddress;
  prover: UniversalAddress;
  nativeAmount: string;
  tokens: Array<{
    token: UniversalAddress;
    amount: string;
  }>;
}

/**
 * Calculate intent hash from source, destination, route, and reward
 *
 * intentHash = keccak256(abi.encodePacked(destination, routeHash, rewardHash))
 */
export function getIntentHashFromReward(
  source: bigint,
  destination: bigint,
  encodedRoute: Hex,
  reward: RewardForHash
): { intentHash: Hex; routeHash: Hex; rewardHash: Hex } {
  const routeHash = keccak256(encodedRoute);
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
 * Compute reward hash
 *
 * rewardHash = keccak256(abi.encode(source, reward))
 */
export function computeRewardHash(reward: RewardForHash, source: bigint): Hex {
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
