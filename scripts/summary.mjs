// Reads the scan's JSON report, sets the action outputs, writes the job
// summary, and writes the pull request comment body to a file for comment.mjs.
// No dependencies: runs on the runner's Node.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Most rows the comment lists; the artifact has the rest. */
export const MAX_ROWS = 30;
/** GitHub caps a step summary at 1 MiB; leave room for the header. */
const MAX_SUMMARY_CHARS = 900_000;
/** Longest error text shown for a page that didn't scan. */
const MAX_ERROR_CHARS = 300;

const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];
const rank = (impact) => {
  const i = IMPACTS.indexOf(impact);
  return i === -1 ? IMPACTS.length : i;
};

/** Impacts the gate fails on, in words: "serious or critical". */
function gateWords(level) {
  if (!IMPACTS.includes(level)) return `"${level}" (not a valid level)`;
  const at = IMPACTS.slice(0, rank(level) + 1).reverse();
  return at.length > 1 ? `${at.slice(0, -1).join(', ')} or ${at.at(-1)}` : at[0];
}

/** Text safe inside a Markdown table cell. */
const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
/** Inline code that survives backticks in the text. */
const code = (text) => {
  const t = cell(text);
  return t.includes('`') ? `\`\` ${t} \`\`` : `\`${t}\``;
};
const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Works out the result of a run and the Markdown that describes it.
 *
 * @param report parsed JSON report from `ngbr-a11y-report --out`
 * @param opts.scanExit the CLI's exit code, as a string
 * @param opts.failOn the fail-on input (an impact, or "none")
 * @param opts.failOnScanError whether a page that didn't scan fails the check
 * @param opts.runUrl link to the workflow run
 * @param opts.artifact artifact name, or "" when no artifact is uploaded
 */
export function buildSummary(report, { scanExit, failOn, failOnScanError, runUrl, artifact }) {
  const pages = report.pages ?? [];
  const baseline = report.baseline;
  const failedPages = pages.filter((p) => p.error !== undefined);
  const findings = pages.flatMap((p) => (p.findings ?? []).map((f) => ({ page: p.label, ...f })));

  const outputs = {
    findings: report.summary?.nodeInstances ?? findings.length,
    'distinct-rules': report.summary?.distinctRules ?? new Set(findings.map((f) => f.id)).size,
    new: baseline ? baseline.new : '',
    fixed: baseline ? baseline.fixed : '',
  };

  // The CLI exits 0 when a page fails to load, so a page error is gated here.
  const breached = scanExit !== '0';
  const pageErrors = failOnScanError && failedPages.length > 0;
  const verdict = breached || pageErrors ? 'fail' : 'pass';

  const gateOff = failOn === 'none';
  let heading;
  if (verdict === 'fail') heading = '❌ failed';
  else if (gateOff) heading = 'finished';
  else heading = `✅ no ${baseline ? 'new ' : ''}${gateWords(failOn)} findings`;

  const lines = [`### Accessibility scan: ${heading}`, ''];
  if (baseline) {
    lines.push(`**${baseline.new} new** · ${baseline.fixed} fixed · ${baseline.unchanged} unchanged, compared with the baseline.`);
  } else {
    const n = outputs.findings;
    const onPages = `on ${plural(pages.length, 'page')}`;
    lines.push(
      n === 0
        ? `**No findings** ${onPages}.`
        : `**${plural(n, 'finding')}** (${plural(outputs['distinct-rules'], 'distinct rule')}) ${onPages}.`,
    );
  }
  lines.push('');
  lines.push(
    gateOff
      ? 'The gate is off (`fail-on: none`).'
      : `The check fails on ${baseline ? 'new ' : ''}${gateWords(failOn)} findings${failOnScanError ? ', and on pages that don\'t scan' : ''}.`,
  );

  if (failedPages.length) {
    lines.push('', `${plural(failedPages.length, 'page')} didn't scan:`);
    for (const p of failedPages) lines.push(`- ${code(p.label)}: ${cell(clip(String(p.error), MAX_ERROR_CHARS))}`);
  }

  // Findings table: the new ones with a baseline, otherwise all of them.
  const rows = (baseline ? (baseline.newFindings ?? []) : findings).slice().sort((a, b) => rank(a.impact) - rank(b.impact));
  if (rows.length) {
    lines.push('', baseline ? '#### New findings' : '#### Findings', '');
    lines.push('| Impact | Rule | Component | Page | Element |', '|---|---|---|---|---|');
    for (const f of rows.slice(0, MAX_ROWS)) {
      const rule = f.helpUrl ? `[${cell(f.id)}](${f.helpUrl})` : cell(f.id);
      lines.push(
        `| ${cell(f.impact ?? '')} | ${rule} | ${cell(f.component ?? '(unknown component)')} | ${code(f.page)} | ${code(clip(String(f.target), 200))} |`,
      );
    }
    if (rows.length > MAX_ROWS) lines.push('', `${rows.length - MAX_ROWS} more in the full report.`);
  }

  lines.push('');
  lines.push(`Full report: [workflow run](${runUrl})` + (artifact ? `, artifact \`${artifact}\` (Markdown, JSON and HTML).` : '.'));
  lines.push('');
  lines.push(`<sub>${cell(report.scope ?? '')}</sub>`);

  return { body: lines.join('\n'), outputs, verdict };
}

function main() {
  const env = process.env;
  const report = JSON.parse(readFileSync(env.REPORT_JSON, 'utf8'));
  const artifactName = env.IN_ARTIFACT_NAME || 'a11y-report';
  const { body, outputs, verdict } = buildSummary(report, {
    scanExit: env.SCAN_EXIT,
    failOn: env.IN_FAIL_ON || 'serious',
    failOnScanError: env.IN_FAIL_ON_SCAN_ERROR !== 'false',
    runUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    artifact: env.IN_UPLOAD_ARTIFACT === 'true' ? artifactName : '',
  });

  // The marker lets comment.mjs find and update its own comment; it includes
  // the artifact name so two scans in one workflow keep two comments.
  const commentFile = join(env.RUNNER_TEMP, `ngbr-a11y-comment-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? 1}.md`);
  writeFileSync(commentFile, `<!-- ngbr-a11y-devtools-action:${artifactName} -->\n${body}\n`);

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
    const out = Object.entries({ ...outputs, verdict, 'comment-file': commentFile })
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    appendFileSync(env.GITHUB_OUTPUT, `${out}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
