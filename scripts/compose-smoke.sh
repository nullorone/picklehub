#!/bin/sh
set -eu

project_name="picklehub-foundation-smoke-${GITHUB_RUN_ID:-local}"
compose="docker compose --project-name ${project_name} --profile foundation"

cleanup() {
    $compose down --volumes --remove-orphans
}
trap cleanup EXIT INT TERM

$compose config --quiet
$compose up --detach --build --wait

$compose exec --no-TTY api node -e \
    "Promise.all(['/v1/health/live', '/v1/health/ready'].map((path) => fetch('http://127.0.0.1:3000' + path).then((response) => { if (!response.ok) throw new Error(path + ': ' + response.status); }))).catch((error) => { console.error(error); process.exit(1); })"
$compose exec --no-TTY web wget --quiet --output-document=/dev/null http://127.0.0.1:8080/
$compose exec --no-TTY web wget --quiet --output-document=/dev/null http://127.0.0.1:8080/manifest.webmanifest
$compose exec --no-TTY tg wget --quiet --output-document=/dev/null http://127.0.0.1:8080/

$compose stop api worker
$compose logs --no-color api | grep 'application.shutdown.started' >/dev/null
$compose logs --no-color worker | grep 'application.shutdown.started' >/dev/null

printf '%s\n' 'Foundation Compose smoke passed; API and worker handled graceful shutdown.'
