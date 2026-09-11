async function testItchProduct(url: string) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  console.log("Status for", url, ":", resp.status);
  const html = await resp.text();

  // Extract title
  const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
  const title = ogTitle ? ogTitle[1].replace(/by\s+.*$/i, "").trim() : "";

  // Extract description
  const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
  const desc = ogDesc ? ogDesc[1].trim() : "";

  // Extract author
  const authorMatch = html.match(/<a\s+href="https:\/\/([^.]+)\.itch\.io"[^>]*>([^<]+)<\/a>/i);
  const author = authorMatch ? authorMatch[2].trim() : url.match(/https:\/\/([^.]+)\.itch\.io/)?.[1] || "Itch Creator";

  // Extract tags
  const tags: string[] = ["itch", "vrchat"];
  const tagMatches = html.match(/href="https:\/\/itch\.io\/[^\/]+\/tag-[^"]+"/g) || [];
  for (const tm of tagMatches) {
    const t = tm.split("/tag-")[1]?.replace(/"$/, "");
    if (t && !tags.includes(t)) tags.push(t);
  }

  // Extract external links (GitHub, Booth, Gumroad, Discord)
  const extLinks: string[] = [];
  const hrefs = html.match(/href="(https?:\/\/[^"]+)"/g) || [];
  for (const h of hrefs) {
    const raw = h.replace('href="', '').replace('"', '');
    if (raw.includes("github.com/") || raw.includes("booth.pm/") || raw.includes("gumroad.com/")) {
      if (!extLinks.includes(raw)) extLinks.push(raw);
    }
  }

  console.log("Parsed Entity:");
  console.log(" - Title:", title);
  console.log(" - Author:", author);
  console.log(" - Desc:", desc.slice(0, 100));
  console.log(" - Tags:", tags);
  console.log(" - ExtLinks:", extLinks);
}

testItchProduct("https://fooma.itch.io/twitch-to-vrchat-interaction-system").catch(console.error);
testItchProduct("https://andy-hellgrim.itch.io/arkit-toolset").catch(console.error);
