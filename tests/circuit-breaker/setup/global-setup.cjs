/**
 * CJS wrapper for global-setup.ts
 * Jest globalSetup runs in CJS mode and does not apply moduleNameMapper,
 * so we use tsx to execute the TypeScript file directly.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Load .env before spawning so CB_ vars are available in the child process
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

module.exports = async function globalSetup() {
  const tsFile = path.join(__dirname, 'global-setup.ts');
  const rootDir = path.join(__dirname, '../../..');

  const result = spawnSync(
    'npx',
    [
      'tsx',
      '--eval',
      `(async () => { const m = await import('${tsFile.replace(/\\/g, '/')}'); await m.default(); })().catch(e => { console.error(e); process.exit(1); });`,
    ],
    {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
      encoding: 'utf-8',
    },
  );

  if (result.status !== 0) {
    throw new Error(`Global setup failed with exit code ${result.status}`);
  }
};
