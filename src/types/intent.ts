import type { Hash, Address } from 'viem';
import type { SupportedChainName } from '../config/chains.js';

export type IntentState =
  | 'PUBLISHED'
  | 'FUNDED'
  | 'FULFILLED'
  | 'PROVEN'
  | 'WITHDRAWN'
  | 'FAILED';

export interface IntentData {
  sourceChain: SupportedChainName;
  destinationChain: SupportedChainName;
  token: string;
  amount: string;
  reward: string;
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
