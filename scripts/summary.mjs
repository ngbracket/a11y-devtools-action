// Reads the scan's JSON report, sets the action outputs, writes the job
// summary, and writes the pull request comment body to a file for comment.mjs.
// No dependencies: runs on the runner's Node.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
const report = JSON.parse(readFileSync(env.REPORT_JSON, 'utf8'));
const scanExit = env.SCAN_EXIT;
const failOn = env.IN_FAIL_ON || 'serious';
const artifact = env.IN_ARTIFACT_NAME || 'a11y-report';
const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;

/** Most rows the comment lists; the artifact has the rest. */
const MAX_ROWS = 30;
/** GitHub caps a step summary at 1 MiB; leave room for the header. */
const MAX_SUMMARY_CHARS = 900_000;

const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];
const rank = (impact) => {
  const i = IMPACTS.indexOf(impact);
  return i === -1 ? IMPACTS.length : i;
};

/** Impacts the gate fails on, in words: "serious and critical". */
function gateWords(level) {
  const at = IMPACTS.slice(0, rank(level) + 1).reverse();
  return at.length > 1 ? `${at.slice(0, -1).join(', ')} and ${at.at(-1)}` : at[0];
}

/** Text safe inside a Markdown table cell. */
const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
/** Inline code that survives backticks in the text. */
const code = (text) => {
  const t = cell(text);
  return t.includes('`') ? `\`\` ${t} \`\`` : `\`${t}\``;
};

const pages = report.pages ?? [];
const baseline = report.baseline;
const failedPages = pages.filter((p) => p.error !== undefined);
const findings = pages.flatMap((p) => (p.findings ?? []).map((f) => ({ page: p.label, ...f })));

// Outputs.
const outputs = {
  findings: report.summary?.nodeInstances ?? findings.length,
  'distinct-rules': report.summary?.distinctRules ?? new Set(findings.map((f) => f.id)).size,
  new: baseline ? baseline.new : '',
  fixed: baseline ? baseline.fixed : '',
};

// Headline.
const passed = scanExit === '0';
const lines = [];
lines.push(`### Accessibility scan: ${passed ? '✅ passed' : '❌ failed'}`);
lines.push('');
if (baseline) {
  lines.push(
    `**${baseline.new} new** · ${baseline.fixed} fixed · ${baseline.unchanged} unchanged, compared with the baseline.`,
  );
} else {
  const n = outputs.findings;
  const rules = outputs['distinct-rules'];
  const onPages = `on ${pages.length} page${pages.length === 1 ? '' : 's'}`;
  lines.push(
    n === 0
      ? `**No findings** ${onPages}.`
      : `**${n} finding${n === 1 ? '' : 's'}** (${rules} distinct rule${rules === 1 ? '' : 's'}) ${onPages}.`,
  );
}
lines.push('');
lines.push(
  failOn === 'none'
    ? 'The gate is off (`fail-on: none`).'
    : `The check fails on ${baseline ? 'new ' : ''}${gateWords(failOn)} findings.`,
);

if (failedPages.length) {
  lines.push('');
  lines.push(`These pages didn't scan:`);
  for (const p of failedPages) lines.push(`- ${code(p.label)}: ${cell(p.error)}`);
}

// Findings table: the new ones with a baseline, otherwise all of them.
const rows = (baseline ? (baseline.newFindings ?? []) : findings)
  .slice()
  .sort((a, b) => rank(a.impact) - rank(b.impact));
if (rows.length) {
  lines.push('');
  lines.push(baseline ? '#### New findings' : '#### Findings');
  lines.push('');
  lines.push('| Impact | Rule | Component | Page | Element |');
  lines.push('|---|---|---|---|---|');
  for (const f of rows.slice(0, MAX_ROWS)) {
    const rule = f.helpUrl ? `[${cell(f.id)}](${f.helpUrl})` : cell(f.id);
    lines.push(
      `| ${cell(f.impact ?? '')} | ${rule} | ${cell(f.component ?? '(unknown)')} | ${code(f.page)} | ${code(f.target)} |`,
    );
  }
  if (rows.length > MAX_ROWS) {
    lines.push('');
    lines.push(`${rows.length - MAX_ROWS} more in the full report.`);
  }
}

lines.push('');
lines.push(
  `Full report: [workflow run](${runUrl})` +
    (env.IN_UPLOAD_ARTIFACT === 'true' ? `, artifact \`${artifact}\` (Markdown, JSON and HTML).` : '.'),
);
lines.push('');
lines.push(`<sub>${cell(report.scope ?? '')}</sub>`);

const body = lines.join('\n');

// Comment file. The marker lets comment.mjs find and update its own comment;
// it includes the artifact name so two scans in one workflow keep two comments.
const commentFile = join(env.RUNNER_TEMP, 'ngbr-a11y-comment.md');
writeFileSync(commentFile, `<!-- ngbr-a11y-devtools-action:${artifact} -->\n${body}\n`);

// Job summary: the same body, then the full Markdown report.
let summary = body;
if (env.REPORT_MD && existsSync(env.REPORT_MD)) {
  const md = readFileSync(env.REPORT_MD, 'utf8');
  summary += '\n\n<details><summary>Full report</summary>\n\n';
  summary += md.length > MAX_SUMMARY_CHARS ? `${md.slice(0, MAX_SUMMARY_CHARS)}\n\n(Truncated. The artifact has the whole report.)` : md;
  summary += '\n\n</details>\n';
}
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);

if (env.GITHUB_OUTPUT) {
  const out = Object.entries({ ...outputs, 'comment-file': commentFile })
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  appendFileSync(env.GITHUB_OUTPUT, `${out}\n`);
}
