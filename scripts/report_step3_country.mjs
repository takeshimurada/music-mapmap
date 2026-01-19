/**
 * Step 3: Country 보강 리포트 생성
 * 
 * v1 vs v3 비교 분석
 */

import fs from "fs";
import path from "path";

const V1_FILE = path.resolve("./out/albums_spotify_v1.json");
const V3_FILE = path.resolve("./out/albums_spotify_v3.json");
const REPORT_FILE = path.resolve("./out/report_step3_country.json");

const CANONICAL_COUNTRY_FIELD = "country";

function generateReport() {
  console.log("📊 Step 3: Country Enrichment Report");
  console.log("======================================\n");
  
  // 파일 확인
  if (!fs.existsSync(V1_FILE)) {
    throw new Error(`File not found: ${V1_FILE}`);
  }
  
  if (!fs.existsSync(V3_FILE)) {
    throw new Error(`File not found: ${V3_FILE}\nRun 'npm run step3:enrich-country' first`);
  }
  
  // 파일 읽기
  console.log("📂 Reading v1:", V1_FILE);
  const v1Data = JSON.parse(fs.readFileSync(V1_FILE, "utf-8"));
  
  console.log("📂 Reading v3:", V3_FILE);
  const v3Data = JSON.parse(fs.readFileSync(V3_FILE, "utf-8"));
  
  const v1Albums = v1Data.albums || [];
  const v3Albums = v3Data.albums || [];
  
  const total = v3Albums.length;
  
  console.log(`📊 Total albums: ${total}\n`);
  
  // ============================================
  // 1. Fill Rate 비교
  // ============================================
  
  // v1 채움률 (canonicalCountryField 기준)
  const v1Filled = v1Albums.filter(a => {
    const val = a[CANONICAL_COUNTRY_FIELD];
    return val && val !== "Unknown" && val !== null;
  }).length;
  
  // v3 채움률 (canonicalCountryField 기준)
  const v3Filled = v3Albums.filter(a => {
    const val = a[CANONICAL_COUNTRY_FIELD];
    return val && val !== "Unknown" && val !== null;
  }).length;
  
  const v1Rate = (v1Filled / total * 100).toFixed(1);
  const v3Rate = (v3Filled / total * 100).toFixed(1);
  const improvement = (v3Filled - v1Filled);
  const improvementPct = ((v3Filled - v1Filled) / total * 100).toFixed(1);
  
  console.log("1️⃣ Fill Rate Comparison");
  console.log("------------------------");
  console.log(`v1 (before): ${v1Filled}/${total} (${v1Rate}%)`);
  console.log(`v3 (after):  ${v3Filled}/${total} (${v3Rate}%)`);
  console.log(`Improvement: +${improvement} (+${improvementPct}%p)\n`);
  
  // countryName 채움률
  const v1NameFilled = v1Albums.filter(a => {
    const val = a.countryName;
    return val && val !== "Unknown" && val !== null;
  }).length;
  
  const v3NameFilled = v3Albums.filter(a => {
    const val = a.countryName;
    return val && val !== "Unknown" && val !== null;
  }).length;
  
  console.log("countryName fill rate:");
  console.log(`  v1: ${v1NameFilled}/${total} (${(v1NameFilled/total*100).toFixed(1)}%)`);
  console.log(`  v3: ${v3NameFilled}/${total} (${(v3NameFilled/total*100).toFixed(1)}%)\n`);
  
  // ============================================
  // 2. Source 분포
  // ============================================
  
  const sourceDist = {};
  v3Albums.forEach(a => {
    const source = a.countrySource || "unknown";
    sourceDist[source] = (sourceDist[source] || 0) + 1;
  });
  
  console.log("2️⃣ Country Source Distribution");
  console.log("-------------------------------");
  Object.entries(sourceDist)
    .sort((a, b) => b[1] - a[1])
    .forEach(([source, count]) => {
      const pct = (count / total * 100).toFixed(1);
      console.log(`${source.padEnd(15)} ${count.toString().padStart(4)} (${pct}%)`);
    });
  console.log();
  
  // ============================================
  // 3. Type 분포
  // ============================================
  
  const typeDist = {};
  v3Albums.forEach(a => {
    const type = a.countryType || "unknown";
    typeDist[type] = (typeDist[type] || 0) + 1;
  });
  
  console.log("3️⃣ Country Type Distribution");
  console.log("-----------------------------");
  Object.entries(typeDist)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const pct = (count / total * 100).toFixed(1);
      console.log(`${type.padEnd(20)} ${count.toString().padStart(4)} (${pct}%)`);
    });
  console.log();
  
  // ============================================
  // 4. Top 20 Countries
  // ============================================
  
  const countryDist = {};
  v3Albums.forEach(a => {
    const country = a[CANONICAL_COUNTRY_FIELD] || "null";
    countryDist[country] = (countryDist[country] || 0) + 1;
  });
  
  const topCountries = Object.entries(countryDist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  
  console.log("4️⃣ Top 20 Countries");
  console.log("--------------------");
  topCountries.forEach(([country, count]) => {
    const pct = (count / total * 100).toFixed(1);
    const label = country === "Unknown" ? "⚠️ Unknown" : country;
    console.log(`${label.padEnd(25)} ${count.toString().padStart(4)} (${pct}%)`);
  });
  console.log();
  
  // ============================================
  // 5. 실패 케이스 샘플
  // ============================================
  
  const failedCases = v3Albums
    .filter(a => {
      const val = a[CANONICAL_COUNTRY_FIELD];
      return !val || val === "Unknown" || val === null;
    })
    .slice(0, 20)
    .map(a => ({
      artistName: a.artistName,
      title: a.title,
      primaryGenre: a.primaryGenre || "unknown",
    }));
  
  console.log("5️⃣ Failed Cases (Sample 20)");
  console.log("----------------------------");
  if (failedCases.length === 0) {
    console.log("✅ No failed cases - 100% enrichment!");
  } else {
    failedCases.forEach((c, i) => {
      console.log(`${(i+1).toString().padStart(2)}. ${c.artistName} - ${c.title} (${c.primaryGenre})`);
    });
  }
  console.log();
  
  // ============================================
  // 6. 경고 & 권장사항
  // ============================================
  
  const warnings = [];
  const recommendations = [];
  
  if (improvement < total * 0.3) {
    warnings.push(`Enrichment improvement is low: +${improvementPct}%p (expected: +30%p+)`);
    recommendations.push("Check if MusicBrainz/Discogs APIs are accessible");
    recommendations.push("Review artist name matching logic (try fuzzy matching)");
  }
  
  if (!sourceDist.discogs && !sourceDist.existing) {
    warnings.push("Discogs was not used (missing token?)");
    recommendations.push("Add DISCOGS_TOKEN to .env for better coverage");
  }
  
  const unknownPct = (countryDist["Unknown"] || 0) / total * 100;
  if (unknownPct > 50) {
    warnings.push(`High Unknown rate: ${unknownPct.toFixed(1)}%`);
    recommendations.push("Consider manual data curation for popular albums");
  }
  
  console.log("6️⃣ Warnings & Recommendations");
  console.log("-------------------------------");
  
  if (warnings.length === 0) {
    console.log("✅ No warnings - enrichment looks good!");
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
    version: "v3",
    
    summary: {
      totalAlbums: total,
      v1_filled: v1Filled,
      v3_filled: v3Filled,
      improvement: improvement,
      improvementPct: parseFloat(improvementPct),
    },
    
    fillRates: {
      canonicalField: {
        v1: { filled: v1Filled, rate: parseFloat(v1Rate) },
        v3: { filled: v3Filled, rate: parseFloat(v3Rate) },
      },
      countryName: {
        v1: { filled: v1NameFilled, rate: parseFloat((v1NameFilled/total*100).toFixed(1)) },
        v3: { filled: v3NameFilled, rate: parseFloat((v3NameFilled/total*100).toFixed(1)) },
      },
    },
    
    distributions: {
      source: sourceDist,
      type: typeDist,
      countries: Object.fromEntries(topCountries),
    },
    
    failedCases: failedCases.slice(0, 20),
    
    warnings,
    recommendations,
    
    discogsSkipped: !sourceDist.discogs && v3Albums.length > 0,
  };
  
  console.log("💾 Writing report:", REPORT_FILE);
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf-8");
  
  console.log("\n✅ Report Complete!");
  console.log("======================================");
  console.log(`Report saved: ${REPORT_FILE}`);
  
  // 최종 판정
  if (improvement >= total * 0.3) {
    console.log("\n✅ Enrichment target achieved (+30%p+)");
  } else {
    console.log("\n⚠️ Enrichment target not met (expected +30%p, got +${improvementPct}%p)");
  }
}

// 실행
try {
  generateReport();
} catch (err) {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
}
