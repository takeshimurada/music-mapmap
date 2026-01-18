
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Album, ExtendedAlbumData } from '../types';

// Use import.meta.env.VITE_API_KEY for Vite environment variables
const ai = new GoogleGenerativeAI(import.meta.env.VITE_API_KEY || "");

export const getExtendedAlbumDetails = async (album: Album, retries = 2): Promise<ExtendedAlbumData | null> => {
  // API 키 확인
  const apiKey = import.meta.env.VITE_API_KEY;
  if (!apiKey || apiKey === '') {
    console.warn("⚠️ VITE_API_KEY is not set. AI features will be disabled. Set VITE_API_KEY in .env.local to enable AI analysis.");
    return null;
  }

  // 사용자 언어 감지
  const userLang = navigator.language || 'en';
  const isKorean = userLang.startsWith('ko');
  const targetLang = isKorean ? 'Korean (한국어)' : 'English';

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`🔍 [Attempt ${attempt + 1}/${retries + 1}] Generating AI analysis for: ${album.title} by ${album.artist}`);

      // Gemini 2.5 Flash-Lite (더 빠른 모델)
      const model = ai.getGenerativeModel({ 
        model: 'gemini-2.5-flash-lite'
      });

      const prompt = `You are a music historian and critic. Provide comprehensive details about the album "${album.title}" by ${album.artist} (${album.year}).

Please respond ONLY with a valid JSON object (no markdown, no code blocks) in this exact format:

{
  "summaryEn": "A concise 3-sentence summary in English focusing on the album's musical style, innovation, and cultural impact.",
  "summaryKo": "자연스러운 한국어로 번역된 3문장 요약. 음악 스타일, 혁신성, 문화적 영향에 초점을 맞춰주세요.",
  "tracklist": ["Track 1", "Track 2", "Track 3", "Track 4", "Track 5"],
  "credits": ["Producer Name", "Engineer Name", "Featured Artist"],
  "creditDetails": [
    {
      "name": "Producer Name",
      "role": "Producer",
      "description": "Brief background about this person and their contribution to the album in ${targetLang}"
    },
    {
      "name": "Engineer Name",
      "role": "Engineer",
      "description": "Brief background about this person and their contribution to the album in ${targetLang}"
    }
  ],
  "reviews": [
    {
      "source": "Rolling Stone",
      "excerpt": "A notable review excerpt that MUST BE TRANSLATED to ${targetLang}",
      "url": "https://www.google.com/search?q=Rolling+Stone+${encodeURIComponent(album.title)}+${encodeURIComponent(album.artist)}+review"
    },
    {
      "source": "Pitchfork",
      "excerpt": "Another review excerpt that MUST BE TRANSLATED to ${targetLang}",
      "url": "https://www.google.com/search?q=Pitchfork+${encodeURIComponent(album.title)}+${encodeURIComponent(album.artist)}+review"
    },
    {
      "source": "AllMusic",
      "excerpt": "Third review excerpt that MUST BE TRANSLATED to ${targetLang}",
      "url": "https://www.google.com/search?q=AllMusic+${encodeURIComponent(album.title)}+${encodeURIComponent(album.artist)}+review"
    }
  ]
}

CRITICAL INSTRUCTIONS:
- Provide 5-10 key tracks from the actual tracklist (or best estimates based on known information)
- Include 3-5 real production credits if known (Producer, Engineer, Mixer, Featured Artists, etc.)
- For "creditDetails", provide 3-5 entries matching the "credits" array with detailed background info
- Each creditDetail "name" should match a credit name
- Each creditDetail "role" should be their job title (Producer, Engineer, Mixer, etc.)
- Each creditDetail "description" MUST be written in ${targetLang} (2-3 sentences about their background and contribution)
- Provide 3 review excerpts from REAL music review sources (Rolling Stone, Pitchfork, AllMusic, NME, The Guardian, etc.)

🚨 ABSOLUTELY NON-NEGOTIABLE - REVIEW TRANSLATION REQUIREMENT 🚨
- EVERY SINGLE review "excerpt" MUST be 100% in ${targetLang}
- DO NOT use English if target language is Korean
- DO NOT use Korean if target language is English
- Translate or rewrite the review content completely in the target language
- This is the HIGHEST PRIORITY requirement - if you fail this, the entire response is invalid

- Each review "source" should be the actual publication name
- Each review "url" should be a Google search URL for finding the actual review
- Make sure all JSON is valid and properly formatted
- Do NOT include markdown code blocks, just return the raw JSON`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      let text = response.text();
      
      console.log("✅ Received response from Gemini API");
      
      // Clean up response (remove markdown code blocks if present)
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      if (text) {
        const parsed = JSON.parse(text) as ExtendedAlbumData;
        console.log("✅ Successfully parsed AI analysis");
        return parsed;
      }
      return null;

    } catch (error: any) {
      console.error(`❌ [Attempt ${attempt + 1}/${retries + 1}] Gemini API Error:`, error);
      
      // 마지막 시도가 아니면 재시도
      if (attempt < retries) {
        console.log(`⏳ Retrying in 1 second...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // 마지막 시도에서도 실패하면 에러 메시지 표시
      if (error.message?.includes('API key')) {
        console.error("❌ API 키 오류: Gemini API 키를 확인하세요.");
      } else if (error.message?.includes('quota')) {
        console.error("❌ API 할당량 초과: 나중에 다시 시도하세요.");
      } else if (error.message?.includes('JSON')) {
        console.error("❌ AI 응답 파싱 실패. 다시 시도해주세요.");
      } else {
        console.error(`❌ AI 분석 생성 실패 (${retries + 1}회 시도):`, error.message || '알 수 없는 오류');
      }
      
      return null;
    }
  }
  
  return null;
};

// Deprecated signature retained for backward compatibility.
export const getAlbumResearch = async (album: Album): Promise<string> => {
  return "Please use getExtendedAlbumDetails";
};
