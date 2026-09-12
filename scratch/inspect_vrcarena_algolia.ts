const resp = await fetch("https://vrcarena.com/index.js");
const js = await resp.text();
const chunkMatches = Array.from(new Set(js.match(/\/chunk-[A-Za-z0-9]+\.js/g) || []));
for (const c of chunkMatches) {
  const cResp = await fetch("https://vrcarena.com" + c);
  const cText = await cResp.text();
  if (cText.includes("algolia") || cText.includes("supabase")) {
    console.log("Match in chunk:", c);
    const appId = cText.match(/["'][A-Z0-9]{10}["']/g);
    console.log("AppID candidates:", appId);
    const idx = cText.indexOf("algolia");
    if (idx !== -1) {
      console.log("Snippet:", cText.slice(Math.max(0, idx - 50), Math.min(cText.length, idx + 100)));
    }
    break;
  }
}
