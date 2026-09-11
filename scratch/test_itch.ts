async function testItch() {
  const resp = await fetch("https://itch.io/tools/tag-vrchat", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  console.log("Itch /tools/tag-vrchat status:", resp.status);
  const html = await resp.text();
  const linkMatches = html.match(/class="title[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)</g) || [];
  console.log("Found matches:", linkMatches.length);
  for (const m of linkMatches.slice(0, 10)) {
    console.log("  ", m);
  }

  // Also test /game-assets/tag-vrchat
  const resp2 = await fetch("https://itch.io/game-assets/tag-vrchat", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  console.log("\nItch /game-assets/tag-vrchat status:", resp2.status);
  const html2 = await resp2.text();
  const linkMatches2 = html2.match(/class="title[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)</g) || [];
  console.log("Found matches:", linkMatches2.length);
  for (const m of linkMatches2.slice(0, 10)) {
    console.log("  ", m);
  }
}

testItch().catch(console.error);
