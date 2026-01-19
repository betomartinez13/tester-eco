import * as fs from 'fs';
import * as path from 'path';
import type { Hash } from 'viem';
import type { IntentJourney, IntentState } from '../types/intent.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('IntentReporter');

export interface TestRunReport {
  testRun: {
    id: string;
    startTime: string;
    endTime: string;
    routes: string[];
  };
  intents: IntentReport[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    successRate: string;
    averageDuration?: string;
  };
}

export interface IntentReport {
  intentHash: Hash;
  route: string;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  states: {
    state: IntentState;
    timestamp: string;
    txHash?: string;
    blockNumber?: string;
  }[];
  timing: {
    publishedToFunded?: string;
    fundedToFulfilled?: string;
    fulfilledToProven?: string;
    provenToWithdrawn?: string;
    totalDuration?: string;
  };
  error?: string;
}

export class IntentReporter {
  private runId: string;
  private startTime: Date;
  private journeys: IntentJourney[] = [];
  private routes = new Set<string>();

  constructor() {
    this.runId = `run-${new Date().toISOString().split('T')[0]}-${this.generateId()}`;
    this.startTime = new Date();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  /**
   * Add a journey to the report
   */
  addJourney(journey: IntentJourney): void {
    this.journeys.push(journey);
    this.routes.add(journey.route);
  }

  /**
   * Generate the full test report
   */
  generateReport(): TestRunReport {
    const endTime = new Date();
    const intents = this.buildIntentReports();

    const succeeded = intents.filter((i) => i.status === 'SUCCESS').length;
    const failed = intents.length - succeeded;

    const durations = intents
      .filter((i) => i.timing.totalDuration)
      .map((i) => this.parseDuration(i.timing.totalDuration!));
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      testRun: {
        id: this.runId,
        startTime: this.startTime.toISOString(),
        endTime: endTime.toISOString(),
        routes: Array.from(this.routes),
      },
      intents,
      summary: {
        total: intents.length,
        succeeded,
        failed,
        successRate: intents.length > 0
          ? `${((succeeded / intents.length) * 100).toFixed(1)}%`
          : '0%',
        averageDuration: avgDuration > 0 ? this.formatDuration(avgDuration) : undefined,
      },
    };
  }

  private buildIntentReports(): IntentReport[] {
    return this.journeys.map((journey) => {
      const status = this.determineStatus(journey);
      const timing = this.calculateTiming(journey);

      return {
        intentHash: journey.intentHash,
        route: journey.route,
        status,
        states: journey.states.map((s) => ({
          state: s.state,
          timestamp: s.timestamp.toISOString(),
          txHash: s.txHash,
          blockNumber: s.blockNumber?.toString(),
        })),
        timing,
        error: journey.error,
      };
    });
  }

  private determineStatus(journey: IntentJourney): 'SUCCESS' | 'FAILED' | 'TIMEOUT' {
    if (journey.error) return 'FAILED';
    if (journey.currentState === 'WITHDRAWN') return 'SUCCESS';
    if (journey.currentState === 'FAILED') return 'FAILED';
    return 'TIMEOUT';
  }

  private calculateTiming(journey: IntentJourney): IntentReport['timing'] {
    const getTime = (state: IntentState): number | undefined => {
      return journey.states.find((s) => s.state === state)?.timestamp.getTime();
    };

    const published = getTime('PUBLISHED');
    const funded = getTime('FUNDED');
    const fulfilled = getTime('FULFILLED');
    const proven = getTime('PROVEN');
    const withdrawn = getTime('WITHDRAWN');

    return {
      publishedToFunded: funded && published
        ? this.formatDuration(funded - published) : undefined,
      fundedToFulfilled: fulfilled && funded
        ? this.formatDuration(fulfilled - funded) : undefined,
      fulfilledToProven: proven && fulfilled
        ? this.formatDuration(proven - fulfilled) : undefined,
      provenToWithdrawn: withdrawn && proven
        ? this.formatDuration(withdrawn - proven) : undefined,
      totalDuration: withdrawn && published
        ? this.formatDuration(withdrawn - published) : undefined,
    };
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }

  private parseDuration(duration: string): number {
    if (duration.endsWith('ms')) return parseInt(duration);
    if (duration.endsWith('s') && !duration.includes('m')) {
      return parseFloat(duration) * 1000;
    }
    const match = duration.match(/(\d+)m\s*(\d+)s/);
    if (match) {
      return parseInt(match[1]) * 60000 + parseInt(match[2]) * 1000;
    }
    return 0;
  }

  /**
   * Save report to file
   */
  saveReport(outputDir = './reports'): string {
    const report = this.generateReport();

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filepath = path.join(outputDir, `${this.runId}.json`);
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    log.info({ filepath }, 'Report saved');

    return filepath;
  }

  /**
   * Print summary to console
   */
  printSummary(): void {
    const report = this.generateReport();

    console.log('\n' + '='.repeat(60));
    console.log('TEST RUN SUMMARY');
    console.log('='.repeat(60));
    console.log(`Run ID: ${report.testRun.id}`);
    console.log(`Routes: ${report.testRun.routes.join(', ')}`);
    console.log('-'.repeat(60));
    console.log(`Total: ${report.summary.total}`);
    console.log(`Succeeded: ${report.summary.succeeded}`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`Success Rate: ${report.summary.successRate}`);
    if (report.summary.averageDuration) {
      console.log(`Avg Duration: ${report.summary.averageDuration}`);
    }
    console.log('='.repeat(60));

    for (const intent of report.intents) {
      const icon = intent.status === 'SUCCESS' ? '[OK]' : '[FAIL]';
      console.log(
        `${icon} ${intent.intentHash.slice(0, 10)}... | ${intent.route} | ${intent.status} | ${intent.timing.totalDuration || 'N/A'}`
      );
      if (intent.error) {
        console.log(`  Error: ${intent.error}`);
      }
    }
    console.log('='.repeat(60) + '\n');
  }
}

export function createReporter(): IntentReporter {
  return new IntentReporter();
}
