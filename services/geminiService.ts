
import { GoogleGenAI, Type } from "@google/genai";
import { Album, ExtendedAlbumData } from '../types';

// Use process.env.API_KEY directly as per guidelines.
// Assume this variable is pre-configured, valid, and accessible.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getExtendedAlbumDetails = async (album: Album): Promise<ExtendedAlbumData | null> => {
  try {
    // Select gemini-3-flash-preview for text analysis and extraction tasks.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Provide comprehensive details for the album "${album.title}" by ${album.artist} (${album.year}).
      
Requirements:
1. summaryEn: A concise 3-sentence summary in English focusing on its musical style and legacy.
2. summaryKo: Translate the summary to Korean (natural tone).
3. tracklist: List top 5-10 key tracks.
4. credits: Key producers, engineers, or featured artists (max 5).
5. reviews: 3 notable critical review excerpts (real or historically accurate context) with source names and hypothetical URLs.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summaryEn: { type: Type.STRING, description: "A concise 3-sentence summary in English." },
            summaryKo: { type: Type.STRING, description: "Korean translation of the summary." },
            tracklist: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "List of key tracks."
            },
            credits: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Key credits."
            },
            reviews: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  source: { type: Type.STRING },
                  excerpt: { type: Type.STRING },
                  url: { type: Type.STRING }
                },
                required: ["source", "excerpt", "url"]
              },
              description: "Critical review excerpts."
            }
          },
          required: ["summaryEn", "summaryKo", "tracklist", "credits", "reviews"],
          propertyOrdering: ["summaryEn", "summaryKo", "tracklist", "credits", "reviews"]
        }
      }
    });

    // Access the .text property directly from the response.
    const text = response.text;
    if (text) {
      return JSON.parse(text) as ExtendedAlbumData;
    }
    return null;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};

// Deprecated signature retained for backward compatibility.
export const getAlbumResearch = async (album: Album): Promise<string> => {
  return "Please use getExtendedAlbumDetails";
};
