import assert from 'node:assert/strict';
import { checkArtifact } from './check.mjs';

assert.deepEqual(await checkArtifact(), {
  nodeContracts: true, strictIdentity: true, policy: true, robots: true, semver: true, hygiene: true
});
