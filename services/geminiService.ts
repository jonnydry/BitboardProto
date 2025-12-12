import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini client lazily to avoid errors when API key is missing
let ai: GoogleGenAI | null = null;

const getAI = () => {
  if (!ai) {
    // Note: VITE_* env vars are embedded into the client bundle (public).
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
      console.warn('[Gemini] No API key configured - link scanning disabled');
      return null;
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
};

export const scanLink = async (url: string) => {
  const client = getAI();
  if (!client) {
    console.warn('[Gemini] Link scanning not available - no API key');
    return null;
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze this URL: ${url}. Return a JSON object with the page title, a brief summary (description), and a relevant main image URL (imageUrl) if one can be found via search or context.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "The title of the web page" },
            description: { type: Type.STRING, description: "A brief summary of the content" },
            imageUrl: { type: Type.STRING, description: "A URL to a representative image for the page, or empty string if none found" }
          },
          required: ["title", "description"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return null;
  } catch (error) {
    console.error("[Gemini] Link scan failed:", error);
    return null;
  }
};
