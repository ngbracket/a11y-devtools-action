import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = new URL('../scripts/install-browser.sh', import.meta.url).pathname;

/**
 * Runs install-browser.sh with a stub Playwright CLI that records each call,
 * and a stub playwright module whose chromium.launch() works or fails.
 */
function run(env, { launches = true, cwd } = {}) {
  const tools = join(mkdtempSync(join(tmpdir(), 'ngbr-a11y-action-')), 'tools');
  const bin = join(tools, 'node_modules/.bin');
  const pkg = join(tools, 'node_modules/playwright');
  mkdirSync(bin, { recursive: true });
  mkdirSync(pkg, { recursive: true });
  const calls = join(tools, 'calls');
  writeFileSync(join(bin, 'playwright'), `#!/usr/bin/env bash\necho "$*" >> ${JSON.stringify(calls)}\n`);
  chmodSync(join(bin, 'playwright'), 0o755);
  writeFileSync(
    join(pkg, 'index.js'),
    `exports.chromium = { launch: async () => {
      if (${JSON.stringify(launches)} === false) throw new Error('missing libnss3');
      if (${JSON.stringify(launches)} === 'needs-path' && process.env.PLAYWRIGHT_BROWSERS_PATH !== '/browsers') throw new Error('no browser');
      return { close: async () => {} };
    } };`,
  );
  const res = spawnSync('bash', [script], {
    cwd,
    env: { ...process.env, RUNNER_OS: 'Linux', IN_BROWSER_DEPS: 'auto', ...env, NGBR_A11Y_TOOLS: tools },
    encoding: 'utf8',
  });
  const installs = existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [];
  return { status: res.status, stdout: res.stdout, installs };
}

test('skips the system packages when Chromium starts without them', () => {
  const { status, installs, stdout } = run({});
  assert.equal(status, 0);
  assert.deepEqual(installs, ['install chromium']);
  assert.match(stdout, /aren't installed/);
});

test('installs the system packages when Chromium cannot start, and says why', () => {
  const { status, installs, stdout } = run({}, { launches: false });
  assert.equal(status, 0);
  assert.deepEqual(installs, ['install chromium', 'install-deps chromium']);
  assert.match(stdout, /missing libnss3/);
});

test('passes PLAYWRIGHT_BROWSERS_PATH to the launch check', () => {
  const { installs } = run({ PLAYWRIGHT_BROWSERS_PATH: '' }, { launches: 'needs-path' });
  assert.deepEqual(installs, ['install chromium', 'install-deps chromium']);
  assert.deepEqual(run({ PLAYWRIGHT_BROWSERS_PATH: '/browsers' }, { launches: 'needs-path' }).installs, [
    'install chromium',
  ]);
});

test('accepts browser-deps in any case', () => {
  assert.deepEqual(run({ IN_BROWSER_DEPS: 'Always' }).installs, ['install --with-deps chromium']);
});

test('always installs the system packages with browser-deps always', () => {
  const { status, installs } = run({ IN_BROWSER_DEPS: 'always' });
  assert.equal(status, 0);
  assert.deepEqual(installs, ['install --with-deps chromium']);
});

test('installs only the browser on macOS and Windows', () => {
  for (const os of ['macOS', 'Windows']) {
    assert.deepEqual(run({ RUNNER_OS: os, IN_BROWSER_DEPS: 'always' }).installs, ['install chromium']);
  }
});

test('rejects an unknown browser-deps value', () => {
  const { status, stdout, installs } = run({ IN_BROWSER_DEPS: 'never' });
  assert.equal(status, 1);
  assert.match(stdout, /must be auto or always\. Got "never"/);
  assert.deepEqual(installs, []);
});

test("launches the action's own Playwright, not the app's", () => {
  // An app checkout with its own playwright whose launch fails.
  const app = mkdtempSync(join(tmpdir(), 'ngbr-a11y-app-'));
  mkdirSync(join(app, 'node_modules/playwright'), { recursive: true });
  writeFileSync(
    join(app, 'node_modules/playwright/index.js'),
    "exports.chromium = { launch: async () => { throw new Error('wrong playwright'); } };",
  );
  const { installs, stdout } = run({}, { cwd: app });
  assert.deepEqual(installs, ['install chromium']);
  assert.match(stdout, /aren't installed/);
  assert.doesNotMatch(stdout, /wrong playwright/);
});
