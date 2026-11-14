---
name: send-that-shit
description: Sends the current code changes straight to the current branch - bumps the project version, commits with a detailed message, pushes the commit to the branch it is on, then tags that commit with the matching semantic version and pushes the tag. No new branch, no PR, no merge. Use whenever the user says "send that shit" (also "send this shit", "send that sh*t"), or runs /send-that-shit.
argument-hint: "[optional note about the change]"
---

# Send that shit

The user says "send that shit" when the work in the working tree is finished and should go
straight onto the branch they are on, with a version tag. It is the quick sibling of "job's done":
same version and tag rules, but no new branch, no pull request and no merge. Saying it authorizes
everything below: version bump, commit, push to the current branch, and pushing a version tag. Do
it without asking again, except where a step says to stop.

If the user added text to the command, use it as context for the commit message and the tag
message.

## 1. Preflight

Stop with a short explanation if any of these fail:

- `git remote get-url origin` exists. Call the remote `origin` below.
- On a branch, not a detached HEAD: `git symbolic-ref --short HEAD`. Call it BRANCH. Any branch
  is fine, the default branch included: the user chose to push where they are.
- No merge, rebase or cherry-pick in progress (`git status` says so).
- `git fetch origin --tags`, so the version tags and the remote branch are current.

Then look at what is being sent:

- `git status --porcelain`, `git diff`, `git diff --staged`, and the untracked files.
- Commits not on the remote yet: `git log --oneline @{u}..HEAD` when BRANCH has an upstream,
  otherwise `git log --oneline origin/<default-branch>..HEAD`.
- Nothing changed and nothing unpushed: tell the user there is nothing to send, and stop. If HEAD
  is already pushed but has no version tag (`git tag --points-at HEAD`), mention that it could
  still be tagged.
- Never commit secrets or local-only files: `.env*` (except `.env.example`), keys, credentials,
  scratch files, large binaries. Leave them out and mention it. If unsure about a file, ask.

## 2. Pick the version and bump the manifest

The release version is written into the project's manifest in the commit that gets the tag, so
the commit and its tag always agree.

- Previous version: the newest semver tag anywhere in the repo,
  `git tag --list 'v[0-9]*' --sort=-v:refname | head -1`. Tags are shared by every branch, so a
  number used on another branch is still taken. Keep the repo's prefix style (`v1.2.3` or
  `1.2.3`; default `v`). No tags yet: the manifest's `version`, or `0.0.0`. If the manifest is
  already ahead of the newest tag, a release may never have been tagged: ask which version to
  start from.
- Bump by the biggest change since the last version on this branch: what this commit sends plus
  any untagged commits before it. The last version reachable from HEAD is
  `git describe --tags --abbrev=0 --match 'v[0-9]*' HEAD`; list what came after it with
  `git log --format='%h %s' <that tag>..HEAD`.
  - **major**: breaking for users, API clients, or deployers. Removed or incompatible behavior or
    endpoints, migrations that drop or rewrite data, newly required config. While the major
    version is 0, bump the minor instead, and never go to 1.0.0 unless the user asks.
  - **minor**: new features or capabilities, new endpoints, additive migrations.
  - **patch**: fixes, small tweaks, copy changes, refactors, tests, docs, tooling, CI.
- The version must not be tagged already (`git ls-remote --tags origin vX.Y.Z` prints nothing).
  Never move or reuse a tag.
- Write it into the manifest:
  - `package.json`: `npm version X.Y.Z --no-git-tag-version --ignore-scripts`. It also updates
    `package-lock.json`, and neither commits nor tags.
  - Other manifests (`Cargo.toml`, `pyproject.toml`, ...): edit the `version` field, and the root
    package's entry in the lockfile if there is one.
  - No manifest with a version: skip this; the tag alone carries the version.

## 3. Commit with a detailed message

The commit message is the main record of this change, since there is no pull request to explain
it. Write it for someone reading `git log` months from now who needs to know what changed and why
without opening the diff.

- The version bump goes in the same commit as the change.
- Stage what is being sent. Prefer explicit paths over `git add -A` when something is being left
  out.
- Read the whole diff before writing, and match the repo's style (`git log --oneline -10`).
- Format:

  ```text
  <Subject: imperative, at most 72 characters, says what changed>

  <One or two short paragraphs: what this change does and why it was
  needed. Wrap at 72 characters.>

  Changes:
  - <Area or file group>: <what changed, in plain words>
  - <...>

  Notes:
  - <Migrations to run, new env vars, behavior or API changes, anything a
    reviewer or deployer must know; or "None.">

  Version: vX.Y.Z (<major|minor|patch>: <one-line reason for the bump>)
  ```

- End with the commit attribution trailer your environment asks for, if any.
- Nothing uncommitted, only unpushed commits: leave those commits as they are and add one release
  commit with just the version bump. Its subject is `Release vX.Y.Z`, and its body summarizes the
  commits it releases in the same format.
- A failing pre-commit hook: fix the problem and commit again; never `--no-verify`. If it can't
  be fixed, stop and report.

## 4. Push to the current branch

- BRANCH has an upstream: `git push`. No upstream yet: `git push -u origin BRANCH`.
- Rejected because the remote branch has new commits: `git pull --rebase`, then push again. If
  the rebase conflicts, run `git rebase --abort`, stop, and report: the commit stays local and
  nothing is tagged.
- Rejected for any other reason (branch protection, required pull requests, permissions, a
  failing pre-push hook you can't fix): stop and report why. The commit stays local and nothing
  is tagged. If the branch requires pull requests, suggest "job's done" instead.
- Never force push and never `--no-verify`.

## 5. Tag the pushed commit

- Confirm the push landed: `git fetch origin` and `git rev-parse HEAD` equals
  `git rev-parse @{u}`. A rebase in step 4 changes the commit, so always tag the current HEAD.
- Confirm HEAD carries the version (for example `git show HEAD:package.json | grep '"version"'`)
  and the tag is still free. If someone took that version in the meantime, stop and ask.
- The tag message is written for someone deciding whether to deploy, not a raw commit dump. Build
  it from `git log --format='%h %s' <last version reachable from HEAD>..HEAD` (just `HEAD` when
  there is none) and the commit bodies:

  ```text
  vX.Y.Z: <one-line summary of the release>

  <Two or three sentences: what this release brings and why it matters.>

  Changes since <previous version>:
  - <Change, in plain words> (<short sha>)
  - ...

  Upgrade notes:
  - <Migrations to run, new env vars, breaking changes, follow-ups; or "None.">
  ```

- Create and push it (git signs it if the user's config asks for signed tags):

  ```bash
  git tag -a vX.Y.Z HEAD -F - <<'EOF'
  <message>
  EOF
  git push origin vX.Y.Z
  ```

## 6. Report

A few lines: the branch and the pushed commit (short sha and subject), the new tag and why that
bump, anything left out of the commit, and anything still to do (deploy steps, migrations). CI
may run on the push; this skill doesn't wait for it, so say that if the repo has CI.
