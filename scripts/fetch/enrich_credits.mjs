/**
 * Phase 3: 앨범 크레딧 정보 수집 (MusicBrainz)
 * 
 * 기능:
 * - MusicBrainz API로 앨범 크레딧 조회
 * - 프로듀서, 작곡가, 엔지니어 등 정보 수집
 * - album_credits.json으로 저장
 * 
 * Usage:
 *   node scripts/fetch/enrich_credits.mjs
 */

import fs from "fs";
import path from "path";

const INPUT_FILE = path.resolve("./out/albums_spotify_v0.json");
const OUTPUT_FILE = path.resolve("./out/album_credits.json");
const TOP_PERCENT = Number(process.env.CREDITS_TOP_PERCENT || "0.3");

const MUSICBRAINZ_API = "https://musicbrainz.org/ws/2";
const USER_AGENT = "MusicMapMap/1.0.0 (https://github.com/yourproject)"; // 실제 프로젝트 URL로 변경

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

async function fetchMusicBrainz(endpoint, params = {}) {
  const url = new URL(`${MUSICBRAINZ_API}/${endpoint}`);
  url.searchParams.set('fmt', 'json');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    }
  });

  if (response.status === 503) {
    // Rate limit - MusicBrainz는 1 req/sec
    console.log('  ⏳ MusicBrainz rate limit - 2초 대기...');
    await sleep(2000);
    return fetchMusicBrainz(endpoint, params);
  }

  if (!response.ok) {
    throw new Error(`MusicBrainz API error: ${response.status}`);
  }

  return await response.json();
}

async function searchRelease(artistName, albumTitle) {
  try {
    // MusicBrainz에서 앨범 검색
    const query = `artist:"${artistName}" AND release:"${albumTitle}"`;
    const data = await fetchMusicBrainz('release', {
      query: query,
      limit: '5'
    });

    if (data.releases && data.releases.length > 0) {
      return data.releases[0]; // 첫 번째 결과 사용
    }
    return null;
  } catch (error) {
    console.log(`  ⚠️  검색 실패: ${error.message}`);
    return null;
  }
}

async function getReleaseCredits(releaseId) {
  try {
    // Release 상세 정보 (relationships 포함)
    const data = await fetchMusicBrainz(`release/${releaseId}`, {
      inc: 'artists+recordings+artist-rels+work-rels'
    });

    const credits = [];

    // Artist relations에서 크레딧 추출
    if (data['artist-credit']) {
      for (const credit of data['artist-credit']) {
        if (credit.artist) {
          // 메인 아티스트는 이미 있으므로 스킵할 수도 있음
          // 여기서는 모두 수집
        }
      }
    }

    // Release relations에서 프로듀서, 엔지니어 등 추출
    if (data.relations) {
      for (const rel of data.relations) {
        if (rel.type && rel.artist) {
          const role = mapMusicBrainzRole(rel.type);
          if (role) {
            credits.push({
              person_name: rel.artist.name,
              role: role,
              source: 'musicbrainz'
            });
          }
        }
      }
    }

    // Recordings (트랙) 레벨에서 크레딧 추출
    if (data.media) {
      for (const medium of data.media) {
        if (medium.tracks) {
          for (const track of medium.tracks) {
            if (track.recording?.relations) {
              for (const rel of track.recording.relations) {
                if (rel.type && rel.artist) {
                  const role = mapMusicBrainzRole(rel.type);
                  if (role) {
                    credits.push({
                      person_name: rel.artist.name,
                      role: role,
                      source: 'musicbrainz'
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    // 중복 제거 (같은 사람, 같은 역할)
    const uniqueCredits = [];
    const seen = new Set();
    for (const credit of credits) {
      const key = `${credit.person_name}:${credit.role}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCredits.push(credit);
      }
    }

    return uniqueCredits;
  } catch (error) {
    console.log(`  ⚠️  크레딧 조회 실패: ${error.message}`);
    return [];
  }
}

function mapMusicBrainzRole(mbRole) {
  // MusicBrainz role을 우리 스키마로 매핑
  const roleMap = {
    'producer': 'producer',
    'audio engineer': 'engineer',
    'mix engineer': 'mixer',
    'mastering engineer': 'mastering',
    'composer': 'composer',
    'lyricist': 'lyricist',
    'arranger': 'arranger',
    'conductor': 'conductor',
    'performer': 'performer',
    'vocal': 'vocalist',
    'instrument': 'musician'
  };

  const lower = mbRole.toLowerCase();
  for (const [key, value] of Object.entries(roleMap)) {
    if (lower.includes(key)) {
      return value;
    }
  }

  return null; // 매핑되지 않는 역할은 제외
}

async function main() {
  console.log('\n🎼 앨범 크레딧 정보 수집 시작 (MusicBrainz)\n');
  console.log('='.repeat(60));
  console.log('⚠️  주의: MusicBrainz는 1 req/sec 제한이 있어 시간이 오래 걸립니다.');
  console.log('   1000개 앨범 기준: 약 30-40분 소요');
  console.log('='.repeat(60) + '\n');

  // 1. v0.json 로드
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ ${INPUT_FILE} 파일이 없습니다!`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const albums = data.albums || [];
  
  console.log(`📥 앨범 데이터 로드: ${albums.length}개`);

  // popularity 상위 n%만 대상으로 축소
  const popularityValues = albums
    .map(a => Number(a.popularity))
    .filter(v => !Number.isNaN(v))
    .sort((a, b) => b - a);
  const cutoffIndex = Math.floor(popularityValues.length * TOP_PERCENT);
  const cutoff = popularityValues[cutoffIndex] ?? 0;
  const targetAlbums = albums.filter(a => (Number(a.popularity) || 0) >= cutoff);
  console.log(`🎯 크레딧 대상: 상위 ${(TOP_PERCENT * 100).toFixed(0)}% (cutoff=${cutoff}) → ${targetAlbums.length}개`);

  // 2. 기존 데이터 로드 (있으면)
  let existingData = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      existingData = existing.albums || {};
      console.log(`📂 기존 크레딧 데이터: ${Object.keys(existingData).length}개 앨범\n`);
    } catch (e) {
      console.warn('⚠️  기존 파일 로드 실패, 새로 시작\n');
    }
  }

  // 3. 앨범별 크레딧 수집
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalCredits = 0;

  for (let i = 0; i < targetAlbums.length; i++) {
    const album = targetAlbums[i];
    const albumId = album.spotify?.albumId || album.albumId;
    
    if (!albumId) {
      skipped++;
      continue;
    }

    // 이미 처리한 앨범
    if (existingData[albumId]) {
      if (i % 100 === 0) {
        console.log(`  ⏭️  [${i + 1}/${targetAlbums.length}] 이미 처리됨`);
      }
      skipped++;
      continue;
    }

    console.log(`\n[${i + 1}/${targetAlbums.length}] 처리 중: ${album.title} - ${album.artistName}`);

    try {
      // MusicBrainz에서 앨범 검색
      const release = await searchRelease(album.artistName, album.title);
      
      if (!release) {
        console.log(`  ℹ️  MusicBrainz에서 찾을 수 없음`);
        existingData[albumId] = {
          album_id: `spotify:album:${albumId}`,
          credits: [],
          found: false,
          fetched_at: new Date().toISOString()
        };
        failed++;
      } else {
        console.log(`  ✅ MusicBrainz 발견: ${release.title} (${release.id})`);
        
        // 크레딧 정보 수집
        await sleep(1000); // MusicBrainz rate limit
        const credits = await getReleaseCredits(release.id);
        
        existingData[albumId] = {
          album_id: `spotify:album:${albumId}`,
          musicbrainz_id: release.id,
          credits: credits,
          found: true,
          fetched_at: new Date().toISOString()
        };

        totalCredits += credits.length;
        processed++;
        console.log(`  🎯 크레딧 발견: ${credits.length}개`);
      }

    } catch (error) {
      console.error(`  ❌ 실패: ${error.message}`);
      existingData[albumId] = {
        album_id: `spotify:album:${albumId}`,
        credits: [],
        error: error.message,
        fetched_at: new Date().toISOString()
      };
      failed++;
    }

    // MusicBrainz rate limit (1 req/sec)
    await sleep(1100);

    // 진행상황 저장 (50개마다)
    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          totalAlbums: Object.keys(existingData).length,
          albums: existingData
        }, null, 2),
        'utf-8'
      );
      console.log(`\n💾 중간 저장 완료 (${Object.keys(existingData).length}개 앨범)`);
    }
  }

  // 4. 최종 저장
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
  console.log('✅ 크레딧 정보 수집 완료!');
  console.log('='.repeat(60));
  console.log(`📊 통계:`);
  console.log(`   • 총 앨범: ${targetAlbums.length}개 (상위 ${(TOP_PERCENT * 100).toFixed(0)}%)`);
  console.log(`   • 성공: ${processed}개`);
  console.log(`   • 이미 존재: ${skipped}개`);
  console.log(`   • 실패/없음: ${failed}개`);
  console.log(`   • 발견된 크레딧: ${totalCredits}개`);
  console.log(`\n💾 저장 위치: ${OUTPUT_FILE}`);
}

main().catch(error => {
  console.error('\n❌ 에러 발생:', error);
  process.exit(1);
});
