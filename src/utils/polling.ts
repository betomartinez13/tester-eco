import { createChildLogger } from './logger.js';

const log = createChildLogger('Polling');

export interface PollOptions {
  interval: number;  // ms between polls
  timeout: number;   // max wait time in ms
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUntil<T>(
  fn: () => Promise<T | null>,
  options: PollOptions
): Promise<T | null> {
  const { interval, timeout } = options;
  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < timeout) {
    attempt++;
    try {
      const result = await fn();
      if (result !== null) {
        log.debug({ attempt, elapsed: Date.now() - startTime }, 'Poll succeeded');
        return result;
      }
    } catch (error) {
      log.warn({ attempt, error }, 'Poll attempt failed');
    }

    if (Date.now() - startTime + interval < timeout) {
      await sleep(interval);
    }
  }

  log.warn({ attempts: attempt, timeout }, 'Poll timed out');
  return null;
}
