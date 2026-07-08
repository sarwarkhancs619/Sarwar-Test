// feat: add GET and POST handlers for /api/products, plus a test console
// This script can be run with `node test-console.js` to verify the API endpoints.
// Requires Node 18+ (fetch is built‑in). Adjust the port if your server runs on a different one.

(async () => {
  const base = 'http://localhost:3001/api/products';
  console.log('🔎 GET /api/products');
  try {
    const getRes = await fetch(base);
    console.log('Status:', getRes.status);
    const getData = await getRes.json();
    console.log('Response:', JSON.stringify(getData, null, 2));
  } catch (err) {
    console.error('GET request failed:', err);
  }

  console.log('\n🚀 POST /api/products');
  try {
    const postRes = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My Product', price: 9.99 })
    });
    console.log('Status:', postRes.status);
    const postData = await postRes.json();
    console.log('Response:', JSON.stringify(postData, null, 2));
  } catch (err) {
    console.error('POST request failed:', err);
  }
})();
