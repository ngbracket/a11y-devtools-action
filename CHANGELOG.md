# Changelog

## 1.4.0

Runs `@ngbracket/a11y-devtools` 0.21.0 by default, which adds three checks that run with no input and one you turn on.

| Rule | Reports | Impact | Turn it off |
|---|---|---|---|
| `ngbr/duplicate-page-title` (WCAG 2.4.2) | Routes that share one page title, with 2 or more routes | moderate | `page-titles: false` |
| `ngbr/missing-id-reference` (WCAG 4.1.2, 1.3.1) | An `aria-labelledby` or `aria-describedby` that names a missing id | serious, moderate or minor | `id-references: false` |
| `ngbr/missing-autocomplete` (WCAG 1.3.5) | Name, email, phone and address fields with no `autocomplete` | moderate | `input-purpose: false` |

Upgrading can fail a workflow that uses a `baseline`. A missing `aria-labelledby` id on an element with no other name is serious, so it fails the default `fail-on: serious`. The other new findings are moderate or minor, so they fail `fail-on: moderate` or lower. Fix them, update the baseline, or turn the check off with its input.

A new `focus-indicators` input, off by default, measures each tab stop's focus indicator from screenshots and reports one that doesn't change, or changes by less than 3:1, as `ngbr/focus-indicator-contrast` (WCAG 2.4.7 and 1.4.11). Its findings are serious or moderate, so turning it on in a workflow with a baseline can fail the gate in the same way.

The `keyboard` checks now also work on a production build.

## 1.3.0 (2026-11-24)

Runs `@ngbracket/a11y-devtools` 0.20.0 by default. A new `navigation` input moves between the routes inside the app, in the order listed. It presses Enter on a link to the next route, or changes the URL when there's no link. Focus left on the page body after a route change is reported as `ngbr/focus-lost-on-navigation` (WCAG 2.4.3), and each route's report gets a "Route change" section. It needs 2 or more routes, and the scan stops with an error if there's only one. It's off by default, so existing workflows get the same findings as before.

## 1.2.0 (2026-11-23)

Runs `@ngbracket/a11y-devtools` 0.19.0 by default. Each finding in the Markdown and HTML reports links to the WCAG criteria it relates to, in the [NgBracket accessibility reference](https://ngbracket.com/reference), after axe's own rule link. The pull request comment and the job summary table have a new WCAG column with the same links. Findings and baselines are unchanged.

## 1.1.1 (2026-10-28)

Fixes the 1.1.0 launch check in jobs that run in a checkout with its own `playwright` package. The check loaded the app's Playwright, which looked for a different browser build, so it failed and apt ran anyway. It now loads the action's own Playwright.

## 1.1.0 (2026-10-28)

On Linux, the action no longer runs apt on every scan. It installs Chromium, tries to start it, and installs the browser's system packages only when it can't start. GitHub's Ubuntu runners already have the libraries, so apt is skipped there. In some runs on a slow Ubuntu mirror, apt took 10 minutes, against about 3 minutes for the whole job without it.

The skipped packages also add font packages for Chinese, Japanese, Thai and some other scripts. If your app shows text in those scripts, set the new `browser-deps` input to `always` to keep installing them. Still runs `@ngbracket/a11y-devtools` 0.18.6 and Playwright 1.63.0.

## 1.0.5 (2026-10-25)

Runs `@ngbracket/a11y-devtools` 0.18.6 by default. With a baseline, a known finding whose selector only changed position (`li:nth-child(3)` becoming `li:nth-child(4)`, or a generated id such as `#mat-input-3` moving to `#mat-input-7`) is matched to its baseline entry instead of failing the check as new. The overlay fixes in 0.18.4 and 0.18.5 don't affect the action, which runs report mode.

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
