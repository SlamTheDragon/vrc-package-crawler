/** Known explicit robots exclusion checked on 2026-09-27. Dynamic per-origin rules remain G3/G5 work. */
export function isItchSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "itch.io" && parsed.pathname.startsWith("/search");
  } catch {
    return false;
  }
}
