const resp = await fetch("https://vrcarena.com/index.js");
const js = await resp.text();
const chunkMatches = js.match(/\/chunk-[A-Za-z0-9]+\.js/g) || [];
console.log("Chunks count:", chunkMatches.length);
for (const c of chunkMatches.slice(0, 5)) {
  const cResp = await fetch("https://vrcarena.com" + c);
  const cText = await cResp.text();
  const algolia = cText.match(/algolia/gi);
  if (algolia) {
    console.log("Found Algolia in", c);
    const keyMatches = cText.match(/["'][A-Z0-9]{10,}["']/g) || [];
    console.log("Possible keys:", keyMatches);
  }
}
