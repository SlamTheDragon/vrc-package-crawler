import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import semver from 'semver';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
assert.ok(args[0] === '--sdk-tarball' && args.length >= 2 && args.length <= 5 &&
  (args.length === 2 || args.length === 3 && args[2] === '--offline' ||
   args[2] === '--network-tarball' && (args.length === 4 || args.length === 5 && args[4] === '--offline')),
  'Use --sdk-tarball <verified-sdk.tgz> [--network-tarball <packed-network.tgz>] [--offline]');
const sdkTarball = realpathSync(resolve(args[1]));
assert.ok(sdkTarball.endsWith('.tgz') && lstatSync(sdkTarball).isFile(), 'SDK input must be a packed artifact');
const sdkReceipt = JSON.parse(readFileSync(`${sdkTarball}.json`, 'utf8'));
assert.ok(['vrc-packages-api', 'vrc-packages-api-preview'].includes(sdkReceipt.name) && semver.valid(sdkReceipt.version) &&
  sdkReceipt.sha256 === createHash('sha256').update(readFileSync(sdkTarball)).digest('hex'), 'SDK input differs from its checked receipt');
const networkTarball = args[2] === '--network-tarball' ? realpathSync(resolve(args[3])) : null;
if (networkTarball) assert.ok(networkTarball.endsWith('.tgz') && lstatSync(networkTarball).isFile(), 'Network input must be a packed artifact');
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
const testOutput = resolve(packageRoot, '.artifacts/tests');
mkdirSync(testOutput, { recursive: true });
const consumer = mkdtempSync(join(realpathSync(testOutput), 'vrcp-network-packed-'));
assert.equal(dirname(consumer), realpathSync(testOutput), 'Network fixture escaped its project test output');
const npmCli = [process.env.npm_execpath,
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')
].find(path => path?.endsWith('npm-cli.js') && existsSync(path));
assert.ok(npmCli, 'Run through npm run test:distribution to select the npm CLI');
const run = (cli, command, cwd = consumer) => execFileSync(process.execPath, [cli, ...command], {
  cwd, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024
});
console.log(JSON.stringify({ consumer, status: 'started' }));
const [packed] = JSON.parse(run(npmCli, ['pack', ...(networkTarball ? [networkTarball, '--ignore-scripts'] : []), '--json', '--pack-destination', consumer], packageRoot));
if (networkTarball) assert.equal(createHash('sha256').update(readFileSync(join(consumer, packed.filename))).digest('hex'),
  createHash('sha256').update(readFileSync(networkTarball)).digest('hex'), 'Network archive bytes changed between SDK checks');
assert.equal(packed.name, manifest.name);
assert.equal(packed.version, manifest.version);
const expectedFiles = ['package.json', 'README.md', 'LICENSE.md',
  ...Object.values(manifest.exports).flatMap(entry => [entry.types.slice(2), entry.import.slice(2)])].sort();
assert.deepEqual(packed.files.map(file => file.path).sort(), expectedFiles,
  'Artifact must contain only declared JS/declaration exports and package notices');
run(npmCli, ['install', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund',
  ...(args.includes('--offline') ? ['--offline'] : []), `vrc-packages-api@file:${sdkTarball}`, join(consumer, packed.filename)]);
assert.equal(manifest.dependencies?.['vrc-packages-api'], undefined, 'Network runtime must not select its own SDK channel');
assert.ok(semver.satisfies(sdkReceipt.version, manifest.peerDependencies?.['vrc-packages-api'] ?? ''),
  'SDK falls outside the network peer contract');
function checkInstalled(directory) {
  for (const [name, identity, version] of [[manifest.name, manifest.name, manifest.version],
    ['vrc-packages-api', sdkReceipt.name, sdkReceipt.version]]) {
    const installed = join(directory, 'node_modules', name);
    assert.equal(lstatSync(installed).isSymbolicLink(), false, 'Artifact must not be a workspace link');
    assert.ok(realpathSync(installed).startsWith(realpathSync(directory) + sep), 'Artifact escaped isolated consumer');
    const installedManifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
    assert.equal(installedManifest.name, identity);
    assert.equal(installedManifest.version, version);
  }
  const network = join(directory, 'node_modules', manifest.name);
  const installedManifest = JSON.parse(readFileSync(join(network, 'package.json'), 'utf8'));
  assert.equal(installedManifest.license, 'AGPL-3.0-or-later');
  assert.equal(installedManifest.dependencies?.['vrc-packages-api'], undefined);
  assert.equal(installedManifest.peerDependencies?.['vrc-packages-api'], manifest.peerDependencies['vrc-packages-api']);
}
checkInstalled(consumer);
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
const runtime = new Miniflare(convertV4MiniflareOptions({ rootPath: realpathSync(consumer), workers: [{
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
// A Bun runtime over npm's installation does not test Bun's dependency resolver.
const bunConsumer = mkdtempSync(join(realpathSync(testOutput), 'vrcp-network-bun-packed-'));
assert.equal(dirname(bunConsumer), realpathSync(testOutput), 'Bun fixture escaped network project test output');
writeFileSync(join(bunConsumer, 'package.json'), JSON.stringify({ name: 'vrcp-network-bun-consumer',
  private: true, type: 'module', dependencies: {
    'vrc-packages-api': `file:${sdkTarball.replaceAll('\\', '/')}`,
    [manifest.name]: `file:${join(consumer, packed.filename).replaceAll('\\', '/')}`
  } }));
execFileSync(process.env.BUN_BINARY || 'bun', ['install', '--ignore-scripts', '--no-save', '--linker', 'hoisted',
  ...(args.includes('--offline') ? ['--offline'] : [])], {
  cwd: bunConsumer, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024
});
checkInstalled(bunConsumer);
cpSync(new URL('./fixtures/', import.meta.url), bunConsumer, { recursive: true });
for (const executable of [process.execPath, process.env.BUN_BINARY || 'bun']) {
  execFileSync(executable, [join(bunConsumer, 'runtime.mjs')], { cwd: bunConsumer, encoding: 'utf8', timeout: 30_000 });
}
run(join(packageRoot, 'node_modules/typescript/bin/tsc'), [
  '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2024', '--lib', 'ES2024,DOM', 'consumer.mts'
], bunConsumer);
console.log(JSON.stringify({ check: 'packed_network_distribution', node: true, bun: true, types: true,
  npmInstall: true, bunInstall: true, sdk: sdkReceipt.name, sdkVersion: sdkReceipt.version,
  workerBuild: true, nativeWorker: true, externalFetches, files: packed.entryCount,
  integrity: packed.integrity, consumer }));
