#!/usr/bin/env bash
# Waits for a pull request's checks to finish and reports how they ended.
#
# Usage: wait-for-checks.sh <pr-number-or-url>
# Exit codes:
#   0  every check passed or was skipped
#   1  a check failed, was cancelled, or is still pending
#   2  no checks were reported (the repo has no CI for this PR)
#   64 bad usage
set -uo pipefail

pr="${1:-}"
if [[ -z "$pr" ]]; then
  echo "Usage: $0 <pr-number-or-url>" >&2
  exit 64
fi

check_count() {
  local count
  count=$(gh pr checks "$pr" --json name --jq 'length' 2>/dev/null) || count=0
  [[ "$count" =~ ^[0-9]+$ ]] || count=0
  echo "$count"
}

# Checks can take a little while to register after a push: give them up to 3 minutes.
count=0
for _ in $(seq 1 18); do
  count=$(check_count)
  ((count > 0)) && break
  sleep 10
done
if ((count == 0)); then
  echo "No checks reported for PR $pr."
  exit 2
fi

# Watch until everything finishes, then once more in case a later workflow started meanwhile.
gh pr checks "$pr" --watch --fail-fast --interval 20 >/dev/null 2>&1
sleep 15
gh pr checks "$pr" --watch --fail-fast --interval 20 >/dev/null 2>&1

summary=$(gh pr checks "$pr" --json name,bucket --jq '.[] | "\(.bucket)\t\(.name)"' 2>/dev/null)
echo "$summary"
if [[ -z "$summary" ]] || grep -qE '^(fail|cancel|pending)' <<<"$summary"; then
  exit 1
fi
exit 0
