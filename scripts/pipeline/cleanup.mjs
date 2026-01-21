#!/usr/bin/env node
/**
 * Clean up intermediate pipeline files before fresh collection
 */

import fs from 'fs';
import path from 'path';

const FILES_TO_CLEAN = [
  // 앨범 파이프라인 파일들
  './out/albums_spotify_v0.json',
  './out/albums_spotify_v1.json',
  './out/albums_spotify_v2.json',
  './out/albums_spotify_v3.json',
  // 메타데이터 파일들 (매번 새로 생성되므로 삭제)
  './out/artists_spotify.json',
  './out/album_collaborations.json',
  './out/album_credits.json',
];

console.log('🧹 Cleaning up old pipeline files...\n');

let deletedCount = 0;
let skippedCount = 0;

for (const file of FILES_TO_CLEAN) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`  🗑️  Deleted: ${file}`);
    deletedCount++;
  } else {
    console.log(`  ⏭️  Skip (not found): ${file}`);
    skippedCount++;
  }
}

console.log(`\n✅ Cleanup complete!`);
console.log(`   Deleted: ${deletedCount} files`);
console.log(`   Skipped: ${skippedCount} files\n`);
