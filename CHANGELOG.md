# Changelog

## 1.0.5 (2026-10-25)

Runs `@ngbracket/a11y-devtools` 0.18.6 by default. With a baseline, a known finding whose selector only changed position (`li:nth-child(3)` becoming `li:nth-child(4)`, or a generated id such as `#mat-input-3` moving to `#mat-input-7`) is matched to its baseline entry instead of failing the check as new. 0.18.5's overlay fixes don't affect the action, which runs report mode.

## 1.0.4 (2026-10-15)

Runs `@ngbracket/a11y-devtools` 0.18.3 by default. Pages served with a strict Content-Security-Policy or Trusted Types are now scanned. Before, each one was reported as an error with no findings.

## 1.0.3 (2026-10-14)

Runs `@ngbracket/a11y-devtools` 0.18.2 by default. When the Angular build fails, the Scan step now stops within seconds instead of waiting 3 minutes for a dev server that never starts. The check's error message says where to find the build errors.

## 1.0.2 (2026-10-14)

Runs `@ngbracket/a11y-devtools` 0.18.1 by default. That release stops `ngbr/unreachable-control` reporting the touch target in Angular Material 15 to 21 checkboxes and radio buttons: Tab reaches the input beside it.

## 1.0.1 (2026-10-13)

Renamed the action to "ngbracket a11y-devtools", to match the npm package. Inputs, outputs and behaviour are unchanged.

## 1.0.0 (2026-10-12)

First release. Runs `@ngbracket/a11y-devtools` 0.18.0 report mode with Playwright 1.63.0 on an Angular dev build. It starts the dev server, scans the listed routes, comments on the pull request, writes the job summary, and uploads Markdown, JSON and HTML reports. The check fails at the `fail-on` level and when a page doesn't scan. Supports a baseline, dark mode, and the keyboard and focus-trap checks.
