const express = require('express');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables (like your GEMINI_API_KEY)
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Set up Google Gemini API
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Ensure we have an 'uploads' folder to save files
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Set up 'multer' to save uploaded files to the 'uploads' folder
const upload = multer({ dest: 'uploads/' });

// Serve static files from the public directory
app.use(express.static('public'));

// Parse incoming form data and JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve the test-api page
app.get('/test-api', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-api.html'));
});

// GET all products from Supabase
app.get('/api/products', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('*');
    if (error) {
      console.error('Supabase error fetching products:', error);
      return res.status(500).json({ error: 'Failed to fetch products' });
    }
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
    console.log(`Processing audio. Target language: ${targetLang}`);

    // Step 1: Upload the audio file to Google Gemini
    const uploadResult = await ai.files.upload({
      file: filePath,
      mimeType: req.file.mimetype,
    });

    // Step 2: Ask Gemini to listen to it and translate/transcribe it
    const prompt = `Listen to this audio. Transcribe and translate it into ${targetLang}. Return the output as plain text formatted with basic HTML paragraphs <p>. Do not include markdown formatting like \`\`\`html.`;
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
    // Send the text back to the browser
    res.send(response.text);
  } catch (error) {
    console.error('Error during transcription:', error);
    res.status(500).send('An error occurred while processing the audio.');
  }
});


// Global error handler to return 500 on uncaught errors
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.sendStatus(500);
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Simple Server is running at http://localhost:${port}`);
});
