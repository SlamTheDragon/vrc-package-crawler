const r = await fetch('https://gumroad.com/discover?query=vrchat', { headers: { 'User-Agent': 'Mozilla/5.0' } });
const text = await r.text();
const m = text.match(/data-page="([^"]+)"/);
if (m) {
  const d = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  console.log('Props keys:', Object.keys(d.props || {}));
  console.log('Component:', d.component);
  console.log('URL in Inertia:', d.url);
  console.log('Version:', d.version);
}
