import { expect, test } from "bun:test";
import { checkContainerDependencies } from "../scripts/check_container_dependencies.mjs";

for (const channel of ["release", "preview"]) {
  const sdkVersion = channel === "preview" ? "2026.10.2-pre" : "0.0.2";
  const networkVersion = channel === "preview" ? "2026.10.4-pre" : "0.0.4";
  const name = channel === "preview" ? "vrc-packages-api-preview" : "vrc-packages-api";
  const spec = channel === "preview" ? `npm:${name}@${sdkVersion}` : sdkVersion;
  const env = { VRCP_BUILD_CHANNEL: channel, VRCP_SDK_VERSION: sdkVersion, VRCP_NETWORK_VERSION: networkVersion };
  const node = { dependencies: { "vrc-packages-api": channel === "preview" ? `npm:${name}@latest` : spec,
    "vrc-packages-network": networkVersion } };
  const sdk = { name, version: sdkVersion };
  const network = { name: "vrc-packages-network", version: networkVersion, dependencies: { "vrc-packages-api": spec } };

  test(`${channel} container checks installed identities and independently configured dependency versions`, () => {
    expect(() => checkContainerDependencies(node, sdk, network, env)).not.toThrow();
    expect(() => checkContainerDependencies(node, { ...sdk, name: "wrong-channel" }, network, env)).toThrow("another channel");
    expect(() => checkContainerDependencies(node, { ...sdk, version: "0.0.99" }, network, env)).toThrow("differs from config");
    expect(() => checkContainerDependencies(node, sdk, { ...network, version: "0.0.99" }, env)).toThrow("differs from config");
    expect(() => checkContainerDependencies(node, sdk, { ...network, dependencies: { "vrc-packages-api": "latest" } }, env)).toThrow("Network SDK");
    expect(() => checkContainerDependencies({ dependencies: { ...node.dependencies, "vrc-packages-api": "wrong-alias" } }, sdk, network, env)).toThrow("Node SDK");
  });

  test(`${channel} container rejects missing channel or expected versions before compilation`, () => {
    expect(() => checkContainerDependencies(node, sdk, network, {})).toThrow("explicit");
    expect(() => checkContainerDependencies(node, sdk, network, { ...env, VRCP_SDK_VERSION: "" })).toThrow("versions");
    expect(() => checkContainerDependencies(node, sdk, network, { ...env, VRCP_NETWORK_VERSION: undefined })).toThrow("versions");
  });
}
