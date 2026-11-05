#!/usr/bin/env bash
# Encrypted backup of the database and, optionally, of new Storage objects
# and new track audio in R2.
# Run by .github/workflows/backup.yml; restore steps are documented there.
#
# Required:
#   SUPABASE_DB_URL          Postgres connection string (session pooler)
#   BACKUP_AGE_RECIPIENT     age public key the archives are encrypted to
# Optional:
#   BACKUP_STORAGE=true      also list every Storage and R2 object and copy
#                            new ones
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#                            needed to download objects; without them the
#                            Storage part only writes the list
#   R2_BACKUP_ENDPOINT, R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY,
#   R2_BACKUP_BUCKET         a read-only R2 token for the audio bucket;
#                            without them the R2 part is skipped
#   BACKUP_NEW_SINCE_DAYS    what counts as new (default 8, a week plus slack)
#   BACKUP_MAX_OBJECT_BYTES  skip the copy above this total (default 2 GB)
#   BACKUP_OUT               output directory (default ./backup)
#
# Needs the Supabase CLI (and Docker, which it uses for pg_dump), psql, jq,
# curl, age and, for R2, the AWS CLI. Only encrypted files are written to
# BACKUP_OUT.
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

# R2: the track audio, the same way: a list of every object and a copy of
# the ones added recently. Read only credentials; skipped without them.
if [ -z "${R2_BACKUP_ENDPOINT:-}" ] || [ -z "${R2_BACKUP_ACCESS_KEY_ID:-}" ] ||
  [ -z "${R2_BACKUP_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_BACKUP_BUCKET:-}" ]; then
  echo "::notice::R2 backup skipped: R2_BACKUP_ENDPOINT, R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY or R2_BACKUP_BUCKET is not set."
  exit 0
fi
if ! command -v aws >/dev/null; then
  echo "::warning::R2 backup skipped: the AWS CLI is not installed."
  exit 0
fi

r2() {
  AWS_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION=auto \
    AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
    AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    aws --endpoint-url "$R2_BACKUP_ENDPOINT" "$@"
}

mkdir -p "$work/r2/objects"
# The CLI pages through the whole bucket and prints nothing for an empty one.
listing="$(r2 s3api list-objects-v2 --bucket "$R2_BACKUP_BUCKET" --output json)"
printf '%s' "${listing:-"{}"}" | jq --argjson days "$new_since_days" '
  (now - $days * 86400) as $since
  | [(.Contents // [])[] | {
      key: .Key,
      size: .Size,
      last_modified: .LastModified,
      new: ((.LastModified | sub("\\.[0-9]+"; "") | sub("\\+00:00$"; "Z") | fromdateiso8601) > $since)
    }]' >"$work/r2/objects.json"

jq -c '[.[] | select(.new)]' "$work/r2/objects.json" >"$work/r2-new.json"
count="$(jq length "$work/r2-new.json")"
bytes="$(jq '[.[].size // 0] | add // 0' "$work/r2-new.json")"
echo "R2: $(jq length "$work/r2/objects.json") objects, $count new in the last $new_since_days days ($bytes bytes)"

if [ "$count" -gt 0 ]; then
  if [ "$bytes" -gt "$max_object_bytes" ]; then
    echo "::warning::The $count new R2 objects are $bytes bytes, over the limit of $max_object_bytes. They were listed but not copied."
  else
    copied=0
    while IFS=$'\t' read -r key size; do
      # Audio keys are <user id>/<uuid>.mp3. Anything else is listed but
      # not written to disk, so a key can never point outside this folder.
      if ! [[ "$key" =~ ^[0-9a-f-]{36}/[0-9a-f-]{36}\.mp3$ ]]; then
        # Printable characters only, so a key cannot add workflow commands.
        echo "::warning::Not copied, unexpected R2 key: ${key//[^[:alnum:]\/._-]/?}"
        continue
      fi
      mkdir -p "$work/r2/objects/$(dirname "$key")"
      # </dev/null keeps the CLI from reading the rest of the key list.
      r2 s3api get-object --bucket "$R2_BACKUP_BUCKET" --key "$key" \
        "$work/r2/objects/$key" </dev/null >/dev/null
      if [ "$(wc -c <"$work/r2/objects/$key" | tr -d ' ')" != "$size" ]; then
        echo "R2 object $key was not copied whole" >&2
        exit 1
      fi
      copied=$((copied + 1))
    done < <(jq -r '.[] | [.key, .size] | @tsv' "$work/r2-new.json")
    echo "Copied $copied R2 objects"
  fi
fi
encrypt "$work/r2" "needears-r2-$stamp"
