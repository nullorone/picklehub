#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must name the reviewed source database}"
: "${BACKUP_DIRECTORY:?BACKUP_DIRECTORY must be an explicit protected directory}"
case "${BACKUP_DIRECTORY}" in
    /*) ;;
    *) printf '%s\n' 'BACKUP_DIRECTORY must be absolute' >&2; exit 64 ;;
esac

umask 077
mkdir -p "${BACKUP_DIRECTORY}"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_path="${BACKUP_DIRECTORY}/picklehub-${timestamp}.dump"

pg_dump --dbname="${DATABASE_URL}" --format=custom --no-owner --no-acl --file="${backup_path}"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${backup_path}" >"${backup_path}.sha256"
else
    shasum -a 256 "${backup_path}" >"${backup_path}.sha256"
fi
pg_restore --list "${backup_path}" >/dev/null
printf '%s\n' "Logical drill backup verified: ${backup_path}"
