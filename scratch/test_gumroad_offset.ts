for (const param of ['offset=36', 'search_offset=36', 'from=36', 'page=2']) {
  const r = await fetch(`https://gumroad.com/discover?query=vrchat&${param}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await r.text();
  const m = text.match(/data-page="([^"]+)"/);
  if (m) {
    const d = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    const sr = d.props?.search_results || {};
    console.log(`Param ${param}:`, 'First product:', sr.products?.[0]?.name, 'search_offset:', d.props?.search_offset);
  }
}

// Also test Inertia request header:
const rInertia = await fetch('https://gumroad.com/discover?query=vrchat&search_offset=36', {
  headers: {
    'User-Agent': 'Mozilla/5.0',
    'X-Inertia': 'true',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'text/html, application/xhtml+xml'
  }
});
console.log('Inertia header response status:', rInertia.status, 'content-type:', rInertia.headers.get('content-type'));
try {
  const json = await rInertia.json();
  console.log('Inertia JSON products:', json.props?.search_results?.products?.[0]?.name);
} catch (e) {
  console.log('Inertia not json');
}
