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

  // Optimized Prompt: Enforces plain English, high-sales-conversion framing, and removes Hindi instructions
  const prompt = `You are an elite growth-marketing copywriter specializing in high-sales conversions for Indian small businesses.

Generate marketing copy for this business:
- Business Type: ${businessType}
- City: ${city}
- Target Customer: ${targetCustomer}
- Unique Selling Point: ${usp}

STRICT LANGUAGE RULE: Write completely in English. Use simple, plain, clear English words (easy to read, like an 8th-grade student level). Absolutely NO Hindi words, NO Hinglish, and NO complex vocabulary.

STRICT MARKETING RULE: Every sentence must use psychological copywriting frameworks (like AIDA or PAS). Use clear psychological hooks, highlight massive benefits instead of just features, create strong urgency, and use high-converting calls to action (CTA) that drive immediate sales.

Return ONLY a valid JSON object matching this exact structure:
{
  "whatsapp": "WhatsApp broadcast message — 60 to 80 words, hyper-engaging sales hook, 2 to 3 emojis, ends with a powerful action-oriented buying link CTA",
  "googleBusiness": "Google My Business description — 120 to 150 words, mentions the city naturally, highly professional yet simple sales pitch, SEO-friendly local keywords",
  "instagram": [
    "First Instagram caption — 30 to 40 words, high-engagement curiosity hook, ends with 3 relevant hashtags including the city hashtag",
    "Second Instagram caption — 30 to 40 words, problem-solving angle showcasing the USP, ends with 3 relevant hashtags",
    "Third Instagram caption — 30 to 40 words, FOMO/limited-time offer angle, ends with 3 relevant hashtags"
  ],
  "offer": "Weekend promotional message — 35 to 45 words, creates massive scarcity/urgency, clearly defines the immediate financial discount or value benefit",
  "tagline": "A memorable 8 to 10 word high-impact tagline that clearly frames why this business is the best choice"
}`;

  // REVERSED SEQUENCE: Prioritizing ultra-lightweight models first to save quotas and avoid 503 spikes
  const modelsToTry = [
    "gemini-3.1-flash-lite", // 1st Choice (Light, fast, lowest demand)
    "gemini-2.5-flash",      // 2nd Choice (Solid stable backup)
    "gemini-3.5-flash"       // 3rd Choice (Heavy default)
  ];

  let apiResponseData = null;
  let successfulModelUsed = "";

  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error('Missing GEMINI_API_KEY environment variable.');
      return res.status(500).json({ error: 'Server configuration error: Missing API Key.' });
    }

    // Try each model dynamically until one succeeds
    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting generation with model: ${modelName}`);
        
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.6, // Slightly reduced for more structured, conversion-focused responses
                maxOutputTokens: 2500,
                responseMimeType: "application/json" 
              }
            })
          }
        );

        const data = await response.json();

        // If this specific model is experiencing 503 or overloaded, move to the next model in the sequence
        if (data.error && (data.error.code === 503 || data.error.status === 'UNAVAILABLE')) {
          console.warn(`Model ${modelName} is busy. Swapping to fallback...`);
          continue; 
        }

        // Catch and output any different API restrictions
        if (data.error) {
          console.error(`Gemini API error on ${modelName}:`, data.error);
          return res.status(500).json({ error: `API Error: ${data.error.message || 'Unknown error'}` });
        }

        // Confirm candidates structure exists safely
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
          apiResponseData = data;
          successfulModelUsed = modelName;
          break; 
        }

      } catch (innerLoopError) {
        console.error(`Fetch failure on model ${modelName}:`, innerLoopError);
      }
    }

    // Error safety out of options
    if (!apiResponseData) {
      return res.status(503).json({
        error: 'All Gemini API endpoints are currently experiencing critically high demand. Please try again in a moment.'
      });
    }

    console.log(`Success! Request completed cleanly by: ${successfulModelUsed}`);

    // Extract text payload
    let rawText = apiResponseData.candidates[0].content.parts[0].text.trim();

    // Isolate the core JSON object cleanly from any outer markdown blocks
    const firstBracket = rawText.indexOf('{');
    const lastBracket = rawText.lastIndexOf('}');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      rawText = rawText.substring(firstBracket, lastBracket + 1);
    }

    // Parse the completely isolated JSON string
    const parsed = JSON.parse(rawText);
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Final Generation parsing error:', error);
    return res.status(500).json({
      error: 'Generation failed to process clean structured text. Please try again.'
    });
  }
}
