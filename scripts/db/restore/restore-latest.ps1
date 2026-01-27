param(
  [string]$DumpPath = "backups/latest.sql.gz"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DumpPath)) {
  throw "Dump file not found: $DumpPath"
}

docker-compose up -d db redis | Out-Null
docker-compose stop backend | Out-Null

docker exec sonic_db psql -U sonic -d postgres -c "DROP DATABASE IF EXISTS sonic_db;" | Out-Null
docker exec sonic_db psql -U sonic -d postgres -c "CREATE DATABASE sonic_db;" | Out-Null

$pythonCmd = "import gzip,sys; f=gzip.open(r'$DumpPath','rb'); sys.stdout.buffer.write(f.read())"
python -c $pythonCmd | docker exec -i sonic_db psql -U sonic -d sonic_db

docker-compose up -d backend | Out-Null
