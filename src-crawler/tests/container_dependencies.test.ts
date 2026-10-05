import { expect, test } from "bun:test";
import { checkContainerDependencies } from "../scripts/check_container_dependencies.mjs";

for (const channel of ["release", "preview"]) {
  const sdkVersion = "2026.10.2-pre";
  const networkVersion = "2026.10.2";
  const name = "vrc-packages-api-preview";
  const spec = `npm:${name}@${sdkVersion}`;
  const env = { VRCP_BUILD_CHANNEL: channel, VRCP_SDK_VERSION: sdkVersion, VRCP_NETWORK_VERSION: networkVersion };
  const node = { dependencies: { "vrc-packages-api": `npm:${name}@latest`,
    "vrc-packages-network": `https://github.com/SlamTheDragon/vrc-packages/releases/download/vrcp-network/v${networkVersion}/vrc-packages-network-${networkVersion}.tgz` } };
  const sdk = { name, version: sdkVersion };
  const network = { name: "vrc-packages-network", version: networkVersion, peerDependencies: { "vrc-packages-api": "0.0.2 || 2026.10.2-pre" } };

  test(`${channel} container checks installed identities and independently configured dependency versions`, () => {
    expect(() => checkContainerDependencies(node, sdk, network, env)).not.toThrow();
    expect(() => checkContainerDependencies({ dependencies: { ...node.dependencies, "vrc-packages-api": spec } }, sdk, network, env)).not.toThrow();
    expect(() => checkContainerDependencies(node, { ...sdk, name: "wrong-channel" }, network, env)).toThrow("another channel");
    expect(() => checkContainerDependencies(node, { ...sdk, version: "0.0.99" }, network, env)).toThrow("differs from config");
    expect(() => checkContainerDependencies(node, sdk, { ...network, version: "0.0.99" }, env)).toThrow("differs from config");
    expect(() => checkContainerDependencies(node, sdk, { ...network, dependencies: { "vrc-packages-api": "latest" } }, env)).toThrow("Network SDK");
    for (const peer of [undefined, "invalid", "^0.0.2", "0.0.99"]) {
      expect(() => checkContainerDependencies(node, sdk, { ...network, peerDependencies: { "vrc-packages-api": peer } }, env)).toThrow("Network SDK peer");
    }
    expect(() => checkContainerDependencies(node, sdk, { ...network, peerDependenciesMeta: { "vrc-packages-api": { optional: true } } }, env)).toThrow("required");
    for (const declared of [networkVersion, "file:../src-worker", node.dependencies["vrc-packages-network"].replace("github.com", "attacker.invalid")]) {
      expect(() => checkContainerDependencies({ dependencies: { ...node.dependencies, "vrc-packages-network": declared } }, sdk, network, env)).toThrow("Node network");
    }
    expect(() => checkContainerDependencies({ dependencies: { ...node.dependencies, "vrc-packages-api": "wrong-alias" } }, sdk, network, env)).toThrow("Node SDK");
  });

  test(`${channel} container rejects missing channel or expected versions before compilation`, () => {
    expect(() => checkContainerDependencies(node, sdk, network, {})).toThrow("explicit");
    expect(() => checkContainerDependencies(node, sdk, network, { ...env, VRCP_SDK_VERSION: "" })).toThrow("versions");
    expect(() => checkContainerDependencies(node, sdk, network, { ...env, VRCP_NETWORK_VERSION: undefined })).toThrow("versions");
  });
}
