// Works out a run's result and the Markdown for the job summary and the pull
// request comment. Pure: summary-cli.mjs does the file and env work.

/** Most rows the comment lists; the artifact has the rest. */
export const MAX_ROWS = 30;
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
/** Where the NgBracket accessibility reference explains each WCAG criterion. */
const REFERENCE_WCAG_URL = 'https://ngbracket.com/reference/wcag';
/**
 * Slugs of the reference pages for the WCAG 2.2 A and AA criteria, by id. Same
 * list as `WCAG22_A_AA` in a11y-devtools `src/report/wcag.ts`.
 */
const WCAG_SLUGS = {
  '1.1.1': 'non-text-content', '1.2.1': 'audio-only-and-video-only-prerecorded',
  '1.2.2': 'captions-prerecorded', '1.2.3': 'audio-description-or-media-alternative-prerecorded',
  '1.2.4': 'captions-live', '1.2.5': 'audio-description-prerecorded', '1.3.1': 'info-and-relationships',
  '1.3.2': 'meaningful-sequence', '1.3.3': 'sensory-characteristics', '1.3.4': 'orientation',
  '1.3.5': 'identify-input-purpose', '1.4.1': 'use-of-color', '1.4.2': 'audio-control',
  '1.4.3': 'contrast-minimum', '1.4.4': 'resize-text', '1.4.5': 'images-of-text', '1.4.10': 'reflow',
  '1.4.11': 'non-text-contrast', '1.4.12': 'text-spacing', '1.4.13': 'content-on-hover-or-focus',
  '2.1.1': 'keyboard', '2.1.2': 'no-keyboard-trap', '2.1.4': 'character-key-shortcuts',
  '2.2.1': 'timing-adjustable', '2.2.2': 'pause-stop-hide', '2.3.1': 'three-flashes-or-below-threshold',
  '2.4.1': 'bypass-blocks', '2.4.2': 'page-titled', '2.4.3': 'focus-order',
  '2.4.4': 'link-purpose-in-context', '2.4.5': 'multiple-ways', '2.4.6': 'headings-and-labels',
  '2.4.7': 'focus-visible', '2.4.11': 'focus-not-obscured-minimum', '2.5.1': 'pointer-gestures',
  '2.5.2': 'pointer-cancellation', '2.5.3': 'label-in-name', '2.5.4': 'motion-actuation',
  '2.5.7': 'dragging-movements', '2.5.8': 'target-size-minimum', '3.1.1': 'language-of-page',
  '3.1.2': 'language-of-parts', '3.2.1': 'on-focus', '3.2.2': 'on-input', '3.2.3': 'consistent-navigation',
  '3.2.4': 'consistent-identification', '3.2.6': 'consistent-help', '3.3.1': 'error-identification',
  '3.3.2': 'labels-or-instructions', '3.3.3': 'error-suggestion',
  '3.3.4': 'error-prevention-legal-financial-data', '3.3.7': 'redundant-entry',
  '3.3.8': 'accessible-authentication-minimum', '4.1.2': 'name-role-value', '4.1.3': 'status-messages',
};
/** A finding's `wcag` ids (a11y-devtools 0.19.0 and later) as reference links. */
const wcagLinks = (ids) =>
  (ids ?? []).map((id) => (WCAG_SLUGS[id] ? `[${cell(id)}](${REFERENCE_WCAG_URL}/${WCAG_SLUGS[id]})` : cell(id))).join(', ');
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
  if (gateOff) {
    lines.push(
      failOnScanError
        ? "Findings don't fail the check (`fail-on: none`). Pages that don't scan still do."
        : "The check doesn't fail (`fail-on: none`, `fail-on-scan-error: false`).",
    );
  } else {
    lines.push(
      `The check fails on ${baseline ? 'new ' : ''}${gateWords(failOn)} findings${failOnScanError ? ", and on pages that don't scan" : ''}.`,
    );
  }

  if (failedPages.length) {
    lines.push('', `${plural(failedPages.length, 'page')} didn't scan:`);
    for (const p of failedPages) lines.push(`- ${code(p.label)}: ${cell(clip(String(p.error), MAX_ERROR_CHARS))}`);
  }

  // Findings table: the new ones with a baseline, otherwise all of them.
  const rows = (baseline ? (baseline.newFindings ?? []) : findings).slice().sort((a, b) => rank(a.impact) - rank(b.impact));
  if (rows.length) {
    lines.push('', baseline ? '#### New findings' : '#### Findings', '');
    lines.push('| Impact | Rule | WCAG | Component | Page | Element |', '|---|---|---|---|---|---|');
    for (const f of rows.slice(0, MAX_ROWS)) {
      const rule = f.helpUrl ? `[${cell(f.id)}](${f.helpUrl})` : cell(f.id);
      lines.push(
        `| ${cell(f.impact ?? '')} | ${rule} | ${wcagLinks(f.wcag)} | ${cell(f.component ?? '(unknown component)')} | ${code(f.page)} | ${code(clip(String(f.target), 200))} |`,
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
