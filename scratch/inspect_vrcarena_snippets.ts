const resp = await fetch("https://vrcarena.com/index.js");
const js = await resp.text();
let pos = js.indexOf("firebase");
if (pos !== -1) {
  console.log("Firebase context:", js.slice(Math.max(0, pos - 100), Math.min(js.length, pos + 200)));
}
for (const term of ["api", "assets", "https://"]) {
  let idx = 0;
  while ((idx = js.indexOf(term, idx)) !== -1) {
    console.log(`Context for '${term}':`, js.slice(Math.max(0, idx - 50), Math.min(js.length, idx + 100)));
    idx += term.length + 100;
  }
}
