import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import semver from "semver";

/** Check installed tarballs, not just the dependency declarations. No registry request runs here. */
export function checkContainerDependencies(node, sdk, network, env) {
  const channel = env.VRCP_BUILD_CHANNEL;
  assert(["release", "preview"].includes(channel), "Container build needs an explicit release or preview channel");
  const sdkVersion = env.VRCP_SDK_VERSION;
  const networkVersion = env.VRCP_NETWORK_VERSION;
  assert(typeof sdkVersion === "string" && sdkVersion.length > 0 && typeof networkVersion === "string" && networkVersion.length > 0,
    "Container dependency versions must come from the channel config");
  const sdkName = "vrc-packages-api-preview";
  assert.equal(sdk.name, sdkName, "Installed SDK belongs to another channel");
  assert.equal(sdk.version, sdkVersion, "Installed SDK version differs from config");
  assert.equal(network.name, "vrc-packages-network", "Installed network package has another identity");
  assert.equal(network.version, networkVersion, "Installed network version differs from config");
  const fixedSDK = `npm:${sdkName}@${sdkVersion}`;
  const nodeSDK = `npm:${sdkName}@latest`;
  assert([nodeSDK, fixedSDK].includes(node.dependencies?.["vrc-packages-api"]), "Node SDK declaration belongs to another channel");
  const networkURL = `https://github.com/SlamTheDragon/vrc-packages/releases/download/vrcp-network/v${networkVersion}/vrc-packages-network-${networkVersion}.tgz`;
  assert.equal(node.dependencies?.["vrc-packages-network"], networkURL, "Node network declaration differs from config");
  assert(!network.dependencies?.["vrc-packages-api"], "Network SDK must remain a consumer-supplied peer");
  const peer = network.peerDependencies?.["vrc-packages-api"];
  assert(typeof peer === "string" && semver.validRange(peer) && semver.satisfies(sdkVersion, peer),
    "Network SDK peer does not accept the installed channel version");
  assert(!network.peerDependenciesMeta?.["vrc-packages-api"]?.optional, "Network SDK peer must be required");
}

if (import.meta.main) {
  const manifest = path => JSON.parse(readFileSync(path, "utf8"));
  checkContainerDependencies(manifest("package.json"), manifest("node_modules/vrc-packages-api/package.json"),
    manifest("node_modules/vrc-packages-network/package.json"), process.env);
}
