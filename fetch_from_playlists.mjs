import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const TARGET_ALBUMS = Number(process.env.TARGET_ALBUMS || "1500");

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

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") || "1");
    console.warn(`⏳ Rate limited. Waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return fetchJson(url, options);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

async function getAccessToken() {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials" });
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

// Spotify Featured Playlists API
async function getFeaturedPlaylists(token, offset = 0) {
  const url = `https://api.spotify.com/v1/browse/featured-playlists?limit=50&offset=${offset}`;
  try {
    const data = await fetchJson(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.playlists?.items || [];
  } catch (e) {
    console.warn(`⚠️ Failed to get featured playlists`);
    return [];
  }
}

// New Releases API로 최신 앨범 직접 가져오기
async function getNewReleases(token, offset = 0) {
  const url = `https://api.spotify.com/v1/browse/new-releases?limit=50&offset=${offset}`;
  try {
    const data = await fetchJson(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.albums?.items || [];
  } catch (e) {
    console.warn(`⚠️ Failed to get new releases`);
    return [];
  }
}

// 플레이리스트의 트랙 가져오기
async function getPlaylistTracks(token, playlistId) {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  try {
    const data = await fetchJson(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.items || [];
  } catch (e) {
    console.warn(`⚠️ Failed to get tracks for playlist ${playlistId}`);
    return [];
  }
}

// 아티스트 정보 가져오기
async function getArtist(token, artistId) {
  const url = `https://api.spotify.com/v1/artists/${artistId}`;
  return fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
}

function normalizeAlbum(album, artist) {
  const releaseDate = album.release_date || null;
  const year = releaseDate ? Number(String(releaseDate).slice(0, 4)) : null;
  const primaryGenre =
    Array.isArray(artist?.genres) && artist.genres.length > 0
      ? artist.genres[0]
      : null;

  return {
    albumId: `spotify:album:${album.id}`,
    source: "spotify",
    spotify: {
      albumId: album.id,
      artistId: artist?.id || album.artists?.[0]?.id || null,
      uri: album.uri || null,
      href: album.href || null,
    },
    title: album.name || null,
    artistName: artist?.name || album.artists?.[0]?.name || null,
    releaseDate,
    year,
    primaryGenre,
    artistGenres: artist?.genres || [],
    popularity: artist?.popularity ?? null,
    artworkUrl: album.images?.[0]?.url || null,
    totalTracks: album.total_tracks ?? null,
    label: album.label ?? null,
  };
}

async function main() {
  const token = await getAccessToken();
  
  const seenAlbumIds = new Set();
  let out = [];

  // 기존 v0 파일 로드 (append 모드)
  if (fs.existsSync(OUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUT_FILE, "utf-8"));
      out = existing.albums || [];
      out.forEach((album) => {
        const albumId =
          album.spotify?.albumId ||
          album.albumId?.replace("spotify:album:", "");
        if (albumId) seenAlbumIds.add(albumId);
      });
      console.log(`📥 Loaded existing ${out.length} albums from ${OUT_FILE}`);
    } catch (e) {
      console.warn("⚠️ Failed to load existing file, starting fresh");
    }
  }

  console.log(`🎯 Target: ${TARGET_ALBUMS} albums`);
  
  // 1️⃣ New Releases로 최신 앨범 수집
  console.log(`\n📀 Fetching new releases...`);
  for (let offset = 0; offset < 200; offset += 50) {
    if (out.length >= TARGET_ALBUMS) break;
    
    const newReleases = await getNewReleases(token, offset);
    console.log(`   Found ${newReleases.length} new releases (offset=${offset})`);
    
    for (const album of newReleases) {
      if (out.length >= TARGET_ALBUMS) break;
      if (!album || !album.id) continue;
      if (seenAlbumIds.has(album.id)) continue;

      const artistName = album.artists?.[0]?.name;
      if (artistName && artistName.toLowerCase().includes("various artists")) {
        continue;
      }

      const artistId = album.artists?.[0]?.id;
      if (!artistId) continue;

      let artist;
      try {
        artist = await getArtist(token, artistId);
        await sleep(100);
      } catch (e) {
        continue;
      }

      if (!artist || !artist.genres || artist.genres.length === 0) {
        continue; // 장르 정보 없으면 스킵
      }

      const norm = normalizeAlbum(album, artist);
      out.push(norm);
      seenAlbumIds.add(album.id);

      if (out.length % 20 === 0) {
        console.log(`      ✅ Total: ${out.length}`);
      }
    }
    
    await sleep(1000);
  }

  // 2️⃣ Featured Playlists에서 추가 수집
  console.log(`\n🎵 Fetching featured playlists...`);
  let processedPlaylists = 0;
  
  for (let offset = 0; offset < 100; offset += 50) {
    if (out.length >= TARGET_ALBUMS) break;
    
    const playlists = await getFeaturedPlaylists(token, offset);
    console.log(`   Found ${playlists.length} playlists (offset=${offset})`);

    for (const playlist of playlists) {
      if (out.length >= TARGET_ALBUMS) break;

      console.log(`   🎼 Playlist: ${playlist.name}`);
      processedPlaylists++;

      const tracks = await getPlaylistTracks(token, playlist.id);
      
      for (const item of tracks) {
        if (out.length >= TARGET_ALBUMS) break;

        const track = item.track;
        if (!track || !track.album || !track.album.id) continue;

        const album = track.album;
        if (seenAlbumIds.has(album.id)) continue;

        const artistName = album.artists?.[0]?.name;
        if (artistName && artistName.toLowerCase().includes("various artists")) {
          continue;
        }

        const artistId = album.artists?.[0]?.id;
        if (!artistId) continue;

        let artist;
        try {
          artist = await getArtist(token, artistId);
          await sleep(100);
        } catch (e) {
          continue;
        }

        if (!artist) continue;

        const releaseYear = album.release_date
          ? Number(String(album.release_date).slice(0, 4))
          : null;
        const minPopularity =
          releaseYear && releaseYear <= 1985
            ? 15
            : releaseYear && releaseYear <= 1995
            ? 25
            : 30;

        if (artist.popularity && artist.popularity < minPopularity) {
          continue;
        }

        const norm = normalizeAlbum(album, artist);
        out.push(norm);
        seenAlbumIds.add(album.id);

        if (out.length % 20 === 0) {
          console.log(`      ✅ Total: ${out.length}`);
        }
      }

      await sleep(500);
    }
    
    await sleep(1000);
  }

  // 저장
  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        market: "from_playlists",
        count: out.length,
        albums: out,
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log(`\n✅ Saved: ${OUT_FILE}`);
  console.log(`📊 Total albums: ${out.length}`);
  console.log(`🎼 Processed playlists: ${processedPlaylists}`);

  const withGenre = out.filter((a) => a.primaryGenre).length;
  const withYear = out.filter((a) => a.year).length;
  console.log(`📁 With primaryGenre: ${withGenre}/${out.length}`);
  console.log(`📅 With year: ${withYear}/${out.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
