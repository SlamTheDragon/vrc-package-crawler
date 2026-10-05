# Agent delivery procedure — R57-C57A

This procedure describes the accepted root chain. It does not start R57-C57B or change milestone publication rules.
Use [the human manual](../source/DELIVERY.md#human-delivery-procedure) for commands and product responsibilities.
Read AGENTS.md and the active three scratch documents before delivery.

- Read the latest owner authorization for the selected product and channel.
- Keep the SDK v0.1 owner-review hold and separate npm stage approval.
- Preserve dirty owner changes. Do not include them in an automatic delivery commit.
- Complete the related capability gate before its grouped tests and checkpoint.
- Review the diff, package boundaries, secrets, changelog and disabled delivery paths.
- Commit and push only authorized files before the delivery chain.
- Read the dry-run plan before adding --execute.
- Record the exact source commit, configured version, tag and CI run.
- Observe that run without dispatching duplicate builds or changing protected environments.
- Keep failed push state for an exact retry. Never replace a published tag.
- Check both requested artifact channels and record open behavior separately from checked bytes.
- For containers, check the publication receipt and registry digests independently of binary assets.
- For installers, retain the app's pre label and config-derived numeric MSI version.
- Keep checkpoints concise. Passing CI does not close the full goal.

Root commands create no local release binaries. CI owns release artifacts.
Website delivery remains deferred. Cloudflare has no GitHub Release assets.
Private network npm publication, installation identity and live fleet recovery remain separate decisions.
After R57-C57A proof, ask the owner through the requested question hook before R57-C57B.
