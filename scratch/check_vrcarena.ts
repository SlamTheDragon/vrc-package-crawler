async function main() {
  const resp = await fetch("https://vrcarena.com/index.js");
  const js = await resp.text();
  const chunkMatches = Array.from(js.matchAll(/["']([a-zA-Z0-9_-]+\.(?:chunk\.)?js)["']/g)).map(m => m[1]);
  console.log("Chunks:", Array.from(new Set(chunkMatches)));
}
main();
