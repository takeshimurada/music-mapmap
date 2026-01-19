/**
 * Step 3: Country 보강 파이프라인
 * 
 * 목표:
 * 1. MusicBrainz API로 아티스트 출신 국가 조회 (1차)
 * 2. Discogs API로 앨범 발매 국가 조회 (2차, 실패한 것만)
 * 3. 기존 country 값은 절대 덮어쓰지 않음
 * 4. Spotify 원본 장르 데이터 유지
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const INPUT_FILE = path.resolve("./out/albums_spotify_v2.json"); // v2 (genre enriched) 입력
const OUTPUT_FILE = path.resolve("./out/albums_spotify_v3.json"); // v3 (country enriched) 출력
const CANONICAL_COUNTRY_FIELD = "country"; // 코드베이스가 읽는 필드명

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN || null;

// ============================================
// 유틸리티 함수
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retry = 0) {
  try {
    const response = await fetch(url, options);
    
    // Rate limit 처리
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') || '2');
      console.warn(`⚠️ Rate limited, waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      return fetchWithRetry(url, options, retry);
    }
    
    // 5xx 에러 재시도
    if (response.status >= 500 && retry < 3) {
      await sleep((retry + 1) * 1000);
      return fetchWithRetry(url, options, retry + 1);
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    if (retry < 3) {
      await sleep((retry + 1) * 1000);
      return fetchWithRetry(url, options, retry + 1);
    }
    throw error;
  }
}

// ============================================
// MusicBrainz API (1차 보강)
// ============================================

const mbCache = new Map();

async function queryMusicBrainz(artistName) {
  // 캐시 확인
  if (mbCache.has(artistName)) {
    return mbCache.get(artistName);
  }
  
  try {
    const encodedName = encodeURIComponent(artistName);
    const url = `https://musicbrainz.org/ws/2/artist?query=artist:${encodedName}&fmt=json&limit=5`;
    
    const headers = {
      'User-Agent': 'MusicMapProject/1.0.0 (https://github.com/yourusername/music-map)',
    };
    
    await sleep(1000); // Rate limit: 1 req/sec
    
    const data = await fetchWithRetry(url, { headers });
    
    if (!data.artists || data.artists.length === 0) {
      mbCache.set(artistName, null);
      return null;
    }
    
    // 최적 후보 선택 (score + name match)
    const candidates = data.artists
      .map(artist => ({
        ...artist,
        nameMatch: artist.name.toLowerCase().replace(/\s+/g, '') === artistName.toLowerCase().replace(/\s+/g, ''),
      }))
      .sort((a, b) => {
        // 정확한 이름 매칭 우선
        if (a.nameMatch && !b.nameMatch) return -1;
        if (!a.nameMatch && b.nameMatch) return 1;
        // 그 다음 score 우선
        return (b.score || 0) - (a.score || 0);
      });
    
    const best = candidates[0];
    
    // country 추출
    let countryName = null;
    let countryCode = null;
    
    // 우선순위 1: country 필드 (ISO 코드)
    if (best.country) {
      countryCode = best.country;
    }
    
    // 우선순위 2: area.name (국가명)
    if (best.area && best.area.name) {
      countryName = best.area.name;
    }
    
    // countryCode → countryName 변환 (간단한 매핑)
    if (countryCode && !countryName) {
      countryName = mapCountryCodeToName(countryCode);
    }
    
    const result = {
      countryName,
      countryCode,
      source: 'musicbrainz',
      type: 'artist_origin',
    };
    
    mbCache.set(artistName, result);
    return result;
    
  } catch (error) {
    console.warn(`⚠️ MusicBrainz failed for "${artistName}":`, error.message);
    mbCache.set(artistName, null);
    return null;
  }
}

// ============================================
// Discogs API (2차 보강)
// ============================================

const discogsCache = new Map();

async function queryDiscogs(artistName, albumTitle) {
  if (!DISCOGS_TOKEN) {
    return null;
  }
  
  const cacheKey = `${artistName}||${albumTitle}`;
  
  // 캐시 확인
  if (discogsCache.has(cacheKey)) {
    return discogsCache.get(cacheKey);
  }
  
  try {
    const query = encodeURIComponent(`${artistName} ${albumTitle}`);
    const url = `https://api.discogs.com/database/search?q=${query}&type=release&token=${DISCOGS_TOKEN}&per_page=5`;
    
    await sleep(1100); // Rate limit: < 60 req/min
    
    const data = await fetchWithRetry(url);
    
    if (!data.results || data.results.length === 0) {
      discogsCache.set(cacheKey, null);
      return null;
    }
    
    // 가장 적합한 release 찾기
    const candidates = data.results.filter(r => {
      const title = (r.title || '').toLowerCase();
      const artist = artistName.toLowerCase();
      return title.includes(artist);
    });
    
    if (candidates.length === 0) {
      discogsCache.set(cacheKey, null);
      return null;
    }
    
    const best = candidates[0];
    
    if (!best.country) {
      discogsCache.set(cacheKey, null);
      return null;
    }
    
    const result = {
      countryName: best.country, // Discogs는 이미 국가명 제공
      countryCode: mapCountryNameToCode(best.country),
      source: 'discogs',
      type: 'release_country',
    };
    
    discogsCache.set(cacheKey, result);
    return result;
    
  } catch (error) {
    console.warn(`⚠️ Discogs failed for "${artistName} - ${albumTitle}":`, error.message);
    discogsCache.set(cacheKey, null);
    return null;
  }
}

// ============================================
// 국가 코드/이름 매핑
// ============================================

const CODE_TO_NAME = {
  'KR': 'South Korea', 'US': 'United States', 'GB': 'United Kingdom',
  'CA': 'Canada', 'MX': 'Mexico', 'FR': 'France', 'DE': 'Germany',
  'IT': 'Italy', 'ES': 'Spain', 'JP': 'Japan', 'CN': 'China',
  'BR': 'Brazil', 'AR': 'Argentina', 'AU': 'Australia', 'SE': 'Sweden',
  'NO': 'Norway', 'FI': 'Finland', 'NL': 'Netherlands', 'BE': 'Belgium',
  'CH': 'Switzerland', 'AT': 'Austria', 'PL': 'Poland', 'PT': 'Portugal',
  'IE': 'Ireland', 'GR': 'Greece', 'DK': 'Denmark', 'CZ': 'Czech Republic',
  'HU': 'Hungary', 'RO': 'Romania', 'IN': 'India', 'TH': 'Thailand',
  'MY': 'Malaysia', 'ID': 'Indonesia', 'PH': 'Philippines', 'SG': 'Singapore',
  'TW': 'Taiwan', 'HK': 'Hong Kong', 'VN': 'Vietnam', 'CL': 'Chile',
  'CO': 'Colombia', 'PE': 'Peru', 'VE': 'Venezuela', 'EC': 'Ecuador',
  'UY': 'Uruguay', 'PY': 'Paraguay', 'CU': 'Cuba', 'JM': 'Jamaica',
  'DO': 'Dominican Republic', 'PR': 'Puerto Rico', 'TT': 'Trinidad and Tobago',
  'NZ': 'New Zealand', 'ZA': 'South Africa', 'NG': 'Nigeria', 'KE': 'Kenya',
  'EG': 'Egypt', 'MA': 'Morocco', 'GH': 'Ghana', 'SN': 'Senegal',
};

const NAME_TO_CODE = Object.fromEntries(
  Object.entries(CODE_TO_NAME).map(([k, v]) => [v, k])
);

function mapCountryCodeToName(code) {
  return CODE_TO_NAME[code] || null;
}

function mapCountryNameToCode(name) {
  return NAME_TO_CODE[name] || null;
}

// ============================================
// 메인 보강 로직
// ============================================

async function enrichCountry() {
  console.log("🌍 Step 3: Country Enrichment Pipeline");
  console.log("==========================================\n");
  
  // 입력 파일 읽기
  console.log("📂 Reading:", INPUT_FILE);
  const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  
  if (!rawData.albums || !Array.isArray(rawData.albums)) {
    throw new Error("Invalid input file structure");
  }
  
  const total = rawData.albums.length;
  console.log(`📊 Total albums: ${total}\n`);
  
  // Discogs 토큰 확인
  if (DISCOGS_TOKEN) {
    console.log("✅ Discogs token found - will use 2-stage enrichment\n");
  } else {
    console.log("⚠️ No Discogs token - will only use MusicBrainz\n");
  }
  
  // 보강 대상 식별
  const needsEnrichment = rawData.albums.filter(album => {
    const hasCountry = album[CANONICAL_COUNTRY_FIELD] && 
                       album[CANONICAL_COUNTRY_FIELD] !== "Unknown" &&
                       album[CANONICAL_COUNTRY_FIELD] !== null;
    return !hasCountry;
  });
  
  console.log(`🎯 Albums needing enrichment: ${needsEnrichment.length}/${total}\n`);
  console.log("Starting enrichment...\n");
  
  // 통계
  const stats = {
    musicbrainz_success: 0,
    discogs_success: 0,
    failed: 0,
  };
  
  // 각 앨범 보강
  for (let i = 0; i < rawData.albums.length; i++) {
    const album = rawData.albums[i];
    
    // 이미 country가 있으면 스킵
    if (album[CANONICAL_COUNTRY_FIELD] && 
        album[CANONICAL_COUNTRY_FIELD] !== "Unknown" &&
        album[CANONICAL_COUNTRY_FIELD] !== null) {
      // 기존 값 유지, source만 설정
      album.countrySource = album.countrySource || "existing";
      continue;
    }
    
    // MusicBrainz 시도 (1차)
    let result = await queryMusicBrainz(album.artistName);
    
    if (result && result.countryName) {
      album.countryName = result.countryName;
      album.countryCode = result.countryCode;
      album.countrySource = result.source;
      album.countryType = result.type;
      album[CANONICAL_COUNTRY_FIELD] = result.countryName;
      stats.musicbrainz_success++;
    } else {
      // Discogs 시도 (2차)
      if (DISCOGS_TOKEN) {
        result = await queryDiscogs(album.artistName, album.title);
        
        if (result && result.countryName) {
          album.countryName = result.countryName;
          album.countryCode = result.countryCode;
          album.countrySource = result.source;
          album.countryType = result.type;
          album[CANONICAL_COUNTRY_FIELD] = result.countryName;
          stats.discogs_success++;
        } else {
          // 실패
          album.countryName = "Unknown";
          album.countryCode = null;
          album.countrySource = "unknown";
          album.countryType = "unknown";
          album[CANONICAL_COUNTRY_FIELD] = "Unknown";
          stats.failed++;
        }
      } else {
        // Discogs 스킵
        album.countryName = "Unknown";
        album.countryCode = null;
        album.countrySource = "unknown";
        album.countryType = "unknown";
        album[CANONICAL_COUNTRY_FIELD] = "Unknown";
        stats.failed++;
      }
    }
    
    // 진행률 출력 (50개마다)
    if ((i + 1) % 50 === 0 || i === rawData.albums.length - 1) {
      const processed = i + 1;
      const pct = (processed / total * 100).toFixed(1);
      console.log(`Progress: ${processed}/${total} (${pct}%) | MB: ${stats.musicbrainz_success} | Discogs: ${stats.discogs_success} | Failed: ${stats.failed}`);
    }
  }
  
  // 출력 파일 생성
  const output = {
    generatedAt: new Date().toISOString(),
    version: "v3",
    sourceFile: path.basename(INPUT_FILE),
    market: rawData.market,
    count: rawData.albums.length,
    albums: rawData.albums,
  };
  
  console.log("\n💾 Writing:", OUTPUT_FILE);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  
  // 최종 통계
  console.log("\n✅ Enrichment Complete!");
  console.log("==========================================");
  console.log(`MusicBrainz success: ${stats.musicbrainz_success}`);
  console.log(`Discogs success: ${stats.discogs_success}`);
  console.log(`Failed (Unknown): ${stats.failed}`);
  
  const totalEnriched = stats.musicbrainz_success + stats.discogs_success;
  const enrichmentRate = needsEnrichment.length > 0 
    ? (totalEnriched / needsEnrichment.length * 100).toFixed(1) 
    : 0;
  console.log(`\nEnrichment rate: ${totalEnriched}/${needsEnrichment.length} (${enrichmentRate}%)`);
  
  console.log("\n💡 Next: Run 'npm run step3:report-country' to generate detailed report");
}

// 실행
enrichCountry().catch(err => {
  console.error("\n❌ Error:", err);
  process.exit(1);
});
