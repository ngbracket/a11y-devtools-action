import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = new URL('../scripts/gate.sh', import.meta.url).pathname;
const gate = (SCAN_EXIT, REPORT_JSON, VERDICT) => {
  const res = spawnSync('bash', [script], { env: { ...process.env, SCAN_EXIT, REPORT_JSON, VERDICT }, encoding: 'utf8' });
  return { status: res.status, message: res.stdout.trim() };
};

test('passes only on exit 0 with a pass verdict', () => {
  assert.equal(gate('0', 'a11y.json', 'pass').status, 0);
});

test('fails on findings', () => {
  const { status, message } = gate('1', 'a11y.json', 'fail');
  assert.equal(status, 1);
  assert.match(message, /Findings at or above/);
});

test('fails on pages that did not scan (exit 0, verdict fail)', () => {
  const { status, message } = gate('0', 'a11y.json', 'fail');
  assert.equal(status, 1);
  assert.match(message, /didn't scan/);
});

test('fails closed when there is no verdict', () => {
  const { status, message } = gate('0', 'a11y.json', '');
  assert.equal(status, 1);
  assert.match(message, /couldn't be read/);
});

test('a crash without a report is not reported as findings', () => {
  const { status, message } = gate('1', '', '');
  assert.equal(status, 1);
  assert.match(message, /before writing a report/);
});

test('fails when the scan never ran', () => {
  assert.match(gate('', '', '').message, /didn't run/);
});

test('fails on other exit codes', () => {
  const { status, message } = gate('2', 'a11y.json', 'fail');
  assert.equal(status, 1);
  assert.match(message, /exit code 2/);
});
