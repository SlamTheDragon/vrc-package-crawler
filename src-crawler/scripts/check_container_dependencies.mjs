import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Check installed tarballs, not just the dependency declarations. No registry request runs here. */
export function checkContainerDependencies(node, sdk, network, env) {
  const channel = env.VRCP_BUILD_CHANNEL;
  assert(["release", "preview"].includes(channel), "Container build needs an explicit release or preview channel");
  const sdkVersion = env.VRCP_SDK_VERSION;
  const networkVersion = env.VRCP_NETWORK_VERSION;
  assert(typeof sdkVersion === "string" && sdkVersion.length > 0 && typeof networkVersion === "string" && networkVersion.length > 0,
    "Container dependency versions must come from the channel config");
  const sdkName = channel === "preview" ? "vrc-packages-api-preview" : "vrc-packages-api";
  assert.equal(sdk.name, sdkName, "Installed SDK belongs to another channel");
  assert.equal(sdk.version, sdkVersion, "Installed SDK version differs from config");
  assert.equal(network.name, "vrc-packages-network", "Installed network package has another identity");
  assert.equal(network.version, networkVersion, "Installed network version differs from config");
  const fixedSDK = channel === "preview" ? `npm:${sdkName}@${sdkVersion}` : sdkVersion;
  const nodeSDK = channel === "preview" ? `npm:${sdkName}@latest` : sdkVersion;
  assert([nodeSDK, fixedSDK].includes(node.dependencies?.["vrc-packages-api"]), "Node SDK declaration belongs to another channel");
  assert.equal(node.dependencies?.["vrc-packages-network"], networkVersion, "Node network declaration differs from config");
  assert.equal(network.dependencies?.["vrc-packages-api"], fixedSDK, "Network SDK declaration differs from config");
}

if (import.meta.main) {
  const manifest = path => JSON.parse(readFileSync(path, "utf8"));
  checkContainerDependencies(manifest("package.json"), manifest("node_modules/vrc-packages-api/package.json"),
    manifest("node_modules/vrc-packages-network/package.json"), process.env);
}
