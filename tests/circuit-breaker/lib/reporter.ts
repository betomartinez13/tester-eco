import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CircuitBreakerConfig } from './config.js';
import type { TestStateManager } from './types.js';
import { CircuitBreakerReportSchema, AlertPayloadSchema } from '../schemas/report.schema.js';

/**
 * Write the JSON report to disk and optionally POST an alert
 */
export async function writeReport(
  config: CircuitBreakerConfig,
  stateManager: TestStateManager,
): Promise<void> {
  const summary = stateManager.getSummary();
  const routes = stateManager.getAllResults();
  const runId = randomUUID();

  const report = CircuitBreakerReportSchema.parse({
    runId,
    timestamp: new Date().toISOString(),
    solverUrl: config.solver.url,
    durationMs: Date.now() - stateManager.startedAt,
    summary,
    routes,
  });

  if (config.reporting.reportPath) {
    const reportDir = config.reporting.reportPath;
    fs.mkdirSync(reportDir, { recursive: true });

    const safeTimestamp = report.timestamp.replace(/[:.]/g, '-');
    const timestampedFile = path.join(reportDir, `circuit-breaker-${safeTimestamp}.json`);
    const latestFile = path.join(reportDir, 'latest.json');
    const content = JSON.stringify(report, null, 2);

    fs.writeFileSync(timestampedFile, content, 'utf-8');
    fs.writeFileSync(latestFile, content, 'utf-8');
    console.log(`\n📄 Report written to ${timestampedFile}`);
    console.log(`📄 Latest report at ${latestFile}`);
  }

  // Send alert if any routes failed
  if (summary.failed > 0 && config.reporting.alertEndpoint) {
    await sendAlert(config, runId, summary, routes);
  }

  // Print summary to console
  console.log('\n📊 Circuit Breaker Summary:');
  console.log(`   Total routes: ${summary.totalRoutes}`);
  console.log(`   ✅ Passed: ${summary.passed}`);
  console.log(`   ❌ Failed: ${summary.failed}`);
  console.log(`   ⏭️  Skipped: ${summary.skipped}`);
}

async function sendAlert(
  config: CircuitBreakerConfig,
  runId: string,
  summary: ReturnType<TestStateManager['getSummary']>,
  routes: ReturnType<TestStateManager['getAllResults']>,
): Promise<void> {
  const failedRoutes = routes
    .filter((r) => ['publish_failed', 'fulfillment_failed', 'proving_failed'].includes(r.status))
    .map((r) => ({
      routeKey: r.routeKey,
      sourceChainId: r.sourceChainId,
      destinationChainId: r.destinationChainId,
      sourceToken: r.sourceToken,
      destinationToken: r.destinationToken,
      status: r.status,
      error: r.error ?? 'unknown',
      errorPhase: r.errorPhase ?? 'unknown',
      intentHash: r.intentHash,
    }));

  const payload = AlertPayloadSchema.parse({
    runId,
    timestamp: new Date().toISOString(),
    solverUrl: config.solver.url,
    summary,
    failedRoutes,
  });

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.reporting.alertAuthHeader) {
      headers['Authorization'] = config.reporting.alertAuthHeader;
    }
    const res = await fetch(config.reporting.alertEndpoint!, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`⚠️  Alert delivery failed: ${res.status}`);
    } else {
      console.log('🚨 Alert sent successfully');
    }
  } catch (err) {
    console.error('⚠️  Alert delivery error:', err);
  }
}
