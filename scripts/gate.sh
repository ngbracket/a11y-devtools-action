#!/usr/bin/env bash
# The action's last step: turns the scan's exit code and the summary's verdict
# into the check result. Fails closed: anything but a clean exit and an
# explicit "pass" fails. Reads SCAN_EXIT, REPORT_JSON and VERDICT.
set -u

if [ -z "${SCAN_EXIT:-}" ]; then
  echo "::error title=Accessibility scan::The scan didn't run. See the earlier steps."
  exit 1
fi
if [ "${SCAN_EXIT:-}" != 0 ] && [ -z "${REPORT_JSON:-}" ]; then
  # No report: the CLI stopped before scanning (bad input, the Angular build
  # failed, the dev server didn't start, or the browser couldn't launch).
  echo "::error title=Accessibility scan::The scan stopped with exit code $SCAN_EXIT before writing a report. See the Scan step log: if the Angular build failed, its errors are at the end."
  exit 1
fi
case "${SCAN_EXIT:-}" in
  0) ;;
  1) echo "::error title=Accessibility scan::Findings at or above the fail-on level. See the job summary."; exit 1 ;;
  *) echo "::error title=Accessibility scan::The scan stopped with exit code $SCAN_EXIT. See the Scan step log."; exit 1 ;;
esac
# Fail closed: anything but an explicit pass from the summary fails.
case "${VERDICT:-}" in
  pass) ;;
  fail) echo "::error title=Accessibility scan::Some pages didn't scan. See the job summary."; exit 1 ;;
  *) echo "::error title=Accessibility scan::The result couldn't be read from the report. See the Summarise step log."; exit 1 ;;
esac
