async function findSupabase() {
  const resp = await fetch("https://vrcarena.com/index.js");
  const js = await resp.text();
  const hits = [];
  let pos = 0;
  while ((pos = js.indexOf("supabase", pos)) !== -1) {
    hits.push(js.slice(Math.max(0, pos - 50), Math.min(js.length, pos + 100)));
    pos += 8;
    if (hits.length > 5) break;
  }
  console.log("Supabase occurrences:", hits);
}

findSupabase().catch(console.error);
