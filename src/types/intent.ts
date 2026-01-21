import type { Hash, Address, Hex } from 'viem';
import type { SupportedChainName } from '../config/chains.js';

export type IntentState =
  | 'PUBLISHED'
  | 'FUNDED'
  | 'FULFILLED'
  | 'PROVEN'
  | 'WITHDRAWN'
  | 'FAILED';

/**
 * Quote data from solver - fetched before publishing intent
 */
export interface QuoteData {
  sourceAmount: string;
  destinationAmount: string;
  encodedRoute: Hex;
  deadline: number;
  contracts: {
    sourcePortal: Address;
    destinationPortal: Address;
    prover: Address;
  };
}

/**
 * Complete intent data including quote information
 * Note: Quote must be fetched BEFORE creating IntentData
 */
export interface IntentData {
  sourceChain: SupportedChainName;
  destinationChain: SupportedChainName;
  sourceToken: Address;
  destinationToken: Address;
  funder: Address;
  recipient: Address;
  quote: QuoteData;
}

export interface IntentStateRecord {
  state: IntentState;
  timestamp: Date;
  txHash?: Hash;
  blockNumber?: bigint;
  solver?: Address;
}

export interface IntentJourney {
  intentHash: Hash;
  route: string;
  states: IntentStateRecord[];
  currentState: IntentState;
  isComplete: boolean;
  error?: string;
}
