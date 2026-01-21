#!/usr/bin/env node
/**
 * Cross-platform DB backup script
 */

import { execSync } from 'child_process';
import fs from 'fs';

const BACKUP_FILE = './backups/latest.sql.gz';

try {
  console.log('🗄️  Creating DB backup...');
  
  // Create backup in container
  execSync('docker exec sonic_db sh -c "pg_dump -U sonic sonic_db | gzip > /tmp/backup.sql.gz"', {
    stdio: 'inherit'
  });
  
  // Copy to local
  execSync('docker cp sonic_db:/tmp/backup.sql.gz backups/latest.sql.gz', {
    stdio: 'inherit'
  });
  
  // Verify file exists
  if (fs.existsSync(BACKUP_FILE)) {
    const stats = fs.statSync(BACKUP_FILE);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`✅ Backup created: ${BACKUP_FILE} (${sizeMB} MB)`);
    console.log('');
    console.log('💡 Commit to Git:');
    console.log('   git add backups/latest.sql.gz');
    console.log('   git commit -m "chore: DB backup"');
    console.log('   git push');
  } else {
    console.error('❌ Backup file not found!');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Backup failed:', error.message);
  process.exit(1);
}
