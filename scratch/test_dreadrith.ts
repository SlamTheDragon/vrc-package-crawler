async function inspectDataPage() {
  const resp = await fetch("https://dreadrith.gumroad.com", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  const html = await resp.text();
  const match = html.match(/data-page="([^"]+)"/);
  if (match) {
    const unescaped = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const data = JSON.parse(unescaped);
    console.log("props keys:", Object.keys(data.props || {}));
    console.log("creator_profile:", data.props?.creator_profile);
    console.log("sections:", JSON.stringify(data.props?.sections, null, 2));
  }
  // Also check if products are in the raw HTML as href="/l/..."
  const links = html.match(/href="([^"]*\/l\/[^"]*)"/g) || [];
  console.log("Raw /l/ links in HTML:", links);
}

inspectDataPage().catch(console.error);
