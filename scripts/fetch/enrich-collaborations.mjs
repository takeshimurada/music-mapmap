/**
 * Phase 2: 협업 아티스트 관계 수집
 * 
 * 기능:
 * - v0.json의 앨범들에서 트랙별 아티스트 정보 수집
 * - 메인 아티스트, 피처링 아티스트 구분
 * - 앨범-아티스트 관계 데이터 생성
 * 
 * Usage:
 *   node scripts/fetch/enrich-collaborations.mjs
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_MIN_INTERVAL_MS = Number(process.env.SPOTIFY_MIN_INTERVAL_MS || "200");
const SPOTIFY_MAX_RETRIES = Number(process.env.SPOTIFY_MAX_RETRIES || "6");
const SPOTIFY_BATCH_DELAY_MS = Number(process.env.SPOTIFY_BATCH_DELAY_MS || "200");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env");
  process.exit(1);
}

const INPUT_FILE = path.resolve("./out/albums_spotify_v0.json");
const OUTPUT_FILE = path.resolve("./out/album_collaborations.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastRequestAt = 0;
async function throttleSpotify() {
  const now = Date.now();
  const waitFor = lastRequestAt + SPOTIFY_MIN_INTERVAL_MS - now;
  if (waitFor > 0) {
    const jitter = Math.floor(Math.random() * 60);
    await sleep(waitFor + jitter);
  }
  lastRequestAt = Date.now();
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
    await throttleSpotify();
    res = await fetchWithTimeout(url, options, 30000);
  } catch (error) {
    console.log(`  ⚠️  요청 실패: ${error.message}`);
    throw error;
  }

  // Rate limit 처리
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") || "1");
    if (retry >= SPOTIFY_MAX_RETRIES) {
      throw new Error(`Rate limit exceeded after ${retry} retries`);
    }
    const backoff = Math.min(15000, (retry + 1) * 800);
    const waitMs = Math.max(retryAfter * 1000, backoff);
    console.log(`  ⏳ Rate limit - ${Math.round(waitMs)}ms 대기 후 재시도 (${retry + 1}/${SPOTIFY_MAX_RETRIES})`);
    await sleep(waitMs + Math.floor(Math.random() * 200));
    return fetchJson(url, options, retry + 1);
  }

  // 서버 에러 재시도
  if (res.status >= 500 && retry < SPOTIFY_MAX_RETRIES) {
    console.log(`  🔄 서버 에러 (${res.status}) - 재시도 ${retry + 1}/${SPOTIFY_MAX_RETRIES}`);
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

async function getAlbumTracks(token, albumId) {
  const url = `https://api.spotify.com/v1/albums/${albumId}`;
  return fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function main() {
  console.log('\n🤝 협업 아티스트 정보 수집 시작\n');
  console.log('='.repeat(60));

  // 1. v0.json 로드
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ ${INPUT_FILE} 파일이 없습니다!`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const albums = data.albums || [];
  
  console.log(`📥 앨범 데이터 로드: ${albums.length}개`);

  // 2. 토큰 발급
  console.log('🔐 Spotify 토큰 발급 중...');
  const token = await getAccessToken();
  console.log('✅ 토큰 발급 완료\n');

  // 3. 기존 데이터 로드 (있으면)
  let existingData = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      existingData = existing.albums || {};
      console.log(`📂 기존 협업 데이터: ${Object.keys(existingData).length}개 앨범\n`);
    } catch (e) {
      console.warn('⚠️  기존 파일 로드 실패, 새로 시작\n');
    }
  }

  // 4. 앨범별 협업 아티스트 수집
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalCollaborations = 0;

  for (let i = 0; i < albums.length; i++) {
    const album = albums[i];
    const albumId = album.spotify?.albumId;
    
    if (!albumId) {
      console.log(`  ⏭️  [${i + 1}/${albums.length}] 앨범 ID 없음, 스킵`);
      skipped++;
      continue;
    }

    // 이미 처리한 앨범
    if (existingData[albumId]) {
      if (i % 100 === 0) {
        console.log(`  ⏭️  [${i + 1}/${albums.length}] 이미 처리됨`);
      }
      skipped++;
      continue;
    }

    console.log(`\n[${i + 1}/${albums.length}] 처리 중: ${album.title} - ${album.artistName}`);

    try {
      const albumData = await getAlbumTracks(token, albumId);
      
      // 앨범 레벨 아티스트 (메인)
      const albumArtists = albumData.artists || [];
      const mainArtistIds = albumArtists.map(a => a.id);

      // 트랙별 아티스트 수집
      const tracks = albumData.tracks?.items || [];
      const collaboratorIds = new Set();

      for (const track of tracks) {
        const trackArtists = track.artists || [];
        for (const artist of trackArtists) {
          // 메인 아티스트가 아닌 경우만 (피처링)
          if (!mainArtistIds.includes(artist.id)) {
            collaboratorIds.add(artist.id);
          }
        }
      }

      // 결과 저장
      existingData[albumId] = {
        album_id: `spotify:album:${albumId}`,
        main_artists: albumArtists.map(a => ({
          id: a.id,
          name: a.name,
          role: 'main'
        })),
        featured_artists: Array.from(collaboratorIds).map(id => {
          // 아티스트 이름 찾기
          const track = tracks.find(t => t.artists?.some(a => a.id === id));
          const artist = track?.artists?.find(a => a.id === id);
          return {
            id: id,
            name: artist?.name || 'Unknown',
            role: 'featured'
          };
        }),
        total_tracks: tracks.length,
        fetched_at: new Date().toISOString()
      };

      processed++;
      totalCollaborations += collaboratorIds.size;

      console.log(`  ✅ 메인: ${albumArtists.length}명, 피처링: ${collaboratorIds.size}명`);

    } catch (error) {
      console.error(`  ❌ 실패: ${error.message}`);
      failed++;
    }

    // Rate limit 방지
    await sleep(SPOTIFY_BATCH_DELAY_MS);

    // 진행상황 저장 (100개마다)
    if ((i + 1) % 100 === 0) {
      fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          totalAlbums: Object.keys(existingData).length,
          albums: existingData
        }, null, 2),
        'utf-8'
      );
      console.log(`  💾 중간 저장 완료 (${Object.keys(existingData).length}개 앨범)`);
    }
  }

  // 5. 최종 저장
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalAlbums: Object.keys(existingData).length,
      albums: existingData
    }, null, 2),
    'utf-8'
  );

  console.log('\n' + '='.repeat(60));
  console.log('✅ 협업 아티스트 정보 수집 완료!');
  console.log('='.repeat(60));
  console.log(`📊 통계:`);
  console.log(`   • 총 앨범: ${albums.length}개`);
  console.log(`   • 새로 처리: ${processed}개`);
  console.log(`   • 이미 존재: ${skipped}개`);
  console.log(`   • 실패: ${failed}개`);
  console.log(`   • 발견된 협업: ${totalCollaborations}명`);
  console.log(`\n💾 저장 위치: ${OUTPUT_FILE}`);
}

main().catch(error => {
  console.error('\n❌ 에러 발생:', error);
  process.exit(1);
});
