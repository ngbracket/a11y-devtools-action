// Reads the scan's JSON report, sets the action outputs, writes the job
// summary, and writes the pull request comment body to a file for
// comment-cli.mjs. No dependencies: runs on the runner's Node.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildSummary } from './summary.mjs';

/** GitHub caps a step summary at 1 MiB; leave room for the header. */
const MAX_SUMMARY_CHARS = 900_000;

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

main();
