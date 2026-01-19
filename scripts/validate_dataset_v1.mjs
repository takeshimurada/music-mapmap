/**
 * Step 2-v1: 데이터 품질 검증 & 리포트 생성
 * 
 * 목표:
 * 1. 데이터 채움률 확인
 * 2. 분포 통계 생성
 * 3. 경고/권장사항 제공
 */

import fs from "fs";
import path from "path";

const INPUT_FILE = path.resolve("./out/albums_spotify_v1.json");
const REPORT_FILE = path.resolve("./out/report_step2_v1.json");

function validate() {
  console.log("📊 Step 2-v1: Dataset Validation");
  console.log("=====================================\n");
  
  // 입력 파일 읽기
  console.log("📂 Reading:", INPUT_FILE);
  
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`File not found: ${INPUT_FILE}\nRun 'npm run step2:normalize' first`);
  }
  
  const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  
  if (!data.albums || !Array.isArray(data.albums)) {
    throw new Error("Invalid file structure");
  }
  
  const albums = data.albums;
  const total = albums.length;
  
  console.log(`📊 Total albums: ${total}\n`);
  
  // ============================================
  // 1. 기본 검증
  // ============================================
  
  const uniqueIds = new Set(albums.map(a => a.albumId));
  const hasDuplicates = uniqueIds.size !== total;
  
  console.log("1️⃣ Basic Validation");
  console.log("-------------------");
  console.log(`Unique albumIds: ${uniqueIds.size}`);
  console.log(`Duplicates: ${hasDuplicates ? "⚠️ YES" : "✅ NO"}\n`);
  
  // ============================================
  // 2. 채움률 분석
  // ============================================
  
  const fillRates = {};
  
  const fields = [
    { key: "year", label: "Year" },
    { key: "primaryGenre", label: "Primary Genre (original)" },
    { key: "artistGenres", label: "Artist Genres (original)", checkLength: true },
    { key: "genreFamily", label: "Genre Family (new)" },
    { key: "region_bucket", label: "Region Bucket (new)" },
    { key: "country", label: "Country (new)" },
    { key: "artworkUrl", label: "Artwork URL" },
  ];
  
  console.log("2️⃣ Fill Rates");
  console.log("-------------------");
  
  for (const field of fields) {
    let filled;
    
    if (field.checkLength) {
      // artistGenres 같은 배열 필드
      filled = albums.filter(a => a[field.key] && Array.isArray(a[field.key]) && a[field.key].length > 0).length;
    } else {
      // 일반 필드
      filled = albums.filter(a => {
        const value = a[field.key];
        return value !== null && value !== undefined && value !== "" && value !== "Unknown";
      }).length;
    }
    
    const rate = (filled / total * 100).toFixed(1);
    fillRates[field.key] = { filled, total, rate: parseFloat(rate) };
    
    const status = rate >= 70 ? "✅" : rate >= 30 ? "⚠️" : "❌";
    console.log(`${status} ${field.label}: ${filled}/${total} (${rate}%)`);
  }
  
  console.log();
  
  // ============================================
  // 3. genreFamily 분포
  // ============================================
  
  const genreFamilyDist = {};
  albums.forEach(a => {
    const family = a.genreFamily || "Unknown";
    genreFamilyDist[family] = (genreFamilyDist[family] || 0) + 1;
  });
  
  const topGenreFamilies = Object.entries(genreFamilyDist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  
  console.log("3️⃣ Genre Family Distribution (Top 15)");
  console.log("-------------------");
  topGenreFamilies.forEach(([family, count]) => {
    const pct = (count / total * 100).toFixed(1);
    console.log(`${family.padEnd(20)} ${count.toString().padStart(4)} (${pct}%)`);
  });
  console.log();
  
  // ============================================
  // 4. region_bucket 분포
  // ============================================
  
  const regionDist = {};
  albums.forEach(a => {
    const region = a.region_bucket || "Unknown";
    regionDist[region] = (regionDist[region] || 0) + 1;
  });
  
  const topRegions = Object.entries(regionDist)
    .sort((a, b) => b[1] - a[1]);
  
  console.log("4️⃣ Region Bucket Distribution");
  console.log("-------------------");
  topRegions.forEach(([region, count]) => {
    const pct = (count / total * 100).toFixed(1);
    console.log(`${region.padEnd(20)} ${count.toString().padStart(4)} (${pct}%)`);
  });
  console.log();
  
  // ============================================
  // 5. country 분포
  // ============================================
  
  const countryDist = {};
  albums.forEach(a => {
    const country = a.country || "null";
    countryDist[country] = (countryDist[country] || 0) + 1;
  });
  
  const topCountries = Object.entries(countryDist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  
  console.log("5️⃣ Country Distribution (Top 15)");
  console.log("-------------------");
  topCountries.forEach(([country, count]) => {
    const pct = (count / total * 100).toFixed(1);
    const label = country === "null" ? "⚠️ null" : country;
    console.log(`${label.padEnd(20)} ${count.toString().padStart(4)} (${pct}%)`);
  });
  console.log();
  
  // ============================================
  // 6. 경고 & 권장사항
  // ============================================
  
  const warnings = [];
  const recommendations = [];
  
  // genreFamily 체크
  if (fillRates.genreFamily.rate < 70) {
    warnings.push(`genreFamily 채움률이 낮습니다: ${fillRates.genreFamily.rate}% (목표: 70%+)`);
    recommendations.push("장르 매핑 규칙을 확장하거나 primaryGenre 데이터를 확인하세요");
  }
  
  // region_bucket 체크 (필수!)
  if (fillRates.region_bucket.rate < 100) {
    warnings.push(`⚠️ CRITICAL: region_bucket이 비어있습니다: ${fillRates.region_bucket.rate}%`);
    warnings.push("MapCanvas가 크래시할 수 있습니다!");
    recommendations.push("normalize 스크립트의 deriveRegion 로직을 확인하세요");
  }
  
  // country 체크
  if (fillRates.country.rate === 0) {
    warnings.push(`country 필드가 전체 비어있습니다: ${fillRates.country.rate}%`);
    recommendations.push("💡 다음 단계: MusicBrainz/Discogs API로 country 데이터 보강 권장");
    recommendations.push("현재는 MapCanvas가 region_bucket으로 폴백하므로 정상 작동합니다");
  }
  
  console.log("6️⃣ Warnings & Recommendations");
  console.log("-------------------");
  
  if (warnings.length === 0) {
    console.log("✅ No warnings - data quality looks good!");
  } else {
    console.log("⚠️ Warnings:");
    warnings.forEach(w => console.log(`   - ${w}`));
  }
  
  console.log();
  
  if (recommendations.length > 0) {
    console.log("💡 Recommendations:");
    recommendations.forEach(r => console.log(`   - ${r}`));
    console.log();
  }
  
  // ============================================
  // 7. 리포트 파일 생성
  // ============================================
  
  const report = {
    generatedAt: new Date().toISOString(),
    version: "v1",
    sourceFile: path.basename(INPUT_FILE),
    
    summary: {
      totalAlbums: total,
      uniqueAlbumIds: uniqueIds.size,
      hasDuplicates,
    },
    
    fillRates,
    
    distributions: {
      genreFamily: Object.fromEntries(topGenreFamilies),
      region_bucket: Object.fromEntries(topRegions),
      country: Object.fromEntries(topCountries),
    },
    
    warnings,
    recommendations,
  };
  
  console.log("💾 Writing report:", REPORT_FILE);
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf-8");
  
  console.log("\n✅ Validation Complete!");
  console.log("=====================================");
  console.log(`Report saved: ${REPORT_FILE}`);
  
  // 최종 판정
  const critical = warnings.some(w => w.includes("CRITICAL"));
  if (critical) {
    console.log("\n❌ CRITICAL ISSUES FOUND - Please fix before proceeding!");
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log("\n⚠️ Some warnings found - review report for details");
  } else {
    console.log("\n✅ All checks passed - data ready for use!");
  }
}

// 실행
try {
  validate();
} catch (err) {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
}
