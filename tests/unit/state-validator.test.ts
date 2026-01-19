import { StateValidator } from '../../src/services/state-validator.js';
import type { Hash } from 'viem';

describe('StateValidator', () => {
  let validator: StateValidator;
  const testHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hash;

  beforeEach(() => {
    validator = new StateValidator();
  });

  describe('initializeIntent', () => {
    it('should create a new journey', () => {
      const journey = validator.initializeIntent(testHash, 'optimism', 'base');

      expect(journey.intentHash).toBe(testHash);
      expect(journey.route).toBe('optimism-base');
      expect(journey.currentState).toBe('PUBLISHED');
      expect(journey.isComplete).toBe(false);
    });
  });

  describe('recordState', () => {
    it('should allow valid transitions', () => {
      validator.initializeIntent(testHash, 'optimism', 'base');

      expect(validator.recordState(testHash, { state: 'FUNDED', timestamp: new Date() })).toBe(true);
      expect(validator.recordState(testHash, { state: 'FULFILLED', timestamp: new Date() })).toBe(true);
      expect(validator.recordState(testHash, { state: 'PROVEN', timestamp: new Date() })).toBe(true);
      expect(validator.recordState(testHash, { state: 'WITHDRAWN', timestamp: new Date() })).toBe(true);

      const journey = validator.getJourney(testHash);
      expect(journey?.isComplete).toBe(true);
      expect(journey?.currentState).toBe('WITHDRAWN');
    });

    it('should reject invalid transitions', () => {
      validator.initializeIntent(testHash, 'optimism', 'base');

      // Can't skip from PUBLISHED to PROVEN
      expect(validator.recordState(testHash, { state: 'PROVEN', timestamp: new Date() })).toBe(false);
    });

    it('should allow FAILED from any state', () => {
      validator.initializeIntent(testHash, 'optimism', 'base');
      validator.recordState(testHash, { state: 'FUNDED', timestamp: new Date() });

      expect(validator.recordState(testHash, { state: 'FAILED', timestamp: new Date() })).toBe(true);
      expect(validator.getJourney(testHash)?.isComplete).toBe(true);
    });

    it('should return false for unknown intent', () => {
      const unknownHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hash;
      expect(validator.recordState(unknownHash, { state: 'FUNDED', timestamp: new Date() })).toBe(false);
    });
  });

  describe('markFailed', () => {
    it('should mark journey as failed with error message', () => {
      validator.initializeIntent(testHash, 'optimism', 'base');
      validator.recordState(testHash, { state: 'FUNDED', timestamp: new Date() });

      validator.markFailed(testHash, 'Solver timeout');

      const journey = validator.getJourney(testHash);
      expect(journey?.error).toBe('Solver timeout');
      expect(journey?.isComplete).toBe(true);
      expect(journey?.currentState).toBe('FAILED');
    });
  });

  describe('getAllJourneys', () => {
    it('should return all tracked journeys', () => {
      const hash1 = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hash;
      const hash2 = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hash;

      validator.initializeIntent(hash1, 'optimism', 'base');
      validator.initializeIntent(hash2, 'optimism', 'arbitrum');

      expect(validator.getAllJourneys()).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('should remove all tracked journeys', () => {
      validator.initializeIntent(testHash, 'optimism', 'base');
      expect(validator.getAllJourneys()).toHaveLength(1);

      validator.clear();
      expect(validator.getAllJourneys()).toHaveLength(0);
    });
  });
});
