# Publishing Guide and Monorepo Operations

This guide describes how to build, test, and publish products across the monorepo.
It covers automated commands, recovery pathways, and manual web procedures.

---

## 1. Repository Branch Layout

Use the designated branch for each product domain:

| Branch Name | Products Covered | Channel | Lifecycle |
| :--- | :--- | :--- | :--- |
| `main` | All products | Production / Release | Permanent protected branch |
| `preview/crawler-network` | `src-worker`, `src-crawler`, `src-worker/packages/network` | Preview | Feature and iteration branch |
| `preview/desktop-client` | `src-crawler-client` | Preview | Feature and iteration branch |
| `preview/web` | `src-web`, `src-web-search` | Preview | Feature and iteration branch |
| `preview/workers-api` | `src-package` (`vrc-packages-api`) | Preview | Feature and iteration branch |
| `release/patch/*` | Target product undergoing fix | Release / Patch | Short-lived patch branch |
| `release/candidate/*` | Candidate release items | Release candidate | Short-lived candidate PR into `main` |

---

## 2. Command Selection Matrix

Select the command that matches your task:

| Task | Command | Type | Description |
| :--- | :--- | :--- | :--- |
| First-time setup | `bun run setup` | Interactive | Installs dependencies and prompts for tokens |
| Build all products | `bun run build` | Automated | Builds 7 products in dependency order |
| Run repository tests | `bun run test` | Automated | Runs all governance and publishing test suites |
| Interactive publishing | `bun run publish` | Interactive | Prompts for target, channel, bump, and action |
| Plan preview publishing | `bun run publish:preview <product>` | Dry-run | Shows next CalVer patch version and checks blockers |
| Execute preview publish | `bun run publish:preview <product> --execute` | Automated | Commits, tags, and pushes to trigger preview CI |
| Plan release publishing | `bun run publish:release <product>` | Dry-run | Shows next SemVer version and creates PR plan |
| Execute release publish | `bun run publish:release <product> --execute` | Automated | Pushes version candidate branch and gives PR URL |
| Finalize release | `bun run publish:finalize <product> <pr> <sha> --execute` | Automated | Tags merged commit on `main` to trigger release CI |
| Check CI run status | `bun run publish:status <tag>` | Read-only | Reads live status of GitHub Actions run |
| Verify published assets | `bun run publish:check <tag>` | Read-only | Verifies release assets, hashes, or registry presence |
| Diagnose failure | `bun run publish:diagnose <tag>` | Read-only | Analyzes failure point and prints recovery options |
| Interactive recovery | `bun run recovery` | Interactive | Prompts for tag and runs selected recovery action |
| Rerun frozen CI run | `bun run recovery:rerun <runId>` | Automated | Dispatches rerun for transient CI failures |
| Revert unverified tag | `bun run recovery:revert-tag <tag> [--remote]` | Automated | Deletes failed tag locally and remotely |
| Create patch branch | `bun run recovery:patch <product> <version>` | Automated | Switches to temporary `release/patch/*` branch |
| Check branch sync | `bun run sync:check` | Read-only | Detects drift between local branch and remote origin |
| Sync internal network | `bun run sync:deps` | Automated | Aligns network package version across consumers |

---

## 3. Core Operational Checklists

### A. Initial Setup and Onboarding Checklist
- [ ] Run `bun run setup` from the repository root.
- [ ] Enter your GitHub Personal Access Token when prompted.
- [ ] Make sure your token has repo and workflow permissions.
- [ ] Skip optional tokens if you do not plan to deploy those services locally.
- [ ] Verify that all 8 subprojects finish dependency installation.

### B. Preview Channel Publishing Checklist
Use the preview channel for rapid development and testing.
Any branch can publish a preview if the branch is ahead of its remote tracking branch.

- [ ] Make sure your current branch is ahead of `origin`.
- [ ] Run `bun run sync:check` to check for branch drift.
- [ ] Run `bun run test` to verify local test suites pass.
- [ ] Run `bun run publish:preview <product>` to inspect the plan.
- [ ] Run `bun run publish:preview <product> --execute` to publish.
- [ ] Wait for the terminal to print the GitHub Actions run URL.
- [ ] Run `bun run publish:status <tag>` to monitor CI progress.
- [ ] Run `bun run publish:check <tag>` to verify published assets.

### C. Release Channel Publishing Checklist
Release publishing requires strict review.
Releases must originate from a clean `main` branch.

- [ ] Check out the `main` branch: `git checkout main`.
- [ ] Pull latest changes: `git pull origin main`.
- [ ] Make sure your working tree is clean.
- [ ] Run `bun run test` to confirm all tests pass.
- [ ] Run `bun run publish:release <product>` to plan the version bump.
- [ ] Run `bun run publish:release <product> --execute` to create the candidate PR.
- [ ] Open the pull request URL printed in the terminal.
- [ ] Review changes and merge the pull request into `main`.
- [ ] Pull the merged commit locally: `git pull origin main`.
- [ ] Run `bun run publish:finalize <product> <pr-number> <merged-sha> --execute`.
- [ ] Complete the protected environment approvals in GitHub Actions.
- [ ] Run `bun run publish:check <tag>` to verify final release assets.

---

## 4. Problem Diagnosis and Recovery Checklists

Choose the recovery pathway that matches the failure type:

### Pathway 1: Transient Failures (Network, Registry Timeout, Rate Limits)
Use this pathway when code is correct but external services failed.
A rerun executes the frozen tagged commit.

- [ ] Run `bun run publish:diagnose <tag>` to check the failed step.
- [ ] If the error was transient, locate the CI run ID in the output.
- [ ] Run `bun run recovery:rerun <runId>` to re-execute failed jobs.
- [ ] Monitor the run with `bun run publish:status <tag>`.

### Pathway 2: Code Defects and Test Failures (Code Fixes)
Do not rerun a workflow to test code fixes.
Workflow reruns test the frozen commit, not your new code.

- [ ] Identify the failure in the test logs.
- [ ] Delete the failed tag locally and remotely:
  ```sh
  bun run recovery:revert-tag <tag> --remote
  ```
- [ ] Apply the necessary code fix to your working branch.
- [ ] Run local tests to verify the fix: `bun run test`.
- [ ] Commit your fix locally (slices mean local commit).
- [ ] Re-trigger publishing from your ahead branch:
  ```sh
  bun run publish:preview <product> --execute
  ```

### Pathway 3: Release Hotfixes via Patch Branches
Use this pathway when a release failure requires a short-lived isolated fix.

- [ ] Run `bun run recovery:patch <product> <version>`.
- [ ] The command creates and checks out `release/patch/<product>/v<version>`.
- [ ] Apply the code fix on the patch branch.
- [ ] Commit your changes locally.
- [ ] Merge the patch branch back to your main working branch.
- [ ] Delete the temporary patch branch after merge.
- [ ] Restart the release publishing sequence.

### Pathway 4: Version and Configuration Drift
Use this pathway when local version files disagree with remote tags.

- [ ] Run `bun run sync:check` to inspect drift across all products.
- [ ] If preview versions drifted, run `bun run versions:sync:preview`.
- [ ] If release versions drifted, run `bun run versions:sync:release`.
- [ ] If internal dependencies drifted, run `bun run sync:deps`.
- [ ] Commit any corrected configuration files.

---

## 5. Manual and Web UI Procedures

These actions require human operator intervention and cannot run autonomously via CLI:

### 1. GitHub Protected Environment Approvals
GitHub Actions blocks production secret exposure until a repository admin approves.

1. Open the repository Actions tab in your browser.
2. Click the active workflow run for your version tag.
3. Locate the pending stage with the amber badge.
4. Click **Review deployments**.
5. Select the target environment (for example, `npm-release` or `vrcp-crawler-release`).
6. Click **Approve and deploy**.

### 2. Candidate Pull Request Review and Merge
Release tags require an owner-merged pull request into `main`.

1. Open the pull request link generated by `publish:release`.
2. Inspect the automated version bump and changelog entries.
3. Make sure all status checks are green.
4. Merge the pull request using **Squash and merge** or **Merge commit**.
5. Copy the merged commit SHA from GitHub.
6. Use the SHA in your `publish:finalize` command.

### 3. Discord Webhook CI Secrets Configuration
Webhooks must never exist in local developer `.env` files.
They belong strictly in GitHub Actions secrets.

1. Open repository **Settings** -> **Secrets and variables** -> **Actions**.
2. Set `DISCORD_RELEASE_WEBHOOK` in Repository Secrets for public announcements.
3. Set `DISCORD_STAGING_WEBHOOK` in Environment Secrets for protected staging alerts.
4. Optional: set `DISCORD_STAGING_PING` in Repository Variables with user or role ID.

### 4. Emergency Remote Tag Deletion
If an invalid tag was pushed and remote rules prevent local deletion:

1. Delete the local tag: `git tag -d <tag-name>`.
2. Open the GitHub repository in your browser.
3. Navigate to **Code** -> **Tags**.
4. Locate the target tag and click the delete button.

---

## 6. Diagnostics & Troubleshooting Matrix

| Symptom | Root Cause | Exact Remediation Command |
| :--- | :--- | :--- |
| `Needed a single revision` | Shallow clone missing git tags | Run `git fetch --tags` or set `fetch-depth: 0` in CI |
| Submodule package missing | Submodules not checked out recursively | Run `git submodule update --init --recursive` |
| `Branch behind origin` | Local branch lacks remote commits | Run `git pull origin <branch>` before publishing |
| `Version config drift` | Local version JSON out of sync with tags | Run `bun run versions:sync:<channel>` |
| Edge CDN timeout on publish | Registry replication delay (transient) | Run `bun run recovery:rerun <runId>` |
| Test failure in CI step | Code defect in source files | Run `bun run recovery:revert-tag <tag> --remote`, fix code, re-publish |
| Draft release unlinked | CI stopped before asset finalization | Run `bun run publish:reconcile` |
| Missing staging alerts | Webhook not configured in CI secrets | Add `DISCORD_STAGING_WEBHOOK` to environment secrets in GitHub |
