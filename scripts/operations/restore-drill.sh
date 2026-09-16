#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
    printf '%s\n' 'usage: restore-drill.sh /absolute/path/to/backup.dump' >&2
    exit 64
fi

backup_path=$1
case "${backup_path}" in
    /*) ;;
    *) printf '%s\n' 'backup path must be absolute' >&2; exit 64 ;;
esac
test -f "${backup_path}"
test -f "${backup_path}.sha256"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum --check "${backup_path}.sha256"
else
    shasum -a 256 --check "${backup_path}.sha256"
fi

project_name="picklehub-drill-$$"
compose_file="$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)/deploy/compose.drill.yml"
cleanup() {
    docker compose --project-name "${project_name}" --file "${compose_file}" down --volumes --remove-orphans
}
trap cleanup EXIT INT TERM

docker compose --project-name "${project_name}" --file "${compose_file}" up --detach --wait postgres redis
docker compose --project-name "${project_name}" --file "${compose_file}" exec --no-TTY postgres \
    pg_restore --username=picklehub_drill --dbname=picklehub_drill --clean --if-exists --no-owner --no-acl \
    <"${backup_path}"
docker compose --project-name "${project_name}" --file "${compose_file}" run --rm migrate
docker compose --project-name "${project_name}" --file "${compose_file}" exec --no-TTY postgres \
    psql --username=picklehub_drill --dbname=picklehub_drill --set=ON_ERROR_STOP=1 \
    --command="SELECT postgis_version(); SELECT COUNT(*) AS unpublished_outbox FROM outbox_events WHERE status::text <> 'PUBLISHED';"
printf '%s\n' 'Restore and migration drill completed; inspect reconciliation before declaring success.'
