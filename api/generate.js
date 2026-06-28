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

  // List of fallback models in priority order to combat 503 high demand traffic spikes
  const modelsToTry = [
    "gemini-3.5-flash",       // Primary choice
    "gemini-2.5-flash",       // Secondary solid fallback
    "gemini-3.1-flash-lite"   // Ultra-light, fast fallback
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
                temperature: 0.7,
                maxOutputTokens: 2500,
                responseMimeType: "application/json" 
              }
            })
          }
        );

        const data = await response.json();

        // If this model is hitting 503 or overloaded, drop down to the catch block to try the next model
        if (data.error && (data.error.code === 503 || data.error.status === 'UNAVAILABLE')) {
          console.warn(`Model ${modelName} is busy. Swapping to fallback...`);
          continue; 
        }

        // If it's a different API error, break early to show it
        if (data.error) {
          console.error(`Gemini API error on ${modelName}:`, data.error);
          return res.status(500).json({ error: `API Error: ${data.error.message || 'Unknown error'}` });
        }

        // Check if output is structurally valid
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
          apiResponseData = data;
          successfulModelUsed = modelName;
          break; // Successfully grabbed data, break the loop!
        }

      } catch (innerLoopError) {
        console.error(`Fetch failure on model ${modelName}:`, innerLoopError);
        // Continue down the loop to try the next available lighter model string
      }
    }

    // Completely out of options
    if (!apiResponseData) {
      return res.status(503).json({
        error: 'All Gemini API endpoints are currently experiencing critically high demand. Please try again in a moment.'
      });
    }

    console.log(`Success! Request completed cleanly by: ${successfulModelUsed}`);

    // Extract text payload
    let rawText = apiResponseData.candidates[0].content.parts[0].text.trim();

    // Isolate the core JSON object from any stray text characters
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
