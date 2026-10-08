
These runs correspond to +1 minor version bump. Each distribution channel was assessed as how it would be exercised in real scenarios. The table below describes the raw, clean configurations of version 0 pipelines.

The failures mean there needs to be an investigation processed as to why such failures problem, to mitigate problems in subsequent workflows

## Attempt 1.1

| name           | channel | status | single-run-results                                                               | resolutions                                                                                                                                                                             |
| -------------- | ------- | ------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| package        | preview | done   | [failed](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37719073408) | npm CDN readback replication latency exceeded 63s loop; npm verified publication of `vrc-packages-api-preview@2026.10.9-pre`. Dispatched rerun of failed jobs resolves green.          |
| crawler        | preview | done   | passed                                                                           |                                                                                                                                                                                         |
| crawler-client | preview | done   | passed                                                                           |                                                                                                                                                                                         |
| worker (web)   | preview | done   | passed                                                                           |                                                                                                                                                                                         |
| network        | preview | done   | passed                                                                           |                                                                                                                                                                                         |

## Attempt 1.2

| name           | channel | status  | single-run-results | resolutions                                                                                                                       | warnings                                                                                                                         |
| -------------- | ------- | ------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| package        | release | done    | passed             | Integrated native desktop notification hook (`notifyNative`: PowerShell balloon/toast + terminal bell) into local delivery chain. | - no discord webhook was attached on local notification upon pre-delivery, a native notification hook workaround might be needed |
| crawler        | release | done    | passed             | Same as above (native notification hook active for local execution).                                                              | - same as above                                                                                                                  |
| crawler-client | release | done    | passed             | Same as above (native notification hook active for local execution).                                                              | - same as above                                                                                                                  |
| worker (web)   | release | skipped |                    | Intended architectural boundary: worker release is build-only / no direct production deployment.                                  |                                                                                                                                  |

