# Antigravity workspace guidance

Antigravity discovers the flat `.agents/rules/*.md` files and each
`.agents/skills/<name>/SKILL.md`. The owner also requested a `SKILLS.md` in
each skill folder; those files hold the detailed procedure, and the native
`SKILL.md` entry point tells Antigravity to read them. These instructions
apply to future work, not retroactively to previously signed-off phases.

Read `docs/decisions/plans/IMPLEMENTATION_PLAN.md` for gate order,
`docs/decisions/DIRECTION.md` for owner decisions, `TODO.md` for task history,
and `docs/decisions/current/status/CONFORMANCE.md` for measured status.
None alone proves the system is complete. `docs/decisions/current/PIPELINE_RESPONSIBILITY_MAP.md`
maps terms and running code paths. Treat older prose and generated summaries
as hypotheses until checked against source, tests, and the owner's decisions.

The linked video, [The Paradox of Why AI Code Is Failing Us — 3 Pillars](https://www.youtube.com/watch?v=k2qls2LiBRc),
motivates three checks: keep change scope bounded because context is finite;
trace non-obvious cross-module effects because attention can miss them; and
verify retrieved descriptions against the live tree because an index can be
stale or incomplete. Its feature-demand argument also supports a deletion and
dependency check before adding code. These are engineering responses to the
video's themes, not claims that the video prescribes this repo's exact rules.
The YouTube chapter list and a [timestamped summary transcript](https://summyt.app/summaries/ai/the-paradox-of-why-ai-code-is-failing-us-3-pillars-k2qls2LiBRc)
were available; [Filmot](https://filmot.com/) was checked on 2026-09-28,
but its web search exposed a captcha and the direct video page was not
accessible; the browser helper also failed before loading the site. No
Filmot subtitle text has been verified. Recheck exact wording against captions before
using any quotation; these instructions paraphrase themes only.

Rule files use Antigravity's documented `trigger: always_on` frontmatter:
- [`rules/00-authority-and-truth.md`](./rules/00-authority-and-truth.md)
- [`rules/01-small-vertical-slices.md`](./rules/01-small-vertical-slices.md)
- [`rules/02-boundary-and-review.md`](./rules/02-boundary-and-review.md)
- [`rules/03-stop-and-goal-integrity.md`](./rules/03-stop-and-goal-integrity.md)
- [`rules/04-context-preservation-and-anti-bloat.md`](./rules/04-context-preservation-and-anti-bloat.md) (guards context window, resists Jevons bloat, defeats RAG blind spots)

Skills use its required singular `SKILL.md` manifest; `SKILLS.md` is the
owner-requested procedure. Available skills:
- [`skills/codebase-orientation`](./skills/codebase-orientation/SKILL.md)
- [`skills/goal-checkpoint`](./skills/goal-checkpoint/SKILL.md)
- [`skills/incremental-delivery`](./skills/incremental-delivery/SKILL.md)
- [`skills/system-reliability-review`](./skills/system-reliability-review/SKILL.md)
- [`skills/context-recovery`](./skills/context-recovery/SKILL.md) (5-step recovery after context compaction or detected drift)

See [Antigravity rules](https://www.antigravity.google/docs/rules/)
and [skills](https://www.antigravity.google/docs/skills/). Its
[Stop hook contract](https://www.antigravity.google/docs/hooks) exposes
execution-loop state and a continue/stop decision, not a proof of the
repository goal's completion. A separately installed global hook can inject
instructions, so the owner should audit global hook configuration as well;
workspace prose alone cannot override a higher-priority hook instruction.
