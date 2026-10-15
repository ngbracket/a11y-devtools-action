# ngbracket a11y-devtools

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
| `serve-timeout` | `180` | Seconds to wait for the dev server. A failed Angular build stops the scan straight away. |
| `wait` | `1500` | Milliseconds to wait after each page loads. |
| `comment` | `true` | Comment on pull requests. |
| `upload-artifact` | `true` | Upload the reports. |
| `artifact-name` | `a11y-report` | Artifact name. It must be unique in the workflow run, so a matrix or a second scan needs its own, e.g. `a11y-report-${{ matrix.app }}`. Each name also gets its own comment. |
| `devtools-version` | `0.18.3` | Version of `@ngbracket/a11y-devtools` to run. |
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

## FAQ

### Does it work with Bun, pnpm or Yarn?

The action installs its own tools with npm into a temporary folder, so your app's package manager doesn't matter to it. Replace the `npm ci` step with your package manager's install. Keep `actions/setup-node`, because the scan runs on Node 20.19, 22.12, or 24 and later.

This is the Bun version, tested on the Angular RealWorld example app:

```yaml
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - uses: ngbracket/a11y-devtools-action@v1
        with:
          serve: npx ng serve
          routes: /
```

For pnpm with `cache: pnpm`, install pnpm with `pnpm/action-setup` before `actions/setup-node`, or setup-node can't find it.

### Setup fails with "Dependencies lock file is not found"

`actions/setup-node` with `cache: npm` looks for `package-lock.json`. If your project uses another package manager, change or remove `cache`. If the app is in a subfolder, point setup-node at its lockfile with `cache-dependency-path`, for example `apps/web/package-lock.json`, and set the action's `working-directory` to the same folder. If there's no `package.json` anywhere, check that the workflow is in the repo that holds the Angular app.

### The scan fails with "The Angular build failed", "Dev server didn't answer" or "Dev server command exited"

"The Angular build failed" means `ng serve` printed a build error. "Didn't answer" means the dev server didn't respond within `serve-timeout` seconds. "Command exited" means the `serve` command stopped before the server responded, for example because the script doesn't exist. Each time, the log shows the last lines the server printed, under "Last output". The usual causes:

- The Angular build failed. Look for `ERROR` in the last output. A common one is `Could not resolve "…"` for a file in a git submodule: add `submodules: true` to `actions/checkout`.
- The build is slow. Raise `serve-timeout` (180 seconds by default).
- The server runs on another port. Set `base-url`.
- The app needs a script before it serves, such as code generation in a `prestart` script. Use `serve: npm start` instead of `npx ng serve`.

### `npm ci` fails while building `node-sass`

Older Angular projects sometimes still list `node-sass`. Version 4 has no prebuilt binary for current Node, so npm tries to compile it and fails with `gyp ERR!`. The Angular CLI compiles Sass with the `sass` package, so `node-sass` is usually unused. Skip install scripts, then run any your app needs:

```yaml
      - run: npm ci --ignore-scripts
      - run: npm run postinstall # only if package.json has one, e.g. ngcc on Angular 15
```

### The workflow doesn't run in my fork

GitHub turns off Actions in a new fork. Open the fork's Actions tab and enable workflows.

### There's no comment on my pull request

The action comments only on `pull_request` runs, when the workflow has `pull-requests: write` permission and `comment` is `true`. A run started any other way, such as from the Actions tab, puts the result in the job summary and the `a11y-report` artifact instead.

A pull request from a fork into the original repo gets a read-only token, so the action can't comment there either. If you're trying the action in your own fork, open the pull request against your fork's default branch. See [Pull requests from forks](#pull-requests-from-forks) before changing the trigger.

### Every finding says "(unknown component)"

The scan ran against a production build. Component names come from Angular's dev-mode debug API, so `serve` has to start a development build, such as `ng serve` with its default configuration.

### The report shows the login page, or an empty page

The scan isn't signed in to your app. Routes behind a login redirect to the login page, and pages that load data from an API show whatever that API returns. List routes that render without signing in, and check the page labels in the first report.

### Does a clean scan mean the app is accessible?

No. It means the automated checks found nothing at or above `fail-on` on the routes you listed. You still need to check by keyboard, with a screen reader, and review the content. See [What a scan covers](#what-a-scan-covers).

## Development

The scripts have no dependencies. `npm test` runs the tests with Node's built-in test runner.

## Versions

`@v1` moves to each 1.x release. A release can change the default `devtools-version` and `playwright-version`, which can add rules and so add findings. To control when that happens, pin a release (`@v1.0.0`) or set `devtools-version` yourself. The [changelog](CHANGELOG.md) lists the versions each release uses.

## Licence

MIT
