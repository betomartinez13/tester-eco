import type { Address } from 'viem';

/**
 * Contract addresses are NOT hardcoded.
 * They come dynamically from the solver's quote response.
 * See Phase 3: solver-client.ts for QuoteV2Response interface.
 */
export interface ContractAddresses {
  sourcePortal: Address;
  destinationPortal: Address;
  prover: Address;
}

/**
 * Events from IInbox.sol (destination chain)
 * IntentFulfilled: emitted when solver fulfills an intent
 */
export const INBOX_ABI = [
  {
    type: 'event',
    name: 'IntentFulfilled',
    inputs: [
      { name: 'intentHash', type: 'bytes32', indexed: true },
      { name: 'claimant', type: 'bytes32', indexed: true },
    ],
  },
] as const;

/**
 * Events from IProver.sol (source chain)
 * IntentProven: emitted when intent proof is verified on source chain
 */
export const PROVER_ABI = [
  {
    type: 'event',
    name: 'IntentProven',
    inputs: [
      { name: 'intentHash', type: 'bytes32', indexed: true },
      { name: 'claimant', type: 'address', indexed: true },
      { name: 'destination', type: 'uint64', indexed: false },
    ],
  },
] as const;

/**
 * Events from IIntentSource.sol (source chain)
 * IntentWithdrawn: emitted when solver claims rewards
 */
export const INTENT_SOURCE_ABI = [
  {
    type: 'event',
    name: 'IntentWithdrawn',
    inputs: [
      { name: 'intentHash', type: 'bytes32', indexed: false },
      { name: 'claimant', type: 'address', indexed: true },
    ],
  },
] as const;
