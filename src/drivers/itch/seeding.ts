export function buildItchSeedUrls(): string[] {
  return [
    ...Array.from({ length: 15 }, (_, index) => `https://itch.io/tools/tag-vrchat?page=${index + 1}`),
    ...Array.from({ length: 10 }, (_, index) => `https://itch.io/tools/tag-udon?page=${index + 1}`),
    ...Array.from({ length: 10 }, (_, index) => `https://itch.io/tools/tag-vrchat-avatar?page=${index + 1}`),
    "https://itch.io/search?q=vrchat+tool",
    "https://itch.io/search?q=vrchat+shader",
    "https://itch.io/search?q=vrchat+osc",
    "https://itch.io/search?q=vrchat+udon",
    "https://itch.io/search?q=vrcfury",
    "https://itch.io/search?q=modular+avatar"
  ];
}

