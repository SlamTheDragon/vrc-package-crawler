import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), 'vrc-sdk-packed-'));
const npmCli = [process.env.npm_execpath,
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')
].find(path => path?.endsWith('npm-cli.js') && existsSync(path));
assert.ok(npmCli, 'Run with npm run test:distribution so the npm CLI path is available');
const run = (cli, args, cwd = consumer) => execFileSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024
});
console.log(JSON.stringify({ consumer, status: 'started' }));
const [packed] = JSON.parse(run(npmCli, ['pack', '--json', '--pack-destination', consumer], packageRoot));
assert.ok(packed.files.every(file => ['package.json', 'README.md', 'LICENSE'].includes(file.path) ||
  /^dist\/.*\.(?:js|d\.ts)$/.test(file.path)), 'Tarball contains non-distribution files');
run(npmCli, ['install', '--ignore-scripts', '--no-audit', '--no-fund',
  ...(process.argv.includes('--offline') ? ['--offline'] : []), join(consumer, packed.filename)]);
cpSync(new URL('./fixtures/distribution/', import.meta.url), consumer, { recursive: true });
run(join(consumer, 'runtime.mjs'), []);
execFileSync(process.execPath, ['--no-experimental-strip-types', join(consumer, 'runtime.mjs')], {
  cwd: consumer, stdio: 'pipe', timeout: 30_000
});
run(join(packageRoot, 'node_modules/typescript/bin/tsc'), [
  '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2022', '--lib', 'ES2022,DOM', 'consumer.mts'
]);
run(join(packageRoot, 'node_modules/wrangler/bin/wrangler.js'), [
  'deploy', '--dry-run', '--autoconfig=false', '--config', join(consumer, 'wrangler.jsonc'), '--outdir', join(consumer, 'bundle')
]);
let externalFetches = 0;
const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
  name: 'packed-sdk', modules: true, scriptPath: join(consumer, 'bundle/worker.js'),
  compatibilityDate: '2026-10-02', outboundService: () => {
    externalFetches++;
    return new Response('External requests forbidden', { status: 403 });
  }
}] }));
try {
  const response = await runtime.dispatchFetch('https://packed-sdk.test');
  assert.equal(response.status, 200, response.status === 200 ? undefined : await response.text());
  assert.deepEqual(await response.json(), { platform: 'vpm', umbrella: 'tools', tokenValid: true,
    clientReady: true, publicIndex: true, reason: 'Packed Worker fixture', redirectRejected: true });
  assert.equal(externalFetches, 0);
} finally { await runtime.dispose(); }
console.log(JSON.stringify({ check: 'packed_sdk_distribution', node: true, types: true,
  workerBuild: true, nativeWorker: true, externalFetches, files: packed.entryCount, consumer }));
