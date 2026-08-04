const fetch = require('node-fetch');

async function testSignup() {
  const email = `test_email_${Date.now()}@example.com`;
  console.log(`Testing signup with email: ${email}`);
  
  try {
    const response = await fetch('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        password: 'password123',
        fullName: 'Local Test User',
        plan: 'pro',
        baseUrl: 'http://localhost:3000'
      })
    });
    
    const status = response.status;
    const text = await response.text();
    console.log(`Status: ${status}`);
    console.log(`Response: ${text}`);
    
    if (status === 201) {
      const data = JSON.parse(text);
      console.log('Signup succeeded. Now testing checkout...');
      
      const checkoutResponse = await fetch('http://localhost:3000/api/safepay/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plan: 'pro',
          baseUrl: 'http://localhost:3000',
          userId: data.user.id
        })
      });
      
      const checkoutStatus = checkoutResponse.status;
      const checkoutText = await checkoutResponse.text();
      console.log(`Checkout Status: ${checkoutStatus}`);
      console.log(`Checkout Response: ${checkoutText}`);
    }
  } catch (error) {
    console.error('Test error:', error);
  }
}

testSignup();
