import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = new URL('../scripts/scan.sh', import.meta.url).pathname;

/**
 * Runs scan.sh with a stub CLI that records its arguments, writes a report
 * when asked, and exits with the given code.
 */
function run(env, { exit = 0, writeReport = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ngbr-a11y-action-'));
  const bin = join(root, 'tools/node_modules/@ngbracket/a11y-devtools/bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, 'ngbr-a11y-report.mjs'),
    `import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
writeFileSync(${JSON.stringify(join(root, 'args.json'))}, JSON.stringify(args));
const out = args[args.indexOf('--out') + 1];
if (${writeReport}) { writeFileSync(out + '.json', '{}'); writeFileSync(out + '.md', ''); }
process.exit(${exit});`,
  );
  const output = join(root, 'output');
  writeFileSync(output, '');
  const base = {
    IN_ROUTES: '/', IN_SERVE: '', IN_BASE_URL: 'http://localhost:4200', IN_FAIL_ON: 'serious', IN_BASELINE: '',
    IN_COLOR_SCHEME: 'light', IN_DARK_CLASS: '', IN_DARK_ATTRIBUTE: '', IN_KEYBOARD: 'false', IN_FOCUS_TRAPS: 'false', IN_NAVIGATION: 'false', IN_PAGE_TITLES: 'true', IN_ID_REFERENCES: 'true', IN_INPUT_PURPOSE: 'true', IN_FOCUS_INDICATORS: 'false',
    IN_TAGS: '', IN_FRAMEWORK_PREFIXES: '', IN_SERVE_TIMEOUT: '180', IN_WAIT: '1500',
  };
  const res = spawnSync('bash', [script], {
    env: { ...process.env, ...base, ...env, NGBR_A11Y_TOOLS: join(root, 'tools'), RUNNER_TEMP: root, GITHUB_OUTPUT: output },
    encoding: 'utf8',
  });
  const outputs = Object.fromEntries(
    readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)),
  );
  let args = null;
  try { args = JSON.parse(readFileSync(join(root, 'args.json'), 'utf8')); } catch {}
  return { status: res.status, outputs, args, stdout: res.stdout };
}

const routesOf = (args) => args.flatMap((a, i) => (a === '--route' ? [args[i + 1]] : []));

test('routes: one per line or comma-separated, trimmed, blanks and CRs dropped', () => {
  const { args } = run({ IN_ROUTES: " /\r\n  /search?q=it's \n\n/a, /b\t\n" });
  assert.deepEqual(routesOf(args), ['/', "/search?q=it's", '/a', '/b']);
});

test('inputs map to CLI flags', () => {
  const { args } = run({
    IN_SERVE: 'npx ng serve --port 4300', IN_BASELINE: 'a11y-baseline.json', IN_KEYBOARD: 'true',
    IN_DARK_CLASS: 'dark', IN_TAGS: 'wcag22aa',
  });
  const flag = (name) => args[args.indexOf(name) + 1];
  assert.equal(flag('--serve'), 'npx ng serve --port 4300');
  assert.equal(flag('--baseline'), 'a11y-baseline.json');
  assert.equal(flag('--dark-class'), 'dark');
  assert.equal(flag('--fail-on'), 'serious');
  assert.ok(args.includes('--keyboard'));
  assert.ok(!args.includes('--color-scheme'), 'dark-class sets the scheme itself');
});

test('navigation passes --navigation, and needs 2 or more routes', () => {
  const { args } = run({ IN_ROUTES: '/orders\n/orders/42', IN_NAVIGATION: 'true' });
  assert.ok(args.includes('--navigation'));
  assert.ok(!run({ IN_ROUTES: '/orders\n/orders/42' }).args.includes('--navigation'));

  const one = run({ IN_ROUTES: '/', IN_NAVIGATION: 'true' });
  assert.equal(one.outputs['exit-code'], '2');
  assert.equal(one.args, null, 'the CLI never ran');
  assert.match(one.stdout, /needs 2 or more routes/);
});

test('page-titles false passes --no-page-titles', () => {
  assert.ok(run({ IN_PAGE_TITLES: 'false' }).args.includes('--no-page-titles'));
  assert.ok(!run({}).args.includes('--no-page-titles'));
});

test('id-references false passes --no-id-references', () => {
  assert.ok(run({ IN_ID_REFERENCES: 'false' }).args.includes('--no-id-references'));
  assert.ok(!run({}).args.includes('--no-id-references'));
});

test('input-purpose false passes --no-input-purpose', () => {
  assert.ok(run({ IN_INPUT_PURPOSE: 'false' }).args.includes('--no-input-purpose'));
  assert.ok(!run({}).args.includes('--no-input-purpose'));
});

test('focus-indicators true passes --focus-indicators', () => {
  assert.ok(run({ IN_FOCUS_INDICATORS: 'true' }).args.includes('--focus-indicators'));
  assert.ok(!run({}).args.includes('--focus-indicators'));
});

test('fail-on none passes no --fail-on', () => {
  assert.ok(!run({ IN_FAIL_ON: 'none' }).args.includes('--fail-on'));
});

test('records the exit code and report paths without failing the step', () => {
  const { status, outputs } = run({}, { exit: 1 });
  assert.equal(status, 0);
  assert.equal(outputs['exit-code'], '1');
  assert.match(outputs['report-json'], /a11y\.json$/);
});

test('no report-json output when the CLI wrote none', () => {
  const { outputs } = run({}, { exit: 1, writeReport: false });
  assert.equal(outputs['exit-code'], '1');
  assert.equal(outputs['report-json'], undefined);
});

test('empty routes stop with exit code 2 before running the CLI', () => {
  const { outputs, args } = run({ IN_ROUTES: ' \n , ' });
  assert.equal(outputs['exit-code'], '2');
  assert.equal(args, null);
});
