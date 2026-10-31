#!/usr/bin/env bash
# Encrypted backup of the database and, optionally, of new Storage objects.
# Run by .github/workflows/backup.yml; restore steps are documented there.
#
# Required:
#   SUPABASE_DB_URL          Postgres connection string (session pooler)
#   BACKUP_AGE_RECIPIENT     age public key the archives are encrypted to
# Optional:
#   BACKUP_STORAGE=true      also list every Storage object and copy new ones
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#                            needed to download objects; without them the
#                            Storage part only writes the list
#   BACKUP_NEW_SINCE_DAYS    what counts as new (default 8, a week plus slack)
#   BACKUP_MAX_OBJECT_BYTES  skip the copy above this total (default 2 GB)
#   BACKUP_OUT               output directory (default ./backup)
#
# Needs the Supabase CLI (and Docker, which it uses for pg_dump), psql, jq,
# curl and age. Only encrypted files are written to BACKUP_OUT.
set -euo pipefail
umask 077

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is not set}"
new_since_days="${BACKUP_NEW_SINCE_DAYS:-8}"
max_object_bytes="${BACKUP_MAX_OBJECT_BYTES:-2000000000}"
out="${BACKUP_OUT:-backup}"
for n in "$new_since_days" "$max_object_bytes"; do
  [[ "$n" =~ ^[0-9]+$ ]] || { echo "Not a whole number: $n" >&2; exit 1; }
done
stamp="$(date -u +%Y-%m-%dT%H%MZ)"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$out"

encrypt() {
  # encrypt <directory> <name>: tar, gzip and encrypt a directory into $out.
  tar -C "$1" -czf - . | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" \
    --output "$out/$2.tar.gz.age"
  echo "Wrote $out/$2.tar.gz.age ($(du -h "$out/$2.tar.gz.age" | cut -f1))"
}

# Database: roles, schema and data in the format Supabase documents for
# restoring a project. The CLI runs pg_dump from an image that matches the
# server's Postgres version.
mkdir "$work/db"
supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$work/db/roles.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/db/schema.sql"
# The excluded Storage tables belong to features this project does not use
# (vector and analytics buckets, S3 multipart uploads), and only the storage
# admin role may write to them, so they would stop a restore.
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy \
  --exclude storage.buckets_vectors,storage.vector_indexes \
  --exclude storage.buckets_analytics,storage.iceberg_namespaces,storage.iceberg_tables \
  --exclude storage.s3_multipart_uploads,storage.s3_multipart_uploads_parts \
  -f "$work/db/data.sql"
# pg_cron jobs are not part of either dump; keep them as statements that
# schedule them again.
psql "$SUPABASE_DB_URL" --no-psqlrc --quiet --tuples-only --no-align \
  --set ON_ERROR_STOP=1 --command "
    select format('select cron.schedule(%L, %L, %L);', jobname, schedule, command)
    from cron.job order by jobname" >"$work/db/cron.sql"
encrypt "$work/db" "needears-db-$stamp"

if [ "${BACKUP_STORAGE:-}" != "true" ]; then
  exit 0
fi

# Storage: a list of every object, and a copy of the ones created or
# replaced recently. Older objects are in earlier weekly backups.
mkdir -p "$work/storage/objects"
psql "$SUPABASE_DB_URL" --no-psqlrc --quiet --tuples-only --no-align \
  --set ON_ERROR_STOP=1 --command "
    select coalesce(json_agg(json_build_object(
      'bucket', bucket_id,
      'name', name,
      'size', (metadata->>'size')::bigint,
      'created_at', created_at,
      'updated_at', updated_at,
      'new', coalesce(updated_at, created_at) > now() - make_interval(days => $new_since_days)
    ) order by bucket_id, name), '[]')
    from storage.objects" >"$work/storage/objects.json"

jq -c '[.[] | select(.new)]' "$work/storage/objects.json" >"$work/new.json"
count="$(jq length "$work/new.json")"
bytes="$(jq '[.[].size // 0] | add // 0' "$work/new.json")"
echo "Storage: $(jq length "$work/storage/objects.json") objects, $count new in the last $new_since_days days ($bytes bytes)"

if [ "$count" -gt 0 ]; then
  if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    echo "::warning::SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set, so the $count new objects were listed but not copied."
  elif [ "$bytes" -gt "$max_object_bytes" ]; then
    echo "::warning::The $count new objects are $bytes bytes, over the limit of $max_object_bytes. They were listed but not copied."
  else
    jq -r '.[] | [.bucket, .name] | @tsv' "$work/new.json" |
      while IFS=$'\t' read -r bucket name; do
        path="$(jq -rn --arg p "$name" '$p | split("/") | map(@uri) | join("/")')"
        mkdir -p "$work/storage/objects/$bucket/$(dirname "$name")"
        curl --fail --silent --show-error --retry 3 \
          --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
          --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
          --output "$work/storage/objects/$bucket/$name" \
          "$SUPABASE_URL/storage/v1/object/authenticated/$bucket/$path"
      done
    echo "Copied $count objects"
  fi
fi
encrypt "$work/storage" "needears-storage-$stamp"
