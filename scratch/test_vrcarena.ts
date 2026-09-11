async function testVrcArena() {
  const resp = await fetch("https://vrcarena.com/assets?category=tool", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  console.log("vrcarena /assets?category=tool status:", resp.status);
  const html = await resp.text();
  console.log("HTML length:", html.length);
  // Check links
  const links = html.match(/href="(\/assets\/[^"]+)"/g) || [];
  console.log("Asset links found:", links.slice(0, 15));

  // Check categories / tags
  const catMatches = html.match(/category=([a-zA-Z0-9_-]+)/g) || [];
  console.log("Categories mentioned:", Array.from(new Set(catMatches)));

  // Check external links (Gumroad, Booth, GitHub)
  const extLinks = html.match(/https?:\/\/(?:[a-zA-Z0-9_-]+\.)?(?:gumroad\.com|booth\.pm|github\.com)\/[^"'\s<>]+/g) || [];
  console.log("Ext links found on page:", extLinks.slice(0, 10));
}

testVrcArena().catch(console.error);
