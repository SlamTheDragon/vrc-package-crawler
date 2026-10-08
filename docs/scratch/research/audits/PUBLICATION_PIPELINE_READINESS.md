
These runs correspond to +1 minor version bump. Each distribution channel was assessed as how it would be exercised in real scenarios. The table below describes the raw, clean configurations of version 0 pipelines.

The failures mean there needs to be an investigation processed as to why such failures problem, to mitigate problems in subsequent workflows

## Attempt 1

| name           | channel | status | single-run-results                                                               | resolutions                    |
| -------------- | ------- | ------ | -------------------------------------------------------------------------------- | ------------------------------ |
| package        | preview | done   | [failed](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37719073408) | deferred, else attempt invalid |
| crawler        | preview | done   | passed                                                                           |                                |
| crawler-client | preview | done   | passed                                                                           |                                |
| worker (web)   | preview | done   | passed                                                                           |                                |
| network        | preview | done   | passed                                                                           |                                |

## Attempt 2

| name    | channel | status | single-run-results | resolutions | warnings                                                                                                                         |
| ------- | ------- | ------ | ------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| package | release | done   | passed             |             | - no discord webhook was attached on local notification upon pre-delivery, a native notification hook workaround might be needed |
| crawler | release |        |                    |             |                                                                                                                                  |
