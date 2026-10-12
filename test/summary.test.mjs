import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSummary, MAX_ROWS } from '../scripts/summary.mjs';

const finding = (id, impact, component = 'HeroComponent', target = 'p.note') => ({
  id,
  impact,
  help: 'h',
  helpUrl: `https://example.test/${id}`,
  component,
  componentPath: [],
  directives: [],
  target,
  html: '',
});
const opts = { scanExit: '0', failOn: 'serious', failOnScanError: true, runUrl: 'https://run', artifact: 'a11y-report' };

test('a clean run passes and says what the gate covers', () => {
  const { body, outputs, verdict } = buildSummary({ pages: [{ label: '/', findings: [] }] }, opts);
  assert.equal(verdict, 'pass');
  assert.match(body, /✅ no serious or critical findings/);
  assert.match(body, /\*\*No findings\*\* on 1 page\./);
  assert.equal(outputs.findings, 0);
  assert.equal(outputs.new, '');
});

test('a breach from the CLI fails and lists findings worst first', () => {
  const report = {
    summary: { nodeInstances: 2, distinctRules: 2 },
    pages: [{ label: '/', findings: [finding('color-contrast', 'serious'), finding('button-name', 'critical', null)] }],
  };
  const { body, verdict } = buildSummary(report, { ...opts, scanExit: '1' });
  assert.equal(verdict, 'fail');
  assert.match(body, /❌ failed/);
  const rows = body.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Impact'));
  assert.deepEqual(
    rows.map((r) => r.split(' | ')[0]),
    ['| critical', '| serious'],
  );
  assert.match(rows[0], /\(unknown component\)/);
});

test('a page that did not scan fails the check even when the CLI exits 0', () => {
  const report = { pages: [{ label: '/', findings: [] }, { label: '/slow', error: 'Timed out', findings: [] }] };
  const { body, verdict } = buildSummary(report, opts);
  assert.equal(verdict, 'fail');
  assert.match(body, /1 page didn't scan:\n- `\/slow`: Timed out/);
});

test('fail-on-scan-error false lets a page error through', () => {
  const report = { pages: [{ label: '/slow', error: 'Timed out', findings: [] }] };
  assert.equal(buildSummary(report, { ...opts, failOnScanError: false }).verdict, 'pass');
});

test('with a baseline it reports new, fixed and unchanged and lists only the new findings', () => {
  const report = {
    pages: [{ label: '/', findings: [finding('color-contrast', 'serious'), finding('image-alt', 'critical')] }],
    baseline: { new: 1, fixed: 3, unchanged: 1, newFindings: [{ page: '/', ...finding('image-alt', 'critical') }] },
  };
  const { body, outputs } = buildSummary(report, { ...opts, scanExit: '1' });
  assert.match(body, /\*\*1 new\*\* · 3 fixed · 1 unchanged/);
  assert.match(body, /#### New findings/);
  assert.doesNotMatch(body, /color-contrast/);
  assert.equal(outputs.new, 1);
  assert.equal(outputs.fixed, 3);
});

test('fail-on none says the gate is off', () => {
  const { body, verdict } = buildSummary({ pages: [{ label: '/', findings: [finding('region', 'moderate')] }] }, { ...opts, failOn: 'none' });
  assert.equal(verdict, 'pass');
  assert.match(body, /Accessibility scan: finished/);
  assert.match(body, /Findings don't fail the check/);
});

test('table cells escape pipes and the row count is capped', () => {
  const many = Array.from({ length: MAX_ROWS + 5 }, (_, i) => finding('region', 'moderate', 'A', `div|x${i}`));
  const { body } = buildSummary({ pages: [{ label: '/', findings: many }] }, { ...opts, failOn: 'critical' });
  assert.match(body, /`div\\\|x0`/);
  assert.match(body, /5 more in the full report\./);
});

test('fail-on none with page errors still says pages that do not scan fail', () => {
  const report = { pages: [{ label: '/slow', error: 'Timed out', findings: [] }] };
  const { body, verdict } = buildSummary(report, { ...opts, failOn: 'none' });
  assert.equal(verdict, 'fail');
  assert.match(body, /Findings don't fail the check \(`fail-on: none`\)\. Pages that don't scan still do\./);
});
