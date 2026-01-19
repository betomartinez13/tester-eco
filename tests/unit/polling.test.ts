import { pollUntil, sleep } from '../../src/utils/polling.js';

describe('Polling Utilities', () => {
  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('pollUntil', () => {
    it('should return result when condition is met', async () => {
      let attempts = 0;
      const result = await pollUntil(async () => {
        attempts++;
        return attempts >= 3 ? 'success' : null;
      }, { interval: 50, timeout: 5000 });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should return null on timeout', async () => {
      const result = await pollUntil(
        async () => null,
        { interval: 50, timeout: 200 }
      );
      expect(result).toBeNull();
    });

    it('should continue polling after errors', async () => {
      let attempts = 0;
      const result = await pollUntil(async () => {
        attempts++;
        if (attempts < 3) throw new Error('Not yet');
        return 'success';
      }, { interval: 50, timeout: 5000 });

      expect(result).toBe('success');
    });

    it('should return immediately if first poll succeeds', async () => {
      const start = Date.now();
      const result = await pollUntil(
        async () => 'immediate',
        { interval: 1000, timeout: 5000 }
      );
      const elapsed = Date.now() - start;

      expect(result).toBe('immediate');
      expect(elapsed).toBeLessThan(100);
    });
  });
});
