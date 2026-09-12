const resp = await fetch("https://vrcarena.com/new-assets-RNDXBZSB.js");
if (resp.ok) {
  const js = await resp.text();
  console.log("new-assets js length:", js.length);
  console.log("Snippet:", js.slice(0, 500));
  // Look for Algolia app id / search key
  const algoliaHits = js.match(/(?:algolia|appId|apiKey)[^"']*["'][A-Za-z0-9_-]+["']/gi) || [];
  console.log("Algolia hits:", algoliaHits);
} else {
  console.log("Failed to fetch new-assets:", resp.status);
}
