async function main() {
  const r1 = await fetch("https://raw.githubusercontent.com/BocuD/VRBuildHelper/HEAD/README.md");
  console.log("HEAD/README.md:", r1.status);
  const r2 = await fetch("https://raw.githubusercontent.com/BocuD/VRBuildHelper/HEAD/package.json");
  console.log("HEAD/package.json:", r2.status);
  
  const r3 = await fetch("https://github.com/BocuD/VRBuildHelper", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  console.log("github.com HTML:", r3.status);
  const html = await r3.text();
  const descMatch = html.match(/<p[^>]*class="[^"]*f4[^"]*"[^>]*>([^<]+)<\/p>/);
  console.log("Desc match:", descMatch ? descMatch[1] : null);
  
  // What is the description container on GitHub now?
  const aboutMatch = html.match(/<span[^>]*class="[^"]*text-bold[^"]*"[^>]*About<\/span>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  console.log("About match:", aboutMatch ? aboutMatch[1].trim() : null);
  
  // Or og:description meta tag!
  const ogMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:description|description)["']\s+content=["'](.*?)["']/i);
  console.log("OG match:", ogMatch ? ogMatch[1] : null);
}
main();
