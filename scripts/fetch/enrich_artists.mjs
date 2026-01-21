/**
 * Phase 1: 아티스트 기본 정보 수집
 * 
 * 기능:
 * - v0.json에서 아티스트 ID 추출
 * - Spotify API로 아티스트 상세 정보 수집
 * - MusicBrainz API로 아티스트 출신 국가 수집
 * - 결과를 artists.json으로 저장
 * 
 * Usage:
 *   node scripts/fetch/enrich_artists.mjs
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env");
  process.exit(1);
}

const INPUT_FILE = path.resolve("./out/albums_spotify_v0.json");
const OUTPUT_FILE = path.resolve("./out/artists_spotify.json");
const MB_CACHE_FILE = path.resolve("./out/mb_cache.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

async function fetchJson(url, options = {}, retry = 0) {
  let res;
  try {
    res = await fetchWithTimeout(url, options, 30000);
  } catch (error) {
    console.log(`  ⚠️  요청 실패: ${error.message}`);
    throw error;
  }

  // Rate limit 처리
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") || "1");
    console.log(`  ⏳ Rate limit - ${retryAfter}초 대기 중...`);
    await sleep((retryAfter + 0.2) * 1000);
    return fetchJson(url, options, retry);
  }

  // 서버 에러 재시도
  if (res.status >= 500 && retry < 3) {
    console.log(`  🔄 서버 에러 (${res.status}) - 재시도 ${retry + 1}/3`);
    await sleep((retry + 1) * 400);
    return fetchJson(url, options, retry + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return await res.json();
}

async function getAccessToken() {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");

  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const json = await fetchJson("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return json.access_token;
}

async function getArtist(token, artistId) {
  const url = `https://api.spotify.com/v1/artists/${artistId}`;
  return fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function getMultipleArtists(token, artistIds) {
  // Spotify API는 최대 50개 아티스트를 한 번에 가져올 수 있음
  const url = `https://api.spotify.com/v1/artists?ids=${artistIds.join(',')}`;
  return fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
}

// ============================================
// MusicBrainz - 아티스트 국가 조회
// ============================================

function loadMbCache() {
  if (!fs.existsSync(MB_CACHE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(MB_CACHE_FILE, 'utf-8'));
  } catch (e) {
    console.warn('⚠️ MusicBrainz 캐시 로드 실패, 새로 시작');
    return {};
  }
}

function saveMbCache(cache) {
  fs.writeFileSync(MB_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

function cacheKey(artistName) {
  return artistName?.trim().toLowerCase();
}

async function queryMusicBrainzCountry(artistName, mbCache) {
  const key = cacheKey(artistName);
  
  // 캐시 확인
  if (key && mbCache[key]) {
    const cached = mbCache[key];
    if (cached.notFound) {
      return null;
    }
    if (cached.countryCode) {
      return cached.countryCode;
    }
  }
  
  try {
    const encodedName = encodeURIComponent(artistName);
    const url = `https://musicbrainz.org/ws/2/artist?query=artist:${encodedName}&fmt=json&limit=3`;
    
    const headers = {
      'User-Agent': 'MusicMapProject/1.0.0 (https://github.com/yourusername/music-map)',
    };
    
    await sleep(1100); // Rate limit: ~1 req/sec
    
    const response = await fetchWithTimeout(url, { headers }, 15000);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.artists || data.artists.length === 0) {
      if (key) {
        mbCache[key] = { countryCode: null, notFound: true, fetchedAt: new Date().toISOString() };
        saveMbCache(mbCache);
      }
      return null;
    }
    
    // 최적 후보 선택 (정확한 이름 매칭 우선)
    const best = data.artists
      .map(artist => ({
        ...artist,
        nameMatch: artist.name.toLowerCase().replace(/\s+/g, '') === artistName.toLowerCase().replace(/\s+/g, ''),
      }))
      .sort((a, b) => {
        if (a.nameMatch && !b.nameMatch) return -1;
        if (!a.nameMatch && b.nameMatch) return 1;
        return (b.score || 0) - (a.score || 0);
      })[0];
    
    // country 추출 (ISO 2-letter code)
    let countryCode = null;
    if (best.country) {
      countryCode = best.country.toUpperCase();
    } else if (best.area && best['iso-3166-1-codes'] && best['iso-3166-1-codes'].length > 0) {
      countryCode = best['iso-3166-1-codes'][0].toUpperCase();
    }
    
    // 캐시 저장
    if (key) {
      mbCache[key] = {
        countryCode,
        artistName: best.name,
        fetchedAt: new Date().toISOString()
      };
      saveMbCache(mbCache);
    }
    
    return countryCode;
  } catch (error) {
    console.warn(`  ⚠️ MusicBrainz 조회 실패 (${artistName}): ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('\n🎤 아티스트 정보 수집 시작\n');
  console.log('=' * 60);

  // 1. v0.json 로드
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ ${INPUT_FILE} 파일이 없습니다!`);
    console.error(`   먼저 npm run fetch:spotify를 실행하세요.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const albums = data.albums || [];
  
  console.log(`📥 앨범 데이터 로드: ${albums.length}개`);

  // 2. 아티스트 ID 추출 (중복 제거)
  const artistIds = new Set();
  for (const album of albums) {
    const artistId = album.spotify?.artistId;
    if (artistId) {
      artistIds.add(artistId);
    }
  }

  console.log(`🎯 고유 아티스트: ${artistIds.size}개\n`);

  // 3. 토큰 발급
  console.log('🔐 Spotify 토큰 발급 중...');
  const token = await getAccessToken();
  console.log('✅ 토큰 발급 완료\n');

  // 4. 기존 artists.json 로드 (있으면)
  let existingArtists = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      existingArtists = existing.artists || {};
      console.log(`📂 기존 아티스트 데이터: ${Object.keys(existingArtists).length}개\n`);
    } catch (e) {
      console.warn('⚠️  기존 파일 로드 실패, 새로 시작\n');
    }
  }

  // 5. MusicBrainz 캐시 로드
  const mbCache = loadMbCache();
  console.log(`🗄️  MusicBrainz 캐시: ${Object.keys(mbCache).length}개\n`);

  // 6. 아티스트 정보 수집
  const artistIdsArray = Array.from(artistIds);
  const totalArtists = artistIdsArray.length;
  let collected = 0;
  let skipped = 0;
  let failed = 0;
  let countryFound = 0;

  // 50개씩 배치 처리
  const batchSize = 50;
  for (let i = 0; i < artistIdsArray.length; i += batchSize) {
    const batch = artistIdsArray.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(artistIdsArray.length / batchSize);

    console.log(`\n[배치 ${batchNum}/${totalBatches}] ${batch.length}개 아티스트 처리 중...`);

    // 이미 있는 아티스트 필터링
    const newIds = batch.filter(id => !existingArtists[id]);
    
    if (newIds.length === 0) {
      console.log(`  ⏭️  모두 이미 수집됨, 스킵`);
      skipped += batch.length;
      continue;
    }

    console.log(`  🆕 새로운 아티스트: ${newIds.length}개`);

    try {
      const response = await getMultipleArtists(token, newIds);
      
      if (response.artists) {
        for (const artist of response.artists) {
          if (artist) {
            // Spotify 기본 정보
            existingArtists[artist.id] = {
              id: artist.id,
              name: artist.name,
              genres: artist.genres || [],
              popularity: artist.popularity ?? null,
              followers: artist.followers?.total ?? null,
              image_url: artist.images?.[0]?.url || null,
              spotify_url: artist.external_urls?.spotify || null,
              country_code: null,  // 🌍 MusicBrainz에서 채울 예정
              fetched_at: new Date().toISOString()
            };
            collected++;
          }
        }
        console.log(`  ✅ Spotify 수집 완료: ${response.artists.filter(a => a).length}개`);
        
        // 🌍 MusicBrainz로 국가 정보 보강
        console.log(`  🌍 MusicBrainz 국가 조회 중...`);
        for (const artist of response.artists) {
          if (artist && existingArtists[artist.id]) {
            const countryCode = await queryMusicBrainzCountry(artist.name, mbCache);
            if (countryCode) {
              existingArtists[artist.id].country_code = countryCode;
              countryFound++;
            }
          }
        }
        console.log(`  ✅ 국가 정보: ${response.artists.filter(a => a && existingArtists[a.id]?.country_code).length}개 발견`);
      }
    } catch (error) {
      console.error(`  ❌ 배치 실패: ${error.message}`);
      failed += newIds.length;
    }

    // Rate limit 방지를 위한 대기
    if (i + batchSize < artistIdsArray.length) {
      await sleep(100);
    }

    // 진행상황 저장 (50개 배치마다)
    if (batchNum % 5 === 0) {
      fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          totalArtists: Object.keys(existingArtists).length,
          artists: existingArtists
        }, null, 2),
        'utf-8'
      );
      console.log(`  💾 중간 저장 완료 (${Object.keys(existingArtists).length}개)`);
    }
  }

  // 6. 최종 저장
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalArtists: Object.keys(existingArtists).length,
      artists: existingArtists
    }, null, 2),
    'utf-8'
  );

  console.log('\n' + '='.repeat(60));
  console.log('✅ 아티스트 정보 수집 완료!');
  console.log('='.repeat(60));
  console.log(`📊 통계:`);
  console.log(`   • 총 아티스트: ${totalArtists}개`);
  console.log(`   • 새로 수집: ${collected}개`);
  console.log(`   • 이미 존재: ${skipped}개`);
  console.log(`   • 실패: ${failed}개`);
  console.log(`   • 최종 DB: ${Object.keys(existingArtists).length}개`);
  
  // 국가 정보 통계
  const artistsWithCountry = Object.values(existingArtists).filter(a => a.country_code).length;
  const countryPercentage = ((artistsWithCountry / Object.keys(existingArtists).length) * 100).toFixed(1);
  console.log(`\n🌍 국가 정보:`);
  console.log(`   • 국가 있음: ${artistsWithCountry}/${Object.keys(existingArtists).length} (${countryPercentage}%)`);
  console.log(`   • 이번에 발견: ${countryFound}개`);
  
  console.log(`\n💾 저장 위치: ${OUTPUT_FILE}`);
}

main().catch(error => {
  console.error('\n❌ 에러 발생:', error);
  process.exit(1);
});
