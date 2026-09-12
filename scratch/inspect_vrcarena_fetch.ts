const resp = await fetch("https://vrcarena.com/index.js");
const js = await resp.text();
const fetches = [];
const regex = /fetch\(([^)]+)\)/g;
let m;
while ((m = regex.exec(js)) !== null) {
  fetches.push(m[1]);
}
console.log("Fetch calls in index.js:", fetches.slice(0, 10));
// Look for firebase or firestore or rest api
const words = ["firestore", "firebase", "api", "query", "assets", "backend"];
for (const w of words) {
  let count = 0;
  let idx = 0;
  while ((idx = js.indexOf(w, idx)) !== -1) { count++; idx += w.length; }
  console.log(`Word '${w}': ${count} occurrences`);
}
