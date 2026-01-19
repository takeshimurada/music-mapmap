/**
 * Step 2.5: Genre Enrichment (MusicBrainz 1st + Discogs 2nd)
 * 
 * Input: ./out/albums_spotify_v1.json
 * Output: ./out/albums_spotify_v4.json
 * 
 * Purpose:
 * - Spotify에서 장르 정보가 없는 앨범의 genre를 보강
 * - MusicBrainz (artist genres) 우선 → Discogs (release styles/genres) fallback
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN || null;
const MB_RATE_LIMIT_MS = 1000; // MusicBrainz: 1 req/sec
const DISCOGS_RATE_LIMIT_MS = 1100; // Discogs: ~1 req/sec (safe)

const INPUT_FILE = './out/albums_spotify_v1.json';
const OUTPUT_FILE = './out/albums_spotify_v2.json';

// 캐시
const mbCache = new Map();
const discogsCache = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// MusicBrainz: artist search
async function fetchMusicBrainzArtist(artistName) {
  try {
    const query = encodeURIComponent(`artist:"${artistName}"`);
    const url = `https://musicbrainz.org/ws/2/artist?query=${query}&fmt=json&limit=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MusicMapApp/1.0 (contact@example.com)' }
    });
    
    if (!response.ok) {
      return { genres: [], tags: [] };
    }
    
    const data = await response.json();
    if (!data.artists || data.artists.length === 0) {
      return { genres: [], tags: [] };
    }
    
    const artist = data.artists[0];
    const tags = artist.tags || [];
    const genres = tags.map(t => t.name).slice(0, 3); // Top 3 tags
    
    return { genres, tags };
  } catch (error) {
    console.error(`❌ MusicBrainz error for ${artistName}:`, error.message);
    return { genres: [], tags: [] };
  }
}

// Discogs: release search
async function fetchDiscogsRelease(artistName, albumTitle, token) {
  try {
    const query = encodeURIComponent(`${artistName} ${albumTitle}`);
    const url = `https://api.discogs.com/database/search?q=${query}&type=release&token=${token}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MusicMapApp/1.0' }
    });
    
    if (!response.ok) {
      return { genres: [], styles: [] };
    }
    
    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return { genres: [], styles: [] };
    }
    
    const release = data.results[0];
    const genres = release.genre || [];
    const styles = release.style || [];
    
    return { genres, styles };
  } catch (error) {
    console.error(`❌ Discogs error for ${artistName} - ${albumTitle}:`, error.message);
    return { genres: [], styles: [] };
  }
}

function updateAlbumGenre(album, genres, source) {
  if (genres.length === 0) {
    return;
  }
  
  album.primaryGenre = genres[0];
  album.artistGenres = genres;
  album.genreSource = source;
  
  // genreFamily도 업데이트 (normalize 로직 재사용)
  const GENRE_FAMILY_MAP = {
    // Pop
    'pop': 'Pop', 'k-pop': 'K-pop/Asia Pop', 'j-pop': 'K-pop/Asia Pop', 'dance pop': 'Pop',
    'synth-pop': 'Pop', 'electropop': 'Pop', 'indie pop': 'Pop',
    // Rock
    'rock': 'Rock', 'hard rock': 'Rock', 'classic rock': 'Rock', 'punk': 'Rock',
    'alternative rock': 'Alternative/Indie', 'indie rock': 'Alternative/Indie',
    'garage rock': 'Rock', 'punk rock': 'Rock',
    // Hip Hop
    'hip hop': 'Hip Hop', 'hip-hop': 'Hip Hop', 'rap': 'Hip Hop', 'trap': 'Hip Hop',
    // Electronic
    'electronic': 'Electronic', 'house': 'Electronic', 'techno': 'Electronic',
    'edm': 'Electronic', 'dubstep': 'Electronic', 'trance': 'Electronic',
    // Jazz
    'jazz': 'Jazz', 'blues': 'Jazz', 'soul': 'R&B/Soul', 'funk': 'R&B/Soul',
    // R&B
    'r&b': 'R&B/Soul', 'rnb': 'R&B/Soul', 'rhythm and blues': 'R&B/Soul',
    // Metal
    'metal': 'Metal', 'heavy metal': 'Metal', 'death metal': 'Metal',
    // Folk/World
    'folk': 'Folk/World', 'country': 'Folk/World', 'world': 'Folk/World',
    // Classical
    'classical': 'Classical', 'opera': 'Classical', 'baroque': 'Classical',
    // Latin
    'latin': 'Latin', 'reggaeton': 'Latin', 'salsa': 'Latin',
    // Alternative/Indie
    'alternative': 'Alternative/Indie', 'indie': 'Alternative/Indie',
    // Unknown
    'unknown': 'Unknown'
  };
  
  const primaryGenreLower = (genres[0] || '').toLowerCase();
  let genreFamily = 'Unknown';
  
  for (const [key, family] of Object.entries(GENRE_FAMILY_MAP)) {
    if (primaryGenreLower.includes(key)) {
      genreFamily = family;
      break;
    }
  }
  
  album.genreFamily = genreFamily;
  album.genreFamilyConfidence = genreFamily === 'Unknown' ? 0 : 0.7; // External source confidence
}

async function enrichGenre() {
  console.log('📀 Step 2.5: Genre Enrichment');
  console.log(`📥 Input: ${INPUT_FILE}`);
  console.log(`📤 Output: ${OUTPUT_FILE}`);
  
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ File not found: ${INPUT_FILE}`);
    console.error('💡 Run: npm run step2:normalize first');
    process.exit(1);
  }
  
  const input = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const albums = input.albums || [];
  
  console.log(`\n📊 Total albums: ${albums.length}`);
  
  // 장르 정보가 없는 앨범 필터링
  const needEnrichment = albums.filter(a => 
    !a.primaryGenre || 
    !a.artistGenres || 
    a.artistGenres.length === 0 ||
    a.genreFamily === 'Unknown'
  );
  
  console.log(`🔍 Albums needing genre enrichment: ${needEnrichment.length}`);
  
  if (needEnrichment.length === 0) {
    console.log('✅ No albums need genre enrichment!');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(input, null, 2));
    return;
  }
  
  let mbSuccessCount = 0;
  let discogsSuccessCount = 0;
  let unknownCount = 0;
  let enrichedCount = 0;
  
  for (let i = 0; i < needEnrichment.length; i++) {
    const album = needEnrichment[i];
    const artistName = album.artistName;
    
    if ((i + 1) % 10 === 0) {
      console.log(`\n[${i + 1}/${needEnrichment.length}] Processed...`);
    }
    
    // 1. MusicBrainz 시도
    let mbResult = mbCache.get(artistName);
    if (!mbResult) {
      mbResult = await fetchMusicBrainzArtist(artistName);
      mbCache.set(artistName, mbResult);
      await sleep(MB_RATE_LIMIT_MS);
    }
    
    if (mbResult.genres && mbResult.genres.length > 0) {
      updateAlbumGenre(album, mbResult.genres, 'musicbrainz');
      mbSuccessCount++;
      enrichedCount++;
      continue;
    }
    
    // 2. Discogs 시도 (token 있을 때만)
    if (DISCOGS_TOKEN) {
      let discogsResult = discogsCache.get(`${artistName}||${album.title}`);
      if (!discogsResult) {
        discogsResult = await fetchDiscogsRelease(artistName, album.title, DISCOGS_TOKEN);
        discogsCache.set(`${artistName}||${album.title}`, discogsResult);
        await sleep(DISCOGS_RATE_LIMIT_MS);
      }
      
      const allGenres = [...(discogsResult.genres || []), ...(discogsResult.styles || [])];
      if (allGenres.length > 0) {
        updateAlbumGenre(album, allGenres, 'discogs');
        discogsSuccessCount++;
        enrichedCount++;
        continue;
      }
    }
    
    // 3. 실패 - Unknown 유지
    album.genreSource = 'unknown';
    unknownCount++;
  }
  
  // Output 저장
  const output = {
    ...input,
    version: 'v2',
    sourceFile: INPUT_FILE,
    genreEnrichedAt: new Date().toISOString(),
    genreEnrichmentStats: {
      totalAlbums: albums.length,
      enriched: enrichedCount,
      musicbrainz: mbSuccessCount,
      discogs: discogsSuccessCount,
      unknown: unknownCount,
      discogsSkipped: !DISCOGS_TOKEN
    }
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  console.log('\n✅ Genre enrichment complete!');
  console.log(`📤 Saved: ${OUTPUT_FILE}`);
  console.log(`\n📊 Results:`);
  console.log(`   Total albums: ${albums.length}`);
  console.log(`   Enriched: ${enrichedCount}/${needEnrichment.length}`);
  console.log(`   - MusicBrainz: ${mbSuccessCount}`);
  console.log(`   - Discogs: ${discogsSuccessCount}`);
  console.log(`   - Unknown: ${unknownCount}`);
  console.log(`   Discogs skipped: ${!DISCOGS_TOKEN}`);
}

enrichGenre();
