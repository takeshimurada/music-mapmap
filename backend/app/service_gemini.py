import os
import json
from google import genai
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .models import AiResearch, Album
import redis.asyncio as redis

API_KEY = os.getenv("API_KEY")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Setup Redis
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

async def get_ai_research(db: AsyncSession, album_id: str, lang: str = 'en'):
    # 1. Check Redis
    cache_key = f"research:{album_id}:{lang}"
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # 2. Check DB
    result = await db.execute(select(AiResearch).where(AiResearch.cache_key == cache_key))
    db_record = result.scalars().first()
    if db_record:
        data = {
            "summary_md": db_record.summary_md,
            "sources": db_record.sources,
            "confidence": db_record.confidence
        }
        await redis_client.setex(cache_key, 604800, json.dumps(data)) # 7 days
        return data

    # 3. Call Gemini
    if not API_KEY:
        raise Exception("API_KEY not configured")

    # Fetch Album Context
    album_res = await db.execute(select(Album).where(Album.id == album_id))
    album = album_res.scalars().first()
    if not album:
        raise Exception("Album not found")

    client = genai.Client(api_key=API_KEY)
    
    prompt = f"""
    Analyze the album '{album.title}' by {album.artist_name} ({album.year}).
    
    Provide a response in JSON format adhering to this schema:
    {{
        "summary_en_md": "string (markdown)",
        "summary_ko_md": "string (markdown)",
        "sources": [{{"title": "string", "url": "string", "snippet": "string"}}],
        "key_facts": [{{"label": "string", "value": "string"}}],
        "confidence": number (0-1)
    }}
    
    Requirements:
    - Use Google Search to find accurate reviews and historical context.
    - 'summary_en_md': 3 paragraphs on style, legacy, and reception.
    - 'summary_ko_md': Translate the English summary to natural Korean.
    - 'sources': Include 3-5 verified web sources used.
    """

    # Using gemini-3-flash-preview for speed/efficiency with tools
    # Note: Python SDK tool config might differ slightly, using simplified generic structure
    try:
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                tools=[types.Tool(google_search=types.GoogleSearch())],
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "summary_en_md": {"type": "STRING"},
                        "summary_ko_md": {"type": "STRING"},
                        "sources": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "title": {"type": "STRING"},
                                    "url": {"type": "STRING"},
                                    "snippet": {"type": "STRING"}
                                }
                            }
                        },
                        "confidence": {"type": "NUMBER"}
                    }
                }
            )
        )
        
        raw_text = response.text
        parsed = json.loads(raw_text)
        
        # Save to DB
        summary = parsed.get(f"summary_{lang}_md", parsed.get("summary_en_md"))
        
        new_record = AiResearch(
            album_id=album_id,
            lang=lang,
            summary_md=summary,
            sources=parsed.get("sources", []),
            confidence=parsed.get("confidence", 0.8),
            cache_key=cache_key
        )
        db.add(new_record)
        await db.commit()
        await db.refresh(new_record)

        result_data = {
            "summary_md": new_record.summary_md,
            "sources": new_record.sources,
            "confidence": new_record.confidence
        }
        
        await redis_client.setex(cache_key, 604800, json.dumps(result_data))
        return result_data

    except Exception as e:
        print(f"Gemini Error: {e}")
        return {
            "summary_md": "AI analysis unavailable.",
            "sources": [],
            "confidence": 0.0
        }
