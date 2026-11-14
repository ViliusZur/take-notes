---
name: jobs-done
description: Ships the current code changes end to end - creates a branch from main, commits with a descriptive message, opens a PR, merges it once CI passes, then deletes the branch locally and on GitHub. Use whenever the user says "job's done" (also "jobs done", "job done"), or runs /jobs-done.
argument-hint: "[optional note about the change]"
---

# Job's done

The user says "job's done" when the work in the working tree is finished and should land on the
default branch. Saying it authorizes everything below: branch, commit, push, PR, merge once CI
passes, and deleting the branch. Do it without asking again, except where a step says to stop.

If the user added text to the command, use it as context for the commit message and PR description.

## 1. Preflight

Stop with a short explanation if any of these fail:

- `gh auth status`. If not logged in, ask the user to run `gh auth login`, then stop.
- `git remote get-url origin` points at GitHub.
- Default branch: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` (usually
  `main`). Called BASE below.
- `git fetch origin`.

Then look at what is being shipped:

- `git status --porcelain`, `git diff`, `git diff --staged`, and the untracked files.
- Commits not yet on BASE: `git log --oneline origin/BASE..HEAD`.
- Nothing changed and nothing unpushed: tell the user there's nothing to ship, and stop.
- Never commit secrets or local-only files: `.env*` (except `.env.example`), keys, credentials,
  scratch files, large binaries. Leave them out and mention it. If unsure about a file, ask.

## 2. Branch

- On BASE: update it with `git pull --ff-only` (uncommitted changes stay; if git refuses because
  they touch the same files, skip the pull and note the PR may conflict). Then
  `git switch -c <name>`; uncommitted changes come along.
- Already on another branch: ship that branch; don't create a new one.
- Name: short kebab-case describing the change, e.g. `encryption-password-tweaks`. If it exists
  locally or on origin (`git ls-remote --heads origin <name>`), add a suffix.

## 3. Commit

- Stage what ships. Prefer explicit paths over `git add -A` when something is being left out.
- Match the repo's message style (`git log --oneline -10`). Subject: imperative, at most 72
  characters, says what changed. Body: what and why, wrapped at 72, plus anything a reviewer or
  deployer must know (migrations, new env vars, behavior changes).
- End with the commit attribution trailer your environment asks for, if any.
- A failing pre-commit hook: fix the problem and commit again; never `--no-verify`. If it can't
  be fixed, stop and report.

## 4. Push and open the PR

- `git push -u origin <branch>`.
- Reuse an existing PR for the branch (`gh pr list --head <branch> --json number,url`).
- Otherwise `gh pr create --base BASE --head <branch> --title "<subject>" --body-file -`, ready
  for review, not a draft. Follow `.github/pull_request_template.md` if present; otherwise use
  sections **What**, **Why**, **Reviewer notes** (risks, deploy steps) and **Testing** (what was
  run and its result; never claim tests that weren't run). End with the PR attribution line your
  environment asks for, if any.
- In the Claude desktop app, check or bind the PR with the `ccd_pr` tools if they're available.

## 5. Merge once CI passes

Deploy prerequisites first: if the change adds database migrations (`drizzle/`, `migrations/`,
`prisma/migrations/`, `db/migrate/`, ...) or needs new environment variables, and merging deploys
(for example Vercel deploying BASE), stop and ask whether those are in place before merging.

Wait for CI with the script that ships with this skill in the repo. It takes minutes: run it in the
background and wait for it to finish rather than polling.

```bash
"$(git rev-parse --show-toplevel)/.claude/skills/jobs-done/scripts/wait-for-checks.sh" <pr-number>
```

- **Exit 0** (every check passed or was skipped): merge exactly the commit CI tested. Prefer a
  merge commit; check what the repo allows with
  `gh api repos/{owner}/{repo} --jq '{allow_merge_commit,allow_squash_merge,allow_rebase_merge}'`
  and fall back to `--squash`, then `--rebase`:
  `gh pr merge <pr> --merge --match-head-commit "$(git rev-parse HEAD)"`
- **Exit 1** (a check failed, was cancelled, or is still pending): don't merge. Show
  `gh pr checks <pr>` and, for GitHub Actions, the failing lines
  (`gh run view <run-id> --log-failed`). Leave the PR and branch in place, report, and stop.
- **Exit 2** (no checks at all): there is no CI to wait for. Ask whether to merge anyway.
- Merge refused (conflicts, branch protection, required review): report why and stop. Never force
  it, and never enable GitHub auto-merge or change repository settings to get around it.

## 6. Clean up

Only after `gh pr view <pr> --json state --jq .state` says `MERGED`:

- `git switch BASE && git pull --ff-only`. If that fails only because local BASE held the shipped
  commits and the PR was squashed or rebased, run `git reset --keep origin/BASE`.
- `git branch -d <branch>`. If git refuses after a squash or rebase merge, the PR being merged is
  enough proof: use `git branch -D <branch>`.
- `git push origin --delete <branch>` (skip if GitHub already deleted it), then
  `git fetch --prune origin`.

## 7. Report

A few lines: the PR link, the merge commit, that the branch is gone locally and on GitHub, and
anything still to do (deploy steps, migrations).
