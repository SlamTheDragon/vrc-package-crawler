import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const args = process.argv.slice(2);
assert.ok((args.length === 2 || args.length === 3) && args[0] === '--sdk-tarball' &&
  (args.length === 2 || args[2] === '--offline'),
  'Usage: npm run test:distribution -- --sdk-tarball <verified-sdk.tgz> [--offline]');
const sdkTarball = realpathSync(resolve(args[1]));
assert.ok(sdkTarball.endsWith('.tgz') && lstatSync(sdkTarball).isFile(), 'SDK input must be a packed artifact');
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
const consumer = mkdtempSync(join(tmpdir(), 'vrcp-network-packed-'));
const npmCli = [process.env.npm_execpath,
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')
].find(path => path?.endsWith('npm-cli.js') && existsSync(path));
assert.ok(npmCli, 'Run through npm run test:distribution to select the npm CLI');
const run = (cli, command, cwd = consumer) => execFileSync(process.execPath, [cli, ...command], {
  cwd, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024
});
console.log(JSON.stringify({ consumer, status: 'started' }));
const [packed] = JSON.parse(run(npmCli, ['pack', '--json', '--pack-destination', consumer], packageRoot));
assert.equal(packed.name, manifest.name);
assert.equal(packed.version, manifest.version);
const expectedFiles = ['package.json', 'README.md', 'LICENSE.md',
  ...Object.values(manifest.exports).flatMap(entry => [entry.types.slice(2), entry.import.slice(2)])].sort();
assert.deepEqual(packed.files.map(file => file.path).sort(), expectedFiles,
  'Artifact must contain only declared JS/declaration exports and package notices');
run(npmCli, ['install', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund',
  ...(args[2] === '--offline' ? ['--offline'] : []), `vrc-packages-api@file:${sdkTarball}`, join(consumer, packed.filename)]);
const sdkSpec = manifest.dependencies['vrc-packages-api'];
const previewPrefix = 'npm:vrc-package-api-preview@';
const preview = sdkSpec.startsWith(previewPrefix);
for (const [name, identity, version] of [[manifest.name, manifest.name, manifest.version],
  ['vrc-packages-api', preview ? 'vrc-package-api-preview' : 'vrc-packages-api', preview ? sdkSpec.slice(previewPrefix.length) : sdkSpec]]) {
  const installed = join(consumer, 'node_modules', name);
  assert.equal(lstatSync(installed).isSymbolicLink(), false, 'Artifact must not be a workspace link');
  assert.ok(realpathSync(installed).startsWith(realpathSync(consumer) + sep), 'Artifact escaped isolated consumer');
  const installedManifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(installedManifest.name, identity);
  assert.equal(installedManifest.version, version);
}
assert.equal(JSON.parse(readFileSync(join(consumer, 'node_modules', manifest.name, 'package.json'), 'utf8')).license,
  'AGPL-3.0-or-later');
cpSync(new URL('./fixtures/', import.meta.url), consumer, { recursive: true });
execFileSync(process.execPath, ['--no-experimental-strip-types', join(consumer, 'runtime.mjs')], {
  cwd: consumer, encoding: 'utf8', timeout: 30_000
});
execFileSync(process.env.BUN_BINARY || 'bun', [join(consumer, 'runtime.mjs')], {
  cwd: consumer, encoding: 'utf8', timeout: 30_000
});
run(join(packageRoot, 'node_modules/typescript/bin/tsc'), [
  '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2024', '--lib', 'ES2024,DOM', 'consumer.mts'
]);
run(join(packageRoot, 'node_modules/wrangler/bin/wrangler.js'), [
  'deploy', '--dry-run', '--autoconfig=false', '--config', join(consumer, 'wrangler.jsonc'),
  '--outdir', join(consumer, 'bundle')
]);
let externalFetches = 0;
const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
  name: 'vrcp-network-artifact-check', modules: true, scriptPath: join(consumer, 'bundle/worker.js'),
  compatibilityDate: '2026-10-04', outboundService: () => {
    externalFetches++;
    return new Response('External requests forbidden', { status: 403 });
  }
}] }));
try {
  const response = await runtime.dispatchFetch('https://artifact.invalid');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    nodeContracts: true, strictIdentity: true, policy: true, robots: true, semver: true, hygiene: true
  });
  assert.equal(externalFetches, 0);
} finally { await runtime.dispose(); }
console.log(JSON.stringify({ check: 'packed_network_distribution', node: true, bun: true, types: true,
  workerBuild: true, nativeWorker: true, externalFetches, files: packed.entryCount,
  integrity: packed.integrity, consumer }));
