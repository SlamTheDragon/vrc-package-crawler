export function buildItchSeedUrls(): string[] {
  return [
    ...Array.from({ length: 15 }, (_, index) => `https://itch.io/tools/tag-vrchat?page=${index + 1}`),
    ...Array.from({ length: 10 }, (_, index) => `https://itch.io/tools/tag-udon?page=${index + 1}`),
    ...Array.from({ length: 10 }, (_, index) => `https://itch.io/tools/tag-vrchat-avatar?page=${index + 1}`)
  ];
}

export { isItchSearchUrl } from "../../shared/source_path_policy.ts";
