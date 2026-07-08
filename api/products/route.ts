// Since this is an AI Transcription app, the "products" represent our transcription service tiers.

export async function GET(request: Request) {
  const transcriptionProducts = [
    {
      id: "prod_1",
      name: "Basic Transcription",
      description: "Standard AI transcription for clear audio. Ideal for simple conversations.",
      price: 0.00,
      features: ["Up to 30 minutes per month", "Standard accuracy", "Email support"]
    },
    {
      id: "prod_2",
      name: "Pro Transcription & Translation",
      description: "Advanced Gemini-powered transcription with multi-language translation and rich HTML formatting.",
      price: 15.00,
      features: ["Unlimited minutes", "High accuracy", "Instant translation", "Priority support"]
    },
    {
      id: "prod_3",
      name: "Enterprise Audio Intelligence",
      description: "Bulk processing, custom vocabulary, and API access for your entire organization.",
      price: 99.00,
      features: ["API Access", "Custom vocabulary", "Dedicated account manager", "SLA guarantee"]
    }
  ];

  return new Response(JSON.stringify(transcriptionProducts), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

export async function POST(request: Request) {
  try {
    const { name, price } = await request.json();
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (typeof price !== 'number' || price <= 0) {
      return new Response(JSON.stringify({ error: 'Price must be a positive number' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const created = { name, price };
    return new Response(JSON.stringify(created), {
      status: 201,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}


export async function GET(request: Request) {
  const transcriptionProducts = [
    {
      id: "prod_1",
      name: "Basic Transcription",
      description: "Standard AI transcription for clear audio. Ideal for simple conversations.",
      price: 0.00,
      features: ["Up to 30 minutes per month", "Standard accuracy", "Email support"]
    },
    {
      id: "prod_2",
      name: "Pro Transcription & Translation",
      description: "Advanced Gemini-powered transcription with multi-language translation and rich HTML formatting.",
      price: 15.00,
      features: ["Unlimited minutes", "High accuracy", "Instant translation", "Priority support"]
    },
    {
      id: "prod_3",
      name: "Enterprise Audio Intelligence",
      description: "Bulk processing, custom vocabulary, and API access for your entire organization.",
      price: 99.00,
      features: ["API Access", "Custom vocabulary", "Dedicated account manager", "SLA guarantee"]
    }
  ];

  return new Response(JSON.stringify(transcriptionProducts), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
