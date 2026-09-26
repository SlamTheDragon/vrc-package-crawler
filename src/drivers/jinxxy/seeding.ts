export const JINXXY_TAGS = [
  "tool", "tools", "script", "scripts", "system", "systems", "udon", "udonsharp",
  "vrcfury", "modular-avatar", "shader", "shaders", "editor", "osc", "camera", "unity",
  "physics", "preset", "animation", "constraint", "gimmick", "flight", "avatar-dynamics"
];

export const JINXXY_CATEGORIES = [
  "https://jinxxy.com/market/scripts-tools",
  "https://jinxxy.com/market/particles-shaders",
  "https://jinxxy.com/market/world-assets"
];

export function buildJinxxySeedUrls(): string[] {
  return [
    ...JINXXY_CATEGORIES,
    ...JINXXY_TAGS.map((tag) => `https://jinxxy.com/market/browse?tags=${encodeURIComponent(tag)}`)
  ];
}

