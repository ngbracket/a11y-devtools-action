#!/usr/bin/env bash
# Runs ngbr-a11y-report with the action's inputs (IN_* env vars) and records
# the exit code instead of failing, so the summary, artifact and comment steps
# still run. The last step of the action applies the gate.
set -uo pipefail

cli="$NGBR_A11Y_TOOLS/node_modules/@ngbracket/a11y-devtools/bin/ngbr-a11y-report.mjs"
out_dir="$RUNNER_TEMP/ngbr-a11y-report"
mkdir -p "$out_dir"
prefix="$out_dir/a11y"

args=(--base "$IN_BASE_URL" --out "$prefix" --format all)

routes=0
while IFS= read -r route; do
  route="$(echo "$route" | xargs)"
  [ -n "$route" ] || continue
  args+=(--route "$route")
  routes=$((routes + 1))
done < <(printf '%s\n' "$IN_ROUTES" | tr ',' '\n')

if [ "$routes" -eq 0 ]; then
  echo "::error title=Accessibility scan::The routes input is empty. Give at least one route, e.g. /."
  echo "exit-code=2" >> "$GITHUB_OUTPUT"
  exit 0
fi

[ -n "$IN_SERVE" ] && args+=(--serve "$IN_SERVE" --serve-timeout "$IN_SERVE_TIMEOUT")
[ "$IN_FAIL_ON" != "none" ] && [ -n "$IN_FAIL_ON" ] && args+=(--fail-on "$IN_FAIL_ON")
[ -n "$IN_BASELINE" ] && args+=(--baseline "$IN_BASELINE")
[ -n "$IN_DARK_CLASS" ] && args+=(--dark-class "$IN_DARK_CLASS")
[ -n "$IN_DARK_ATTRIBUTE" ] && args+=(--dark-attribute "$IN_DARK_ATTRIBUTE")
if [ -z "$IN_DARK_CLASS$IN_DARK_ATTRIBUTE" ] && [ -n "$IN_COLOR_SCHEME" ]; then
  args+=(--color-scheme "$IN_COLOR_SCHEME")
fi
[ "$IN_KEYBOARD" = "true" ] && args+=(--keyboard)
[ "$IN_FOCUS_TRAPS" = "true" ] && args+=(--focus-traps)
[ -n "$IN_TAGS" ] && args+=(--tags "$IN_TAGS")
[ -n "$IN_FRAMEWORK_PREFIXES" ] && args+=(--framework-prefixes "$IN_FRAMEWORK_PREFIXES")
[ -n "$IN_WAIT" ] && args+=(--wait "$IN_WAIT")

echo "ngbr-a11y-report ${args[*]}"
node "$cli" "${args[@]}"
code=$?

echo "exit-code=$code" >> "$GITHUB_OUTPUT"
echo "report-dir=$out_dir" >> "$GITHUB_OUTPUT"
[ -f "$prefix.json" ] && echo "report-json=$prefix.json" >> "$GITHUB_OUTPUT"
[ -f "$prefix.md" ] && echo "report-md=$prefix.md" >> "$GITHUB_OUTPUT"
exit 0
