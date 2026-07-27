const express = require('express');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');

// Load environment variables (like your GEMINI_API_KEY)
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Set up Google Gemini API
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Ensure we have an 'uploads' folder to save files
const os = require('os');
const UPLOADS_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'uploads') : path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Set up 'multer' to save uploaded files to the 'uploads' folder
const upload = multer({ dest: UPLOADS_DIR });

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Parse incoming form data and JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve the test-api page
app.get('/test-api', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-api.html'));
});

// Serve Google Search Console verification file directly
app.get('/googledb2a86f8699b9aee.html', (req, res) => {
  res.send('google-site-verification: googledb2a86f8699b9aee.html');
});

// Cache for products
let cachedProducts = null;
let productsCacheTime = 0;
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

// GET all products from Supabase
app.get('/api/products', async (req, res) => {
  try {
    if (cachedProducts && Date.now() - productsCacheTime < CACHE_TTL) {
      return res.status(200).json(cachedProducts);
    }

    const { data, error } = await supabase.from('products').select('*');
    if (error) {
      console.error('Supabase error fetching products:', error);
      return res.status(500).json({ error: 'Failed to fetch products' });
    }
    
    // Update cache
    cachedProducts = data;
    productsCacheTime = Date.now();
    
    res.status(200).json(data);
  } catch (err) {
    console.error('Error in GET /api/products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST handler for creating a product
app.post('/api/products', async (req, res) => {
  const { name, description, price, features } = req.body;
  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (typeof price !== 'number' || price <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number' });
  }
  // description is optional, default to empty string
  const desc = typeof description === 'string' ? description : '';
  // features should be an array of strings; default to empty array
  const feats = Array.isArray(features) ? features : [];

  const { data, error } = await supabase.from('products').insert({
    name,
    description: desc,
    price,
    features: feats,
  }).select();

  if (error) {
    console.error('Supabase insert error:', error);
    return res.status(500).json({ error: 'Failed to create product' });
  }
  // Return the newly created row
  return res.status(201).json(data[0]);
});

// This is the endpoint that receives the audio file and sends it to Gemini
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  if (!ai) {
    return res.status(500).send('GEMINI_API_KEY not configured.');
  }
  try {
    // Check if a file was uploaded
    if (!req.file) {
      return res.status(400).send('No audio file was uploaded.');
    }

    const filePath = req.file.path;
    const targetLang = req.body.targetLang || 'English';
    const userId = req.body.userId;
    const mode = req.body.mode || 'both';

    if (!userId) {
      fs.unlinkSync(filePath);
      return res.status(401).send('User ID required.');
    }

    let durationSeconds = 60; // fallback
    try {
      const metadata = await mm.parseFile(filePath);
      if (metadata.format.duration) {
        durationSeconds = Math.ceil(metadata.format.duration);
      }
    } catch (e) {
      console.warn('Could not parse audio duration:', e);
    }

    // Check quotas
    let { data: profile } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
    if (!profile) {
      profile = { plan: 'basic' };
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    const { data: usageLogs } = await supabase.from('usage_logs')
      .select('duration_seconds, created_at')
      .eq('user_id', userId)
      .gte('created_at', weekAgo.toISOString());
    
    let dailyUsage = 0;
    let weeklyUsage = 0;
    (usageLogs || []).forEach(log => {
      const logDate = new Date(log.created_at);
      weeklyUsage += log.duration_seconds;
      if (logDate >= today) dailyUsage += log.duration_seconds;
    });

    let dailyLimit = 5 * 60;
    let weeklyLimit = 35 * 60;
    if (profile.plan === 'pro') {
      dailyLimit = 30 * 60;
      weeklyLimit = Infinity;
    } else if (profile.plan === 'enterprise') {
      dailyLimit = 60 * 60;
      weeklyLimit = Infinity;
    }

    if (dailyUsage + durationSeconds > dailyLimit) {
      fs.unlinkSync(filePath);
      return res.status(429).send(`Daily limit exceeded for ${profile.plan} plan. Daily limit is ${dailyLimit/60} mins.`);
    }
    if (weeklyUsage + durationSeconds > weeklyLimit) {
      fs.unlinkSync(filePath);
      return res.status(429).send(`Weekly limit exceeded for ${profile.plan} plan. Weekly limit is ${weeklyLimit/60} mins.`);
    }

    console.log(`Processing audio for user ${userId}. Target language: ${targetLang}, Mode: ${mode}, Duration: ${durationSeconds}s`);

    // Step 1: Upload the audio file to Google Gemini
    const uploadResult = await ai.files.upload({
      file: filePath,
      config: {
        mimeType: req.file.mimetype,
      },
    });

    // Step 2: Ask Gemini to transcribe and translate separately, returning JSON
    let prompt = '';
    if (mode === 'transcribe') {
      prompt = `Listen to this audio carefully. Return a JSON object (and ONLY the JSON, no markdown, no explanation) with exactly one field:
1. "transcription": the verbatim transcript of the audio in the original spoken language

Example format:
{"transcription": "..."}`;
    } else if (mode === 'translate') {
      prompt = `Listen to this audio carefully. Return a JSON object (and ONLY the JSON, no markdown, no explanation) with exactly one field:
1. "translation": the translation of the audio into ${targetLang}

Example format:
{"translation": "..."}`;
    } else {
      prompt = `Listen to this audio carefully. Return a JSON object (and ONLY the JSON, no markdown, no explanation) with exactly two fields:
1. "transcription": the verbatim transcript of the audio in the original spoken language
2. "translation": the translation of the transcript into ${targetLang}

Example format:
{"transcription": "...", "translation": "..."}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [{
          fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType }
        }, { text: prompt }]
      }]
    });

    // Clean up: Delete the local file since Gemini has it now
    fs.unlinkSync(filePath);

    // Log usage
    await supabase.from('usage_logs').insert({
      user_id: userId,
      duration_seconds: durationSeconds,
      mode: mode
    });

    // Parse the JSON response from Gemini
    let rawText = response.text.trim();
    // Strip markdown code fences if present
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    let result = { transcription: '', translation: '' };
    try {
      result = JSON.parse(rawText);
    } catch {
      // Fallback: treat the whole response as transcription
      result = { transcription: rawText, translation: '' };
    }
    res.json(result);

  } catch (error) {
    console.error('Error during transcription:', error);
    res.status(500).send('An error occurred while processing the audio.');
  }
});


// --- AUTH ENDPOINTS (Supabase) ---

// POST handler for user sign up
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, fullName, gender, dob, plan, baseUrl } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  
  const signUpOptions = {};
  if (baseUrl) {
    signUpOptions.emailRedirectTo = baseUrl;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: signUpOptions
  });

  if (error) {
    console.error('Supabase signup error:', error.message);
    // Specific handling for rate limit errors
      if (error.message && error.message.toLowerCase().includes('rate')) {
        // Inform client how long to wait before retrying
        res.set('Retry-After', '60');
        return res.status(429).json({ error: 'Too many signup attempts. Please wait a few minutes and try again.' });
      }
    return res.status(400).json({ error: error.message });
  }
  
  if (data.user) {
    const { error: profileError } = await supabase.from('user_profiles').upsert({
      id: data.user.id,
      full_name: fullName || '',
      gender: gender || '',
      dob: dob || null,
      plan: plan || 'basic'
    });
    if (profileError) console.error('Failed to insert user profile:', profileError);
  }

  res.status(201).json({ message: 'User created successfully', user: data.user, session: data.session });
});

// GET profile and usage
app.get('/api/profile', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });

  let { data: profile, error: profileErr } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
  if (profileErr && profileErr.code !== 'PGRST116') return res.status(500).json({ error: 'Failed to fetch profile' });
  if (!profile) profile = { plan: 'basic', full_name: 'Existing User' };

  const today = new Date();
  today.setHours(0,0,0,0);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const { data: usageLogs, error: usageErr } = await supabase.from('usage_logs')
    .select('duration_seconds, created_at')
    .eq('user_id', userId)
    .gte('created_at', weekAgo.toISOString());
  
  if (usageErr) return res.status(500).json({ error: 'Failed to fetch usage logs' });

  let dailyUsage = 0;
  let weeklyUsage = 0;
  (usageLogs || []).forEach(log => {
    const logDate = new Date(log.created_at);
    weeklyUsage += log.duration_seconds;
    if (logDate >= today) dailyUsage += log.duration_seconds;
  });

  let dailyLimit = 5 * 60;
  let weeklyLimit = 35 * 60;
  if (profile.plan === 'pro') {
    dailyLimit = 30 * 60;
    weeklyLimit = Infinity;
  } else if (profile.plan === 'enterprise') {
    dailyLimit = 60 * 60;
    weeklyLimit = Infinity;
  }

  res.json({
    profile,
    usage: { daily: dailyUsage, weekly: weeklyUsage },
    limits: { daily: dailyLimit, weekly: weeklyLimit }
  });
});

// GET activity
app.get('/api/activity', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });

  const { data, error } = await supabase.from('usage_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch activity' });
  res.json(data);
});

// POST handler for user sign in
app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

    if (error) {
      console.error('Supabase signin error:', error.message);
      // Handle unconfirmed email case
      if (error.message && error.message.toLowerCase().includes('not confirmed')) {
        return res.status(401).json({ error: 'Email not confirmed. Please check your inbox for the confirmation email.', resendConfirmation: true });
      }
      return res.status(401).json({ error: error.message });
    }

  res.status(200).json({ message: 'Signed in successfully', user: data.user, session: data.session });
});

// POST handler to resend email confirmation
app.post('/api/auth/resend-confirmation', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  });
  if (error) {
    console.error('Resend confirmation error:', error.message);
    return res.status(400).json({ error: error.message });
  }
  return res.status(200).json({ message: 'Confirmation email resent' });
});

// GET handler for search
app.get('/api/search', async (req, res) => {
  const query = req.query.q || '';
  // Mock search returning some results
  res.status(200).json({
    results: [
      { id: 1, title: `Result matching "${query}"`, type: 'transcript' },
      { id: 2, title: `Pro Plan`, type: 'plan' }
    ]
  });
});

// --- SAFEPAY INTEGRATION ---
app.post('/api/safepay/checkout', async (req, res) => {
  const { plan, baseUrl: clientBaseUrl } = req.body;
  let amount = 0;
  
  if (plan === 'pro') amount = 1000.00;
  else if (plan === 'enterprise') amount = 2000.00;
  else return res.status(400).json({ error: 'Invalid plan selected for checkout' });

  // Read environment variable or use a placeholder if not provided yet
  const safepayClientKey = process.env.SAFEPAY_CLIENT_KEY || 'sec_sandbox_dummy_key';

  try {
    const https = require('https');
    
    const postData = JSON.stringify({
      client: safepayClientKey,
      amount: amount * 100, // Convert to Paisa
      currency: 'PKR',
      environment: 'sandbox'
    });

    const options = {
      hostname: 'sandbox.api.getsafepay.com',
      port: 443,
      path: '/order/v1/init',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const responseText = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve({ body, statusCode: res.statusCode }));
      });
      req.on('error', (e) => reject(e));
      req.write(postData);
      req.end();
    });

    let data;
    try {
      data = JSON.parse(responseText.body);
    } catch (e) {
      return res.status(500).json({ error: 'Received invalid response from Safepay.' });
    }

    if (responseText.statusCode !== 200 || !data.data || !data.data.token) {
      const errorMsg = data?.status?.errors ? data.status.errors.join(', ') : 'Failed to initialize checkout';
      return res.status(500).json({ error: `Safepay: ${errorMsg}` });
    }

    const tracker = data.data.token;
    const orderId = `voxai_${Date.now()}`;
    const baseUrl = clientBaseUrl || `${req.protocol}://${req.get('host')}`;
    const redirectUrl = encodeURIComponent(`${baseUrl}/success?plan=${plan}`);
    const cancelUrl = encodeURIComponent(`${baseUrl}/cancel`);
    const checkoutUrl = `https://sandbox.api.getsafepay.com/checkout/pay?env=sandbox&beacon=${tracker}&source=custom&order_id=${orderId}&redirect_url=${redirectUrl}&cancel_url=${cancelUrl}`;
    
    return res.status(200).json({ checkoutUrl });
  } catch (error) {
    console.error('Safepay integration error:', error);
    return res.status(500).json({ error: 'An error occurred connecting to Safepay.' });
  }
});
// --- SAFEPAY REDIRECT HANDLERS ---
app.all('/success', (req, res) => {
  const plan = req.query.plan || req.body.plan || 'pro';
  res.redirect(`/?payment_success=true&plan=${plan}`);
});

app.all('/cancel', (req, res) => {
  // Safepay redirects here on cancelled payment (often via POST)
  res.redirect('/?payment_cancel=true');
});
// --------------------------------------------

// Global error handler to return 500 on uncaught errors
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.sendStatus(500);
});

// Endpoint to get total registered users count
app.get('/api/users/count', async (req, res) => {
  try {
    const { count, error } = await supabase.from('users').select('id', { count: 'exact', head: true });
    if (error) throw error;
    res.status(200).json({ count });
  } catch (err) {
    console.error('Error fetching users count:', err);
    res.status(500).json({ error: 'Failed to fetch users count' });
  }
});

// Endpoint to get all users (id and email)
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id,email');
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Start the server only if not running on Vercel
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`🚀 Simple Server is running at http://localhost:${port}`);
  });
}

// Export the Express API so Vercel can use it as a serverless function
module.exports = app;
