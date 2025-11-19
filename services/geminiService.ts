import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const scanLink = async (url: string) => {
  try {
    const response = await ai.models.generateContent({
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
    console.error("Link scan failed:", error);
    return null;
  }
};