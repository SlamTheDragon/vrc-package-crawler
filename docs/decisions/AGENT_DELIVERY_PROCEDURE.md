# Agent delivery procedure — G14

This procedure implements R57-C57A. It does not authorize R57-C57B milestone publication or waive its owner question.
Human commands and logistics are in [DELIVERY.md](../source/DELIVERY.md).

1. Read the active tracker, canonical decisions and owner changes before selecting a product.
2. Identify its artifact channel separately from its SDK dependency channel.
3. Use preview SDK for crawler and Worker. Use release SDK for desktop and website, even for preview artifacts.
4. Use the single configured network archive for crawler and Worker. Never import sibling producer source.
5. Confirm the required SDK publication exists at its configured version. Do not treat a stage as public npm availability.
6. If network peer bounds change, check and publish the next network archive before dependent consumer delivery.
7. Complete the relevant capability gate or related gate group before tests and checkpoint write-ups.
8. Run root delivery planning. Examine the exact next patch, tag, branch and blockers.
9. Execute the root chain only within owner publication authority. Product forwarding scripts use that same chain.
10. Keep failed delivery tags fixed. Inspect the terminal run before allocating its next configured patch.
11. Check source CI, bytes, receipts, registries and deployment links separately. Green CI alone does not prove those boundaries.
12. Preserve release environment reviewers and owner npm staging. Do not approve a protected deployment on the owner's behalf.
13. Record evidence and open risks in the three scratch ledgers. Keep private research input out of public artifacts.

Website remote delivery stays disabled. Worker release builds only. Worker environments have no GitHub Release assets.
Keep native build hooks separate from root forwarding to prevent recursion.
Root synchronization updates manifests before tagged publication. It does not update existing local installations after a registry change.
Use prepare:dev to refresh checked development dependencies. Never allocate an unrelated package patch merely to align version numbers.
