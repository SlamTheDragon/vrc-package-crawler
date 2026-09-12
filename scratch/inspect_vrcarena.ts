const resp = await fetch("https://vrcarena.com/assets?category=tool", {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
});
const text = await resp.text();
console.log(text.slice(0, 1000));
console.log("Script tags:", text.match(/<script[^>]*>.*?<\/script>/gs) || text.match(/<script[^>]*src="[^"]+"/g));
