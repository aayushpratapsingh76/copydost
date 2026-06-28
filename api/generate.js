export default async function handler(req, res) {

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract the 4 inputs from the request body
  const { businessType, city, targetCustomer, usp } = req.body;

  // Validate all 4 fields exist
  if (!businessType || !city || !targetCustomer || !usp) {
    return res.status(400).json({ error: 'All four fields are required.' });
  }

  // Structured prompt targeting clean JSON output
  const prompt = `You are a professional marketing copywriter for Indian small businesses.

Generate marketing copy for this business:
- Business Type: ${businessType}
- City: ${city}
- Target Customer: ${targetCustomer}
- Unique Selling Point: ${usp}

Return ONLY a valid JSON object matching this exact structure:
{
  "whatsapp": "WhatsApp broadcast message — 60 to 80 words, conversational Hindi-friendly tone, 2 to 3 relevant emojis, ends with a clear call to action",
  "googleBusiness": "Google My Business description — 120 to 150 words, mentions the city naturally, professional tone, SEO-friendly keywords",
  "instagram": [
    "First Instagram caption — 30 to 40 words, engaging hook, ends with 3 relevant hashtags including the city hashtag",
    "Second Instagram caption — 30 to 40 words, different angle from first, ends with 3 relevant hashtags",
    "Third Instagram caption — 30 to 40 words, promotional or offer angle, ends with 3 relevant hashtags"
  ],
  "offer": "Weekend offer message — 35 to 45 words, creates urgency, mentions a specific discount or benefit",
  "tagline": "A memorable 8 to 10 word tagline that captures what makes this business unique"
}`;

  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error('Missing GEMINI_API_KEY environment variable.');
      return res.status(500).json({ error: 'Server configuration error: Missing API Key.' });
    }

    // Call Gemini 3.5 Flash via the stable v1beta endpoint
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2500,
            responseMimeType: "application/json" 
          }
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('Gemini API Error details:', data.error);
      return res.status(500).json({ error: `API Error: ${data.error.message || 'Unknown error'}` });
    }

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('Unexpected Gemini API response structure:', JSON.stringify(data));
      return res.status(500).json({ error: 'Failed to receive data from Gemini. Please check API status.' });
    }

    // Extract text payload
    let rawText = data.candidates[0].content.parts[0].text.trim();

    // ULTRA-ROBUST CLEANUP: Extract only the text between the first '{' and the last '}'
    // This strips out markdown backticks or accidental trailing characters text cleanly.
    const firstBracket = rawText.indexOf('{');
    const lastBracket = rawText.lastIndexOf('}');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      rawText = rawText.substring(firstBracket, lastBracket + 1);
    }

    // Parse the completely isolated JSON string
    const parsed = JSON.parse(rawText);

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Generation parsing error:', error);
    return res.status(500).json({
      error: 'Generation failed to process clean structured text. Please try again.'
    });
  }
}
