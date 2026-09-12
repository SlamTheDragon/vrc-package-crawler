const r1 = await fetch('https://gumroad.com/discover?query=vrchat&page=1', { headers: { 'User-Agent': 'Mozilla/5.0' } });
const t1 = await r1.text();
const m1 = t1.match(/data-page="([^"]+)"/);
if (m1) {
  const d1 = JSON.parse(m1[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  const sr1 = d1.props?.search_results || {};
  console.log('Page 1 count:', sr1.products?.length, 'First product:', sr1.products?.[0]?.name, 'pagination info:', Object.keys(sr1));
  console.log('Pagination details:', { total: sr1.total, next_page: sr1.next_page, page: sr1.page, cursor: sr1.cursor });
}
const r2 = await fetch('https://gumroad.com/discover?query=vrchat&page=2', { headers: { 'User-Agent': 'Mozilla/5.0' } });
const t2 = await r2.text();
const m2 = t2.match(/data-page="([^"]+)"/);
if (m2) {
  const d2 = JSON.parse(m2[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  const sr2 = d2.props?.search_results || {};
  console.log('Page 2 count:', sr2.products?.length, 'First product:', sr2.products?.[0]?.name);
  console.log('Pagination details 2:', { total: sr2.total, next_page: sr2.next_page, page: sr2.page, cursor: sr2.cursor });
}
