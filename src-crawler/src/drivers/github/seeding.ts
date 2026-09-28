export const GITHUB_SEARCH_QUERIES = [
  "topic:vrchat",
  "topic:vpm",
  "topic:udonsharp",
  "topic:modular-avatar",
  "topic:vrcfury",
  "topic:ndmf",
  "topic:vrc-osc",
  "topic:vrchat-tools",
  "topic:vrchat-tool",
  "topic:vrchat-shader",
  "topic:vpm-repository",
  "vrchat-tools in:name,description",
  "vpm-package in:name,description",
  "vrchat-unitypackage in:name,description",
  "udon in:name,description",
  "vrc-avatar in:name,description",
  "\"vpmDependencies\" filename:package.json",
  "\"com.vrchat.avatars\" filename:package.json",
  "\"com.vrchat.worlds\" filename:package.json",
  "\"ModularAvatar\" in:name,description",
  "\"VRCFury\" in:name,description",
  "\"AvatarOptimizer\" in:name,description",
  "\"CyanTrigger\" in:name,description"
];

export function toGitHubSearchUrl(query: string): string {
  return `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}`;
}

