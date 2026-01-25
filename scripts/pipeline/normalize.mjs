/**
 * Step 2-v1: Spotify 앨범 데이터 정규화
 * 
 * 목표:
 * 1. region_bucket 100% 채우기 (MapCanvas 크래시 방지)
 * 2. genreFamily 추가 (상위 카테고리 매핑)
 * 3. country 필드 표준화 (기존 UI 호환)
 * 4. 원본 Spotify 장르 데이터 유지
 */

import fs from "fs";
import path from "path";

const INPUT_FILE = path.resolve("./out/albums_spotify_v0.json");
const OUTPUT_FILE = path.resolve("./out/albums_spotify_v1.json");

// ============================================
// 1. genreFamily 매핑 (규칙 기반)
// ============================================

const GENRE_FAMILY_MAP = {
  // Pop
  "Pop": ["pop", "dance pop", "indie pop", "art pop", "electropop", "synth pop", "power pop", "bubblegum pop"],
  
  // Rock
  "Rock": ["rock", "classic rock", "hard rock", "soft rock", "indie rock", "psychedelic rock", "progressive rock", "yacht rock", "glam rock"],
  
  // Hip Hop
  "Hip Hop": ["hip hop", "rap", "trap", "conscious hip hop", "gangsta rap", "southern hip hop", "east coast hip hop", "west coast rap"],
  
  // R&B/Soul
  "R&B/Soul": ["r&b", "soul", "neo soul", "contemporary r&b", "urban contemporary", "quiet storm", "funk"],
  
  // Electronic
  "Electronic": ["electronic", "edm", "house", "techno", "trance", "dubstep", "drum and bass", "ambient", "idm", "downtempo", "electro"],
  
  // Jazz/Blues
  "Jazz/Blues": ["jazz", "blues", "bebop", "cool jazz", "hard bop", "smooth jazz", "vocal jazz", "jazz fusion", "swing", "big band"],
  
  // Classical
  "Classical": ["classical", "opera", "baroque", "romantic", "contemporary classical", "orchestral", "chamber music"],
  
  // Alternative/Indie
  "Alternative/Indie": ["alternative", "indie", "indie folk", "indie rock", "alternative rock", "post-punk", "shoegaze", "dream pop"],
  
  // Metal
  "Metal": ["metal", "heavy metal", "death metal", "black metal", "thrash metal", "doom metal", "power metal", "metalcore"],
  
  // Folk/World
  "Folk/World": ["folk", "world", "traditional", "celtic", "country", "americana", "bluegrass", "world music"],
  
  // Latin
  "Latin": ["latin", "reggaeton", "salsa", "bachata", "cumbia", "merengue", "latin pop", "spanish"],
  
  // K-pop/Asia Pop
  "K-pop/Asia Pop": ["k-pop", "j-pop", "korean", "japanese", "mandopop", "cantopop", "c-pop"],
  
  // Reggae
  "Reggae": ["reggae", "dancehall", "ska", "dub", "roots reggae"],
  
  // Country
  "Country": ["country", "country rock", "outlaw country", "contemporary country"],
};

function mapGenreFamily(primaryGenre, artistGenres) {
  const allGenres = [primaryGenre, ...(artistGenres || [])].filter(Boolean).map(g => g.toLowerCase());
  
  if (allGenres.length === 0) {
    return { family: "Unknown", confidence: 0.0 };
  }
  
  // 각 family에 대해 매칭 점수 계산
  const scores = {};
  for (const [family, keywords] of Object.entries(GENRE_FAMILY_MAP)) {
    let score = 0;
    for (const genre of allGenres) {
      for (const keyword of keywords) {
        if (genre.includes(keyword) || keyword.includes(genre)) {
          score += 1;
        }
      }
    }
    if (score > 0) {
      scores[family] = score;
    }
  }
  
  if (Object.keys(scores).length === 0) {
    return { family: "Unknown", confidence: 0.3 };
  }
  
  // 최고 점수 family 선택
  const bestFamily = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const maxScore = Math.max(...Object.values(scores));
  const confidence = Math.min(1.0, maxScore / allGenres.length);
  
  return { family: bestFamily[0], confidence };
}

// ============================================
// 2. region_bucket 추정 (market 기반)
// ============================================

const MARKET_TO_REGION = {
  // North America
  "US": "North America",
  "CA": "North America",
  "MX": "North America",
  
  // Europe
  "UK": "Europe",
  "FR": "Europe", "DE": "Europe", "IT": "Europe", "ES": "Europe",
  "NL": "Europe", "BE": "Europe", "CH": "Europe", "AT": "Europe",
  "SE": "Europe", "NO": "Europe", "DK": "Europe", "FI": "Europe",
  "PL": "Europe", "PT": "Europe", "IE": "Europe", "GR": "Europe",
  "CZ": "Europe", "HU": "Europe", "RO": "Europe",
  
  // Asia
  "KR": "Asia", "JP": "Asia", "CN": "Asia", "TW": "Asia",
  "HK": "Asia", "SG": "Asia", "TH": "Asia", "MY": "Asia",
  "ID": "Asia", "PH": "Asia", "IN": "Asia", "VN": "Asia",
  
  // South America
  "BR": "South America", "AR": "South America", "CL": "South America",
  "CO": "South America", "PE": "South America", "VE": "South America",
  "EC": "South America", "UY": "South America", "PY": "South America",
  
  // Caribbean
  "CU": "Caribbean", "JM": "Caribbean", "DO": "Caribbean",
  "PR": "Caribbean", "TT": "Caribbean",
  
  // Oceania
  "AU": "Oceania", "NZ": "Oceania",
  
  // Africa
  "ZA": "Africa", "NG": "Africa", "KE": "Africa", "EG": "Africa",
  "MA": "Africa", "GH": "Africa", "SN": "Africa",
};

const GENRE_TO_REGION_HINTS = {
  "k-pop": "Asia",
  "j-pop": "Asia",
  "korean": "Asia",
  "japanese": "Asia",
  "mandopop": "Asia",
  "latin": "South America",
  "reggaeton": "South America",
  "salsa": "South America",
  "reggae": "Caribbean",
  "dancehall": "Caribbean",
};

function deriveRegion(market, primaryGenre, artistGenres) {
  // 1차: market 기반
  if (market && MARKET_TO_REGION[market]) {
    return { region: MARKET_TO_REGION[market], source: "market" };
  }
  
  // 2차: 장르 힌트
  const allGenres = [primaryGenre, ...(artistGenres || [])].filter(Boolean).map(g => g.toLowerCase());
  for (const genre of allGenres) {
    for (const [keyword, region] of Object.entries(GENRE_TO_REGION_HINTS)) {
      if (genre.includes(keyword)) {
        return { region, source: "genre" };
      }
    }
  }
  
  // 3차: 기본값 (market이 있으면 그 market 이름 사용, 없으면 Unknown)
  return { region: market ? "North America" : "Unknown", source: "default" };
}

// ============================================
// 3. country 필드 표준화
// ============================================

const MARKET_TO_COUNTRY = {
  "KR": { name: "South Korea", code: "KR" },
  "US": { name: "United States", code: "US" },
  "CA": { name: "Canada", code: "CA" },
  "MX": { name: "Mexico", code: "MX" },
  "UK": { name: "United Kingdom", code: "UK" },
  "FR": { name: "France", code: "FR" },
  "DE": { name: "Germany", code: "DE" },
  "IT": { name: "Italy", code: "IT" },
  "ES": { name: "Spain", code: "ES" },
  "JP": { name: "Japan", code: "JP" },
  "CN": { name: "China", code: "CN" },
  "BR": { name: "Brazil", code: "BR" },
  "AR": { name: "Argentina", code: "AR" },
  "AU": { name: "Australia", code: "AU" },
  "SE": { name: "Sweden", code: "SE" },
  "NO": { name: "Norway", code: "NO" },
  "FI": { name: "Finland", code: "FI" },
  "NL": { name: "Netherlands", code: "NL" },
};

function standardizeCountry(market) {
  // Spotify v0에는 앨범별 country 정보가 없음
  // market만 있으므로 추정 금지 (요구사항)
  return {
    country: null,  // MapCanvas 호환 (null 허용)
    countryName: null,
    countryCode: null,
    countrySource: "unknown"
  };
}

// ============================================
// 4. 메인 정규화 로직
// ============================================

async function normalize() {
  console.log("📋 Step 2-v1: Dataset Normalization");
  console.log("=====================================\n");
  
  // 입력 파일 읽기
  console.log("📂 Reading:", INPUT_FILE);
  const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  
  if (!rawData.albums || !Array.isArray(rawData.albums)) {
    throw new Error("Invalid input file structure");
  }
  
  const market = rawData.market || null;
  console.log(`🌍 Market: ${market || "unknown"}`);
  console.log(`📊 Input albums: ${rawData.albums.length}\n`);
  
  // 각 앨범 정규화
  const normalized = rawData.albums.map((album, idx) => {
    // genreFamily 매핑
    const { family, confidence } = mapGenreFamily(album.primaryGenre, album.artistGenres);
    
    // region_bucket 추정 (필수!)
    const { region, source: regionSource } = deriveRegion(market, album.primaryGenre, album.artistGenres);
    
    // country 표준화
    const countryFields = standardizeCountry(market);
    
    // 정규화된 앨범 반환
    return {
      // 원본 필드 유지 (Spotify 데이터 보존)
      ...album,
      
      // 추가: genreFamily
      genreFamily: family,
      genreFamilyConfidence: confidence,
      
      // 추가: region_bucket (필수! MapCanvas 크래시 방지)
      region_bucket: region,
      region_source: regionSource,
      
      // 추가: country 표준화 (기존 UI 호환)
      ...countryFields,
    };
  });
  
  // 출력 파일 생성
  const output = {
    generatedAt: new Date().toISOString(),
    version: "v1",
    sourceFile: path.basename(INPUT_FILE),
    market: rawData.market,
    count: normalized.length,
    albums: normalized,
  };
  
  console.log("💾 Writing:", OUTPUT_FILE);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  
  // 간단한 통계
  console.log("\n✅ Normalization Complete!");
  console.log("=====================================");
  console.log(`Total albums: ${normalized.length}`);
  
  const genreFamilyFilled = normalized.filter(a => a.genreFamily && a.genreFamily !== "Unknown").length;
  console.log(`genreFamily filled: ${genreFamilyFilled}/${normalized.length} (${(genreFamilyFilled/normalized.length*100).toFixed(1)}%)`);
  
  const regionFilled = normalized.filter(a => a.region_bucket && a.region_bucket !== "Unknown").length;
  console.log(`region_bucket filled: ${regionFilled}/${normalized.length} (${(regionFilled/normalized.length*100).toFixed(1)}%)`);
  
  const countryFilled = normalized.filter(a => a.country !== null).length;
  console.log(`country filled: ${countryFilled}/${normalized.length} (${(countryFilled/normalized.length*100).toFixed(1)}%)`);
  
  console.log("\n💡 Next: Run 'npm run step2:validate' to check data quality");
}

// 실행
normalize().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
