#!/usr/bin/env bash
# Installs Chromium for the scan (IN_BROWSER_DEPS: auto or always).
#
# On Linux, Playwright's --with-deps installs the browser's system packages
# with apt, and a slow Ubuntu mirror can stretch that to 10 minutes or more.
# GitHub's Ubuntu runners already have Chromium's libraries; apt only adds
# fonts for scripts such as Chinese, Japanese and Thai. So with "auto" the
# browser is installed on its own, and apt runs only when Chromium can't start
# without it (a container or a bare self-hosted runner). "always" installs the
# packages every time, as releases before 1.1.0 did.
set -euo pipefail

playwright="$NGBR_A11Y_TOOLS/node_modules/.bin/playwright"
deps="$(printf '%s' "${IN_BROWSER_DEPS:-auto}" | tr '[:upper:]' '[:lower:]')"

case "$deps" in
  auto | always) ;;
  *)
    echo "::error title=Accessibility scan::browser-deps must be auto or always. Got \"${IN_BROWSER_DEPS:-}\"."
    exit 1
    ;;
esac

if [ "$RUNNER_OS" != "Linux" ]; then
  "$playwright" install chromium
  exit 0
fi

if [ "$deps" = always ]; then
  "$playwright" install --with-deps chromium
  exit 0
fi

"$playwright" install chromium
# Load the action's own Playwright by path. A bare require('playwright') would
# find the app's copy first when the job runs in a checkout that has one.
if launch_log="$(timeout 60 node -e \
  "require(process.argv[1]).chromium.launch().then((b) => b.close())" \
  "$NGBR_A11Y_TOOLS/node_modules/playwright" 2>&1)"; then
  echo "Chromium starts with the runner's own libraries, so its system packages aren't installed."
else
  echo "Chromium didn't start. The first lines of its error:"
  sed -n '1,10s/^/  /p' <<< "$launch_log"
  echo "Installing its system packages."
  "$playwright" install-deps chromium
fi
