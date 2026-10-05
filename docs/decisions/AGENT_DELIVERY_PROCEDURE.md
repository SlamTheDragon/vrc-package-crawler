# Agent delivery procedure — G14

This procedure implements R57-C57A and the owner-approved R57-C57B milestone practice.
The owner approved the before-C57B question on 2026-10-06. Publication authority still applies separately to each product and channel.
Human commands and logistics are in [DELIVERY.md](../source/DELIVERY.md).

1. Read the active tracker, canonical decisions and owner changes before selecting a product.
2. Identify its artifact channel separately from its SDK dependency channel.
   Use Bun for installs, package scripts, checks and builds. CI pins Bun 1.4.2.
   Keep npm for registry checks, packing, staging and trusted publication. Keep Node and native runtime compatibility checks.
3. Use preview SDK for crawler and Worker. Use release SDK for desktop and website, even for preview artifacts.
4. Use the single configured network archive for crawler and Worker. Never import sibling producer source.
5. Confirm the required SDK publication exists at its configured version. Do not treat a stage as public npm availability.
6. If network peer bounds change, check and publish the next network archive before dependent consumer delivery.
7. Complete the relevant capability gate or related gate group before tests and checkpoint write-ups.
8. Run root delivery planning. Examine the exact next patch, tag, branch and blockers.
9. Execute the root chain only within owner publication authority. Product forwarding scripts use that same chain.
10. Keep failed delivery tags fixed. Inspect the terminal run before allocating its next configured patch.
11. Check source CI, bytes, receipts, registries and deployment links separately. Green CI alone does not prove those boundaries.
    For Worker tags, run delivery:check to check the Actions archive, tagged configuration and source receipt.
    Keep Worker bundles CI-only. Do not create Release assets or interpret build-only success as production deployment.
12. Preserve release environment reviewers and owner npm staging. Do not approve a protected deployment on the owner's behalf.
13. Record evidence and open risks in the three scratch ledgers. Keep private research input out of public artifacts.

Website remote delivery stays disabled. Worker release builds only. Worker environments have no GitHub Release assets.
Keep native build hooks separate from root forwarding to prevent recursion.
Root synchronization updates manifests before tagged publication. It does not update existing local installations after a registry change.
Use prepare:dev to refresh checked development dependencies. Never allocate an unrelated package patch merely to align version numbers.

## Capability milestone selection

Commit each implemented slice with its scoped files. Mark it unverified until grouped gate checks pass.
At a gate pass, commit the evidence and push through the authorized branch or reviewed promotion path.
Do not treat an intermediate slice commit as publication approval.

1. Finish the capability gate or related gate group, then run its grouped checks.
2. Identify changed deliverables and their dependency producers. Do not select every product because one gate passed.
3. Check producer publication before consumer delivery. Publish a new network archive if changed SDK peer bounds require one.
4. Plan the selected product's next configured patch through the root chain. Inspect its blockers before execution.
5. Deliver relevant previews within owner authority. Use protected release publication only when the release milestone requires it.
6. Check the resulting artifacts, registry identities and deployment links. Record incomplete approval or failed checks as pending, not verified.
7. For a documentation-only gate or unchanged product, record why no delivery is needed. Do not allocate a ceremonial version.
8. Keep source access, legal clearance, SDK v0.1.0 review and protected release approval separate from deployment success.

Do not implement branch-push automation from this procedure alone. The owner creates the responsibility branches after conditional sign-off.
Current delivery uses product tags. Future triggers need version ownership, collision checks and loop prevention before activation.
