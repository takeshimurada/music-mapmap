import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const MARKET = process.env.SPOTIFY_MARKET || ""; // 시장 제한 제거 (글로벌 검색)
const TARGET_ALBUMS = Number(process.env.TARGET_ALBUMS || "1500"); // 목표 수량

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env");
  process.exit(1);
}

const OUT_DIR = path.resolve("./out");
const OUT_FILE = path.join(OUT_DIR, "albums_spotify_v0.json");
fs.mkdirSync(OUT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, options = {}, retry = 0) {
  const res = await fetch(url, options);

  // basic rate limit handling
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") || "1");
    await sleep((retryAfter + 0.2) * 1000);
    return fetchJson(url, options, retry);
  }

  // retry on transient errors
  if (res.status >= 500 && retry < 3) {
    await sleep((retry + 1) * 400);
    return fetchJson(url, options, retry + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${text.slice(0, 300)}`);
  }

  return res.json();
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
  
  // 🎯 다양한 연도와 태그 조합으로 광범위하게 수집
  
  // 1970-1979: 매 년도별
  for (let y = 1970; y <= 1979; y++) {
    queries.push(`year:${y}`);
  }
  
  // 1980-1989: 매 년도별
  for (let y = 1980; y <= 1989; y++) {
    queries.push(`year:${y}`);
  }
  
  // 1990-2000: 2년 단위
  for (let y = 1990; y <= 2000; y += 2) {
    queries.push(`year:${y}-${Math.min(y+1, 2000)}`);
  }
  
  // 2001-2010: 2년 단위
  for (let y = 2001; y <= 2010; y += 2) {
    queries.push(`year:${y}-${Math.min(y+1, 2010)}`);
  }
  
  // 2011-2020: 2년 단위
  for (let y = 2011; y <= 2020; y += 2) {
    queries.push(`year:${y}-${Math.min(y+1, 2020)}`);
  }
  
  // 추가: tag 기반 검색 (다양성 확보)
  const tags = ["hipster", "new"];
  for (let y = 1970; y <= 2020; y += 10) {
    for (const tag of tags) {
      queries.push(`year:${y}-${Math.min(y+9, 2020)} tag:${tag}`);
    }
  }

  return queries;
}

async function main() {
  const token = await getAccessToken();

  const seenAlbumIds = new Set();
  let out = [];

  // 🔄 기존 v0 파일이 있으면 로드 (append 모드)
  if (fs.existsSync(OUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8'));
      out = existing.albums || [];
      out.forEach(album => {
        const albumId = album.spotify?.albumId || album.albumId?.replace('spotify:album:', '');
        if (albumId) seenAlbumIds.add(albumId);
      });
      console.log(`📥 Loaded existing ${out.length} albums from ${OUT_FILE}`);
    } catch (e) {
      console.warn('⚠️ Failed to load existing file, starting fresh');
    }
  }

  const queries = buildQueries();

  console.log(`Market=${MARKET}, target=${TARGET_ALBUMS}, queries=${queries.length}, existing=${out.length}`);

  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];

    // 각 쿼리에서 offset을 조금씩만 훑어도 꽤 모임
    // (Spotify search는 offset 최대 1000 제한도 있고 품질이 변동이라, "많은 쿼리 + 얕은 스캔"이 안정적)
    for (let offset = 0; offset <= 400; offset += 50) {
      if (out.length >= TARGET_ALBUMS) break;

      let json;
      try {
        json = await searchAlbums(token, q, offset);
      } catch (e) {
        console.warn(`Search failed q="${q}" offset=${offset}: ${e.message}`);
        continue;
      }

      const items = json?.albums?.items || [];
      if (items.length === 0) break;

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

        let artist;
        try {
          artist = await getArtist(token, artistId);
        } catch (e) {
          // artist fetch 실패 시 스킵
          continue;
        }

        // ⭐ 인기도 필터 (오래된 클래식은 더 관대하게)
        if (!artist) {
          continue;
        }
        
        const releaseYear = album.release_date ? Number(String(album.release_date).slice(0, 4)) : null;
        // 다양성을 위해 인기도 필터를 더 완화
        const minPopularity = (releaseYear && releaseYear <= 1985) ? 20 : 
                              (releaseYear && releaseYear <= 1995) ? 30 : 35;
        
        if (artist.popularity && artist.popularity < minPopularity) {
          continue;
        }
        
        const norm = normalizeAlbum(album, artist);
        out.push(norm);
        seenAlbumIds.add(album.id);
      }

      console.log(
        `[${qi + 1}/${queries.length}] q="${q}" offset=${offset} -> total=${out.length}`
      );

      // polite delay
      await sleep(120);
    }

    if (out.length >= TARGET_ALBUMS) break;
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), market: MARKET, count: out.length, albums: out }, null, 2), "utf-8");
  console.log(`\nSaved: ${OUT_FILE}`);
  console.log(`Count: ${out.length}`);

  // quick sanity checks
  const withGenre = out.filter((a) => a.primaryGenre).length;
  const withYear = out.filter((a) => a.year).length;
  console.log(`With primaryGenre: ${withGenre}/${out.length}`);
  console.log(`With year: ${withYear}/${out.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
