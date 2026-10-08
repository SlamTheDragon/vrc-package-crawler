# Agent Publishing Procedure

Human steps are in [PUBLISHING.md](PUBLISHING.md).
This file defines agent publishing rules and branch invariants.

---

## 1. Core Lifecycle Rules

1. Slices mean local commit. Completed gates mean push.
   Do not push individual incomplete slices.
   Commit each slice locally as a checkpoint.
   Push to the remote tracking branch only when the capability gate passes all checks.

2. Start every publication from root `package.json` scripts.
   Do not edit version configuration JSON files by hand.
   Publish only products whose delivered behavior changed.

3. Publish producers before consumers.
   Publish SDK contracts first.
   Next publish network contracts if peer bounds changed.
   Then publish dependent services and applications.

---

## 2. Repository Branch Layout

Agents must operate within the designated product branches:

| Branch Name | Products Covered | Channel | Rules |
| :--- | :--- | :--- | :--- |
| `main` | All products | Production | Protected branch. Clean tree required. |
| `preview/crawler-network` | `src-worker`, `src-crawler`, `src-worker/packages/network` | Preview | Feature branch for crawler and worker fleet. |
| `preview/desktop-client` | `src-crawler-client` | Preview | Feature branch for desktop client. |
| `preview/web` | `src-web`, `src-web-search` | Preview | Feature branch for web and search modules. |
| `preview/workers-api` | `src-package` (`vrc-packages-api`) | Preview | Feature branch for API SDK package. |
| `release/patch/*` | Target product undergoing hotfix | Release / Patch | Short-lived patch branch. Merged and deleted after fix. |
| `release/candidate/*` | Candidate release items | Release candidate | Short-lived candidate PR into `main`. Overridden only with `--force`. |

---

## 3. Preview Publishing Rules

1. Any branch can publish a preview if the branch is ahead of origin.
   Preview publishing does not require a pull request.
   Preview publishing does not require clean main.

2. Use `bun run publish:preview <product> --execute`.
   The command checkpoints pending non-ignored files, bumps CalVer patch, tags, and pushes.
   Inspect printed paths before execution.
   Never force-add ignored files.

3. Monitor the resulting CI workflow run.
   Read the status with `bun run publish:status <tag>`.
   Verify published assets with `bun run publish:check <tag>`.

---

## 4. Release Publishing Rules

1. Release preparation requires clean `main`.
   Promote feature changes to `main` before starting release publishing.
   Make sure local `main` matches `origin/main`.

2. Prepare a candidate pull request:
   Run `bun run publish:release <product> --execute`.
   The command pushes the candidate metadata branch to origin.
   It outputs the pull request URL.

3. The repository owner reviews and merges the pull request.
   Never merge or approve pull requests on the owner's behalf.
   An owner-reviewed merge needs no second reviewer.

4. Finalize the release tag on `main`:
   Fetch and inspect merged `main`: `git pull origin main`.
   Run `bun run publish:finalize <product> <pr-number> <merged-sha> --execute`.
   The finalizer tags the exact merged commit on `main`.

5. Protected environment approvals remain owner-only.
   Never approve GitHub deployment environments or npm stages for the owner.
   Wait for owner approval in GitHub Actions.

---

## 5. Failure Diagnosis and Recovery Rules

1. Reruns execute the frozen tagged commit.
   A workflow rerun tests the exact commit bound to the tag.
   Use `bun run recovery:rerun <runId>` only for transient network drops, CDN timeouts, or rate limits.

2. Code fixes require a new commit from an ahead branch.
   Do not rerun a failed workflow run to test a code fix.
   To fix code in preview:
   Delete the unverified tag with `bun run recovery:revert-tag <tag> --remote`.
   Commit your fix locally.
   Re-trigger publishing: `bun run publish:preview <product> --execute`.

3. For critical release fixes, use `bun run recovery:patch <product> <version>`.
   Apply the fix on the temporary `release/patch/*` branch.
   Test and verify the fix.
   Merge the patch branch back to your working branch and delete the patch branch.

4. Keep the repository test workflow configured with `fetch-depth: 0` and `submodules: recursive`.
   Do not alter test assertions to hide missing tags or missing submodules.

5. Record the tag, CI run ID, asset check result, and remaining risks in `docs/scratch/task_tracker.md`.
