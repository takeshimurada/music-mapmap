import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const MARKET = process.env.SPOTIFY_MARKET || ""; // 시장 제한 제거 (글로벌 검색)
const TARGET_ALBUMS = Number(process.env.TARGET_ALBUMS || "1000"); // 목표 수량
const SPOTIFY_MIN_INTERVAL_MS = Number(process.env.SPOTIFY_MIN_INTERVAL_MS || "200");
const SPOTIFY_MAX_RETRIES = Number(process.env.SPOTIFY_MAX_RETRIES || "6");
const SPOTIFY_ARTIST_BATCH_SIZE = Number(process.env.SPOTIFY_ARTIST_BATCH_SIZE || "50");
const SPOTIFY_BATCH_DELAY_MS = Number(process.env.SPOTIFY_BATCH_DELAY_MS || "200");
const SPOTIFY_SEED_OFFSET_MAX = Number(process.env.SPOTIFY_SEED_OFFSET_MAX || "50");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env");
  process.exit(1);
}

const OUT_DIR = path.resolve("./out");
const OUT_FILE = path.join(OUT_DIR, "albums_spotify_v0.json");
const SEED_FILE = path.resolve("./scripts/fetch/award_seeds.json");
fs.mkdirSync(OUT_DIR, { recursive: true });

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

// 타임아웃이 있는 fetch wrapper
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
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  }
}

async function fetchJson(url, options = {}, retry = 0) {
  console.log(`  🔍 API 호출: ${url.substring(0, 80)}...`);
  
  let res;
  try {
    await throttleSpotify();
    res = await fetchWithTimeout(url, options, 30000); // 30초 타임아웃
  } catch (error) {
    console.log(`  ⚠️  요청 실패: ${error.message}`);
    throw error;
  }

  // basic rate limit handling
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

  // retry on transient errors
  if (res.status >= 500 && retry < SPOTIFY_MAX_RETRIES) {
    console.log(`  🔄 서버 에러 (${res.status}) - 재시도 ${retry + 1}/${SPOTIFY_MAX_RETRIES}`);
    await sleep((retry + 1) * 400);
    return fetchJson(url, options, retry + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  console.log(`  ✅ 응답 성공`);
  return json;
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

// Spotify search max limit=50
async function searchAlbums(token, q, offset) {
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", q);
  url.searchParams.set("type", "album");
  if (MARKET) {
    url.searchParams.set("market", MARKET); // 시장 설정이 있을 때만 사용
  }
  url.searchParams.set("limit", "50");
  url.searchParams.set("offset", String(offset));

  return fetchJson(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// fetch artist details to get genres
async function getArtist(token, artistId) {
  const url = `https://api.spotify.com/v1/artists/${artistId}`;
  return fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function getArtistsBatch(token, artistIds) {
  if (!artistIds.length) return [];
  const batchSize = Math.max(1, Math.min(50, SPOTIFY_ARTIST_BATCH_SIZE));
  const chunks = chunkArray(artistIds, batchSize);
  const results = [];
  for (const chunk of chunks) {
    const url = `https://api.spotify.com/v1/artists?ids=${chunk.join(",")}`;
    const json = await fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
    if (json?.artists) {
      results.push(...json.artists.filter(Boolean));
    }
    await sleep(SPOTIFY_BATCH_DELAY_MS);
  }
  return results;
}

function normalizeAlbum(rawAlbum, artist) {
  const releaseDate = rawAlbum.release_date || null;
  const year = releaseDate ? Number(String(releaseDate).slice(0, 4)) : null;

  const primaryGenre =
    Array.isArray(artist?.genres) && artist.genres.length > 0 ? artist.genres[0] : null;

  return {
    // internal ids: stable + future-proof
    albumId: `spotify:album:${rawAlbum.id}`,
    source: "spotify",
    spotify: {
      albumId: rawAlbum.id,
      artistId: artist?.id || rawAlbum.artists?.[0]?.id || null,
      uri: rawAlbum.uri || null,
      href: rawAlbum.href || null,
    },

    title: rawAlbum.name || null,
    artistName: artist?.name || rawAlbum.artists?.[0]?.name || null,
    releaseDate,
    year,
    primaryGenre, // v0: top genre from artist
    artistGenres: artist?.genres || [],
    popularity: artist?.popularity ?? null, // NOTE: album popularity isn't directly provided; we use artist popularity v0
    artworkUrl: rawAlbum.images?.[0]?.url || null,
    totalTracks: rawAlbum.total_tracks ?? null,
    label: rawAlbum.label ?? null, // often missing in search payload; keep null
  };
}

function buildQueries() {
  const queries = [];
  
  // 🎯 1955-1970: 클래식 명반 시대 (매 년도별 세밀 수집)
  
  
  // 2011~2020년
  for (let y = 2023; y <= 2026; y++) {
    queries.push(`year:${y}`);
  }

  return queries;
}

function loadSeeds() {
  if (!fs.existsSync(SEED_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(SEED_FILE, "utf-8"));
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.seeds)) return raw.seeds;
  } catch (e) {
    console.warn("Warning: failed to parse award_seeds.json; skipping seeds");
  }
  return [];
}

async function main() {
  console.log('\n🎵 Spotify 앨범 수집 시작\n');
  
  console.log('🔐 토큰 발급 중...');
  const token = await getAccessToken();
  console.log('✅ 토큰 발급 완료\n');

  const seenAlbumIds = new Set();
  const artistCache = new Map(); // 🎯 아티스트 캐싱
  let out = [];
  let apiCallsSaved = 0; // 캐시로 절약된 API 호출 수

  // 🔄 기존 v0 파일이 있으면 로드 (append 모드)
  if (fs.existsSync(OUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8'));
      out = existing.albums || [];
      out.forEach(album => {
        const albumId = album.spotify?.albumId || album.albumId?.replace('spotify:album:', '');
        if (albumId) seenAlbumIds.add(albumId);
      });
      console.log(`📥 기존 파일에서 ${out.length}개 앨범 로드\n`);
    } catch (e) {
      console.warn('⚠️  기존 파일 로드 실패, 새로 시작\n');
    }
  }

  const queries = buildQueries();
  const seeds = loadSeeds();
  const seedStart = Number(process.env.SPOTIFY_SEED_START || "0");
  const seedLimit = Number(process.env.SPOTIFY_SEED_LIMIT || "0");
  const seedSlice = seedLimit > 0 ? seeds.slice(seedStart, seedStart + seedLimit) : seeds.slice(seedStart);
  const seedCount = seedSlice.length;

  console.log(`📊 수집 설정`);
  console.log(`   Market: ${MARKET || 'Global'}`);
  console.log(`   Target: ${TARGET_ALBUMS}개`);
  console.log(`   Queries: ${queries.length}개`);
  console.log(`   Seeds: ${seedCount}${seedStart || seedLimit ? ` (start=${seedStart}, limit=${seedLimit || "all"})` : ""}`);
  console.log(`   기존 앨범: ${out.length}개`);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  if (seedSlice.length > 0) {
    console.log(`
Seed pass (award_seeds.json)`);
    for (let si = 0; si < seedSlice.length; si++) {
      const seed = seedSlice[si];
      const q = seed?.query;
      if (!q || typeof q !== "string") continue;
      console.log(`
[Seed ${si + 1}/${seedSlice.length}] "${q}"`);

      for (let offset = 0; offset <= SPOTIFY_SEED_OFFSET_MAX; offset += 50) {
        if (out.length >= TARGET_ALBUMS) {
          console.log(`  Target reached (${out.length})`);
          break;
        }

        console.log(`  offset=${offset} searching...`);
        let json;
        try {
          json = await searchAlbums(token, q, offset);
        } catch (e) {
          console.warn(`  Seed search failed: ${e.message}`);
          continue;
        }

        const items = json?.albums?.items || [];
        const newArtistIds = [];
        for (const album of items) {
          const artistId = album.artists?.[0]?.id;
          if (artistId && !artistCache.has(artistId)) {
            newArtistIds.push(artistId);
          }
        }
        if (newArtistIds.length > 0) {
          const uniqueArtistIds = Array.from(new Set(newArtistIds));
          const artists = await getArtistsBatch(token, uniqueArtistIds);
          for (const artist of artists) {
            if (artist?.id) {
              artistCache.set(artist.id, artist);
            }
          }
        }

        if (items.length === 0) {
          console.log(`  No results for seed; moving on`);
          break;
        }

        let addedCount = 0;
        for (const album of items) {
          if (out.length >= TARGET_ALBUMS) break;
          if (!album?.id) continue;
          if (seenAlbumIds.has(album.id)) continue;

          const artistId = album.artists?.[0]?.id;
          const artistName = album.artists?.[0]?.name;
          if (!artistId) continue;
          if (artistName && artistName.toLowerCase().includes('various artists')) {
            continue;
          }

          let artist;
          if (artistCache.has(artistId)) {
            artist = artistCache.get(artistId);
            apiCallsSaved++;
          } else {
            try {
              artist = await getArtist(token, artistId);
              artistCache.set(artistId, artist);
            } catch (e) {
              continue;
            }
          }

          if (!artist) continue;
          const norm = normalizeAlbum(album, artist);
          out.push(norm);
          seenAlbumIds.add(album.id);
          addedCount++;
        }

        console.log(`  +${addedCount} added | total ${out.length} | cache saved ${apiCallsSaved}`);
        await sleep(300);
      }

      if (out.length >= TARGET_ALBUMS) break;
    }
  }

  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    console.log(`\n[쿼리 ${qi + 1}/${queries.length}] "${q}"`);

    // 인기도 높은 앨범 위주로 수집 (상위권만)
    for (let offset = 0; offset <= 100; offset += 50) {
      if (out.length >= TARGET_ALBUMS) {
        console.log(`  🎯 목표 달성! (${out.length}개)`);
        break;
      }

      console.log(`  📖 offset=${offset} 검색 중...`);
      
      let json;
      try {
        json = await searchAlbums(token, q, offset);
      } catch (e) {
        console.warn(`  ❌ 검색 실패: ${e.message}`);
        continue;
      }

      const items = json?.albums?.items || [];
      const newArtistIds = [];
      for (const album of items) {
        const artistId = album.artists?.[0]?.id;
        if (artistId && !artistCache.has(artistId)) {
          newArtistIds.push(artistId);
        }
      }
      if (newArtistIds.length > 0) {
        const uniqueArtistIds = Array.from(new Set(newArtistIds));
        const artists = await getArtistsBatch(token, uniqueArtistIds);
        for (const artist of artists) {
          if (artist?.id) {
            artistCache.set(artist.id, artist);
          }
        }
      }
      console.log(`  📦 검색 결과: ${items.length}개 앨범`);
      
      if (items.length === 0) {
        console.log(`  ⚠️  결과 없음 - 다음 쿼리로`);
        break;
      }

      let addedCount = 0;
      for (const album of items) {
        if (out.length >= TARGET_ALBUMS) break;
        if (!album?.id) continue;
        if (seenAlbumIds.has(album.id)) continue;

        // get primary artist
        const artistId = album.artists?.[0]?.id;
        const artistName = album.artists?.[0]?.name;
        if (!artistId) continue;
        
        // ⭐ Various Artists 제외
        if (artistName && artistName.toLowerCase().includes('various artists')) {
          continue;
        }

        // 🎯 아티스트 캐싱: 이미 조회한 아티스트는 재사용
        let artist;
        if (artistCache.has(artistId)) {
          artist = artistCache.get(artistId);
          apiCallsSaved++;
        } else {
          try {
            artist = await getArtist(token, artistId);
            artistCache.set(artistId, artist); // 캐시에 저장
          } catch (e) {
            // artist fetch 실패 시 스킵
            continue;
          }
        }

        // ⭐ 인기도 필터 (오래된 클래식은 더 관대하게)
        if (!artist) {
          continue;
        }
        
        const releaseYear = album.release_date ? Number(String(album.release_date).slice(0, 4)) : null;
        // 1955-1970 클래식 시대: 인기도 필터 완화
        const minPopularity = (releaseYear && releaseYear <= 1970) ? 20 : 
                              (releaseYear && releaseYear <= 1985) ? 28 : 
                              (releaseYear && releaseYear <= 1995) ? 38 : 
                              (releaseYear && releaseYear <= 2005) ? 45 : 50;
        
        if (artist.popularity && artist.popularity < minPopularity) {
          continue;
        }
        
        const norm = normalizeAlbum(album, artist);
        out.push(norm);
        seenAlbumIds.add(album.id);
        addedCount++;
      }

      console.log(`  ✨ ${addedCount}개 추가 → 총 ${out.length}개 수집됨 | 캐시 절약: ${apiCallsSaved}회`);

      // polite delay (rate limit 방지)
      await sleep(300);
    }

    if (out.length >= TARGET_ALBUMS) break;
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), market: MARKET, count: out.length, albums: out }, null, 2), "utf-8");
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n✅ 수집 완료!`);
  console.log(`\n📁 저장 위치: ${OUT_FILE}`);
  console.log(`📊 총 앨범 수: ${out.length}개`);

  // quick sanity checks
  const withGenre = out.filter((a) => a.primaryGenre).length;
  const withYear = out.filter((a) => a.year).length;
  console.log(`\n🎼 데이터 품질:`);
  console.log(`   장르 있음: ${withGenre}/${out.length} (${Math.round(withGenre/out.length*100)}%)`);
  console.log(`   연도 있음: ${withYear}/${out.length} (${Math.round(withYear/out.length*100)}%)`);
  
  // 🎯 캐싱 효율성
  const totalArtists = artistCache.size;
  const totalApiCalls = out.length;
  const cacheEfficiency = totalApiCalls > 0 ? Math.round(apiCallsSaved / totalApiCalls * 100) : 0;
  console.log(`\n⚡ API 효율성:`);
  console.log(`   고유 아티스트: ${totalArtists}명`);
  console.log(`   캐시 절약: ${apiCallsSaved}회 (${cacheEfficiency}% 절감)`);
  
  console.log(`\n🎉 Spotify 데이터 수집 성공!\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
