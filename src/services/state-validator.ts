import type { Hash } from 'viem';
import type { IntentJourney, IntentState, IntentStateRecord } from '../types/intent.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('StateValidator');

const VALID_TRANSITIONS: Record<IntentState, IntentState[]> = {
  PUBLISHED: ['FUNDED', 'FAILED'],
  FUNDED: ['FULFILLED', 'FAILED'],
  FULFILLED: ['PROVEN', 'FAILED'],
  PROVEN: ['WITHDRAWN', 'FAILED'],
  WITHDRAWN: [],
  FAILED: [],
};

export class StateValidator {
  private journeys = new Map<Hash, IntentJourney>();

  /**
   * Initialize tracking for a new intent
   */
  initializeIntent(intentHash: Hash, source: string, dest: string): IntentJourney {
    const journey: IntentJourney = {
      intentHash,
      route: `${source}-${dest}`,
      states: [],
      currentState: 'PUBLISHED',
      isComplete: false,
    };
    this.journeys.set(intentHash, journey);
    log.info({ intentHash, route: journey.route }, 'Intent initialized');
    return journey;
  }

  /**
   * Record a state transition
   */
  recordState(intentHash: Hash, record: IntentStateRecord): boolean {
    const journey = this.journeys.get(intentHash);
    if (!journey) {
      log.error({ intentHash }, 'No journey found');
      return false;
    }

    const validNext = VALID_TRANSITIONS[journey.currentState];
    if (!validNext.includes(record.state)) {
      log.error(
        { intentHash, from: journey.currentState, to: record.state },
        'Invalid state transition'
      );
      return false;
    }

    journey.states.push(record);
    journey.currentState = record.state;
    journey.isComplete = record.state === 'WITHDRAWN' || record.state === 'FAILED';

    log.info(
      { intentHash, state: record.state, isComplete: journey.isComplete },
      'State recorded'
    );
    return true;
  }

  /**
   * Mark intent as failed with error message
   */
  markFailed(intentHash: Hash, error: string): void {
    const journey = this.journeys.get(intentHash);
    if (journey) {
      journey.error = error;
      journey.isComplete = true;
      this.recordState(intentHash, { state: 'FAILED', timestamp: new Date() });
    }
  }

  /**
   * Get journey for an intent
   */
  getJourney(intentHash: Hash): IntentJourney | undefined {
    return this.journeys.get(intentHash);
  }

  /**
   * Get all journeys
   */
  getAllJourneys(): IntentJourney[] {
    return Array.from(this.journeys.values());
  }

  /**
   * Clear all tracked journeys
   */
  clear(): void {
    this.journeys.clear();
  }
}

export function getStateValidator(): StateValidator {
  return new StateValidator();
}
