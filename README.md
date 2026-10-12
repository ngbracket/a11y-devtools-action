# Angular a11y scan

A GitHub Action that runs [@ngbracket/a11y-devtools](https://ngbracket.com/tools/a11y-devtools) on your Angular app in CI. It starts your dev server, scans the routes you list with axe-core, and names the Angular component that rendered each problem. On a pull request it posts the result as a comment and fails the check when there are findings at or above the level you choose.

## Quick start

```yaml
name: Accessibility
on: pull_request

permissions:
  contents: read
  pull-requests: write # for the comment

jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - uses: ngbracket/a11y-devtools-action@v1
        with:
          serve: npx ng serve
          routes: |
            /
            /settings
```

The scan needs a development build. Component names come from Angular's dev-mode debug API, so against a production build every finding reads "(unknown component)".

## What you get

- A comment on the pull request with the counts and a table of findings: impact, rule, component, page and element. Each push updates the same comment.
- The same text in the job summary, followed by the full Markdown report.
- An artifact, `a11y-report`, with the report as Markdown, JSON and HTML.
- A failed check when a finding is at or above `fail-on` (`serious` by default), or when a page doesn't load or scan.

## Adopt it on an app with known issues

An existing app usually has findings already, so a gate on every finding fails from the first run. Record today's findings as a baseline and the check fails only on new ones.

1. Run the action once with `fail-on: none`, download the artifact and commit `a11y.json` as `a11y-baseline.json`.
2. Point the action at it:

```yaml
      - uses: ngbracket/a11y-devtools-action@v1
        with:
          serve: npx ng serve
          routes: |
            /
            /settings
          baseline: a11y-baseline.json
```

The comment then shows new, fixed and unchanged counts and lists only the new findings. When a pull request fixes some, commit its `a11y.json` as the new baseline so they can't come back. The [CI gating guide](https://ngbracket.com/tools/a11y-devtools/docs/ci-baseline) explains how findings are matched between runs.

## Inputs

| Input | Default | What it does |
|---|---|---|
| `routes` | (required) | Routes to scan, one per line. Commas also separate routes, so a route can't contain a comma. |
| `serve` | | Command that starts the dev server, e.g. `npx ng serve`. The scan starts it, waits for `base-url`, and stops it afterwards. Leave it empty if a server is already running. |
| `base-url` | `http://localhost:4200` | Origin of the dev server. |
| `working-directory` | `.` | Directory of the Angular app. `serve` runs here and `baseline` is relative to it. |
| `fail-on` | `serious` | `minor`, `moderate`, `serious`, `critical`, or `none` to never fail on findings. With a baseline, only new findings count. |
| `fail-on-scan-error` | `true` | Fail the check when a page doesn't load or scan, e.g. a timeout or an error in the app. |
| `baseline` | | Path to a previous run's JSON report. |
| `color-scheme` | `light` | `light`, `dark` or `both`. The dark pass lists only problems the light pass doesn't have. |
| `dark-class` | | Class on `<html>` that turns on your dark theme. Implies `both`. |
| `dark-attribute` | | Attribute on `<html>` that turns on your dark theme, as `name=value`. Implies `both`. |
| `keyboard` | `false` | Also run the keyboard checks: controls you can't reach with Tab, click handlers without a keyboard equivalent, and tab order that doesn't follow the layout. |
| `focus-traps` | `false` | Also press Tab through each route to find keyboard traps. |
| `tags` | | Comma-separated axe tags to limit the rules, e.g. `wcag22aa,best-practice`. |
| `framework-prefixes` | | Component-name prefixes to treat as third-party primitives, e.g. `Mat,Cdk,Nz`. |
| `serve-timeout` | `180` | Seconds to wait for the dev server. |
| `wait` | `1500` | Milliseconds to wait after each page loads. |
| `comment` | `true` | Comment on pull requests. |
| `upload-artifact` | `true` | Upload the reports. |
| `artifact-name` | `a11y-report` | Artifact name. It must be unique in the workflow run, so a matrix or a second scan needs its own, e.g. `a11y-report-${{ matrix.app }}`. Each name also gets its own comment. |
| `devtools-version` | `0.18.0` | Version of `@ngbracket/a11y-devtools` to run. |
| `playwright-version` | `1.63.0` | Version of Playwright to run the browser with. |
| `github-token` | `github.token` | Token for the comment. |

The [CLI reference](https://ngbracket.com/tools/a11y-devtools/docs/cli) describes each option in more detail.

## Outputs

| Output | What it is |
|---|---|
| `findings` | Findings across all routes. |
| `distinct-rules` | Distinct axe rules that fired. |
| `new` | Findings not in the baseline. Empty without a baseline. |
| `fixed` | Baseline findings that are gone. Empty without a baseline. |
| `report-json` | Path to the JSON report, ready to commit as the next baseline. |

## Pull requests from forks

A pull request from a fork gets a read-only token, so the action can't comment. It logs a warning, and the result is still in the job summary and the artifact.

Don't switch to `pull_request_target` to get the comment back. That event runs with a write token, and this action runs the pull request's code (`npm ci` and your dev server). Keep the scan on `pull_request`.

## How it installs

The action installs `@ngbracket/a11y-devtools` and Playwright into a temporary folder, so your `package.json` and lockfile aren't touched. Chromium is cached between runs. On Linux runners Playwright also installs the browser's system libraries.

## What a scan covers

Automated checks cover only part of WCAG. A clean scan means axe found nothing at or above `fail-on` on the routes you listed, and the keyboard checks found nothing if you turned them on. You still need to check by keyboard, with a screen reader, and review the content. [What the scan covers](https://ngbracket.com/tools/a11y-devtools/docs/coverage) goes into detail.

## Versions

`@v1` moves to each 1.x release. A release can change the default `devtools-version` and `playwright-version`, which can add rules and so add findings. To control when that happens, pin a release (`@v1.0.0`) or set `devtools-version` yourself. The [changelog](CHANGELOG.md) lists the versions each release uses.

## Licence

MIT
