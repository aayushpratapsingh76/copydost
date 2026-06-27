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

  // The prompt sent to Gemini — structured for clean JSON output
  const prompt = `You are a professional marketing copywriter for Indian small businesses.

Generate marketing copy for this business:
- Business Type: ${businessType}
- City: ${city}
- Target Customer: ${targetCustomer}
- Unique Selling Point: ${usp}

Return ONLY a valid JSON object. No explanation. No markdown. No code blocks.
Use this exact structure:

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
    // Call Gemini Flash API — key is read from environment variable, never exposed
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 1200,
          }
        })
      }
    );

    const data = await response.json();

    // Extract the text from Gemini's response structure
    const rawText = data.candidates[0].content.parts[0].text;

    // Strip markdown code fences if Gemini adds them despite instructions
    const cleanText = rawText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Parse into JSON object
    const parsed = JSON.parse(cleanText);

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Generation error:', error);
    return res.status(500).json({
      error: 'Generation failed. Please try again in a few seconds.'
    });
  }
}
