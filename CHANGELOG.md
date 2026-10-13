# Changelog

## 1.0.1 (2026-10-13)

Renamed the action to "ngbracket a11y-devtools", to match the npm package. Inputs, outputs and behaviour are unchanged.

## 1.0.0 (2026-10-12)

First release. Runs `@ngbracket/a11y-devtools` 0.18.0 report mode with Playwright 1.63.0 on an Angular dev build. It starts the dev server, scans the listed routes, comments on the pull request, writes the job summary, and uploads Markdown, JSON and HTML reports. The check fails at the `fail-on` level and when a page doesn't scan. Supports a baseline, dark mode, and the keyboard and focus-trap checks.
