/** Supported public GitHub REST endpoint, excluding search, HTML, content and archive URLs. */
export function githubApiRepositoryIdentity(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "api.github.com" || url.port || url.search || url.hash ||
      url.username || url.password) return null;
  const match = /^\/repos\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})$/.exec(url.pathname);
  if (!match || match[2] === "." || match[2] === "..") return null;
  return `${match[1]}/${match[2]}`;
}
