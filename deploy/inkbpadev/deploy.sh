#!/usr/bin/env bash
# Выкладка wa-group-sender на стенд inkbpadev. Запускается джобой deploy из
# ci.yml после того, как она положила проверенный коммит в каталог стенда.
#
# Порядок: тег отката → сборка → остановка → копия базы → запуск → проверка.
# База H2 — файл в volume, поэтому копия снимается с остановленного контейнера.
# Схему меняет Flyway при старте. При отказе возвращается прежний образ, а если
# в коммите появились новые миграции — ещё и база из копии: прежний код не
# знает новой схемы. Сессию WhatsApp не копируем и не возвращаем: в ней ключи,
# которые меняются на ходу, старая копия сломает сессию.
set -euo pipefail

PROJECT=wa-group-sender
SERVICE=wa-group-sender
STAND_DIR=/srv/stands/wa-group-sender
ENV_FILE=/etc/wa-group-sender/.env
BACKUP_DIR=/var/backups/wa-group-sender
BACKUP_KEEP=10
LOCK_FILE=$STAND_DIR/.deploy.lock
LOCK_TIMEOUT_SECONDS=600
READY_TIMEOUT_SECONDS=180
DB_VOLUME=${PROJECT}_wa-db

FIRST_DEPLOY=0
RECREATED=0
HANDLING_FAILURE=0
SHORT_SHA=""
IMAGE=""
DB_DUMP=""

log() {
  printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

fail() {
  log "ОШИБКА: $*"
  exit 1
}

compose() {
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" \
    -f docker-compose.yml -f deploy/inkbpadev/docker-compose.override.yml "$@"
}

env_value() {
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-
}

health_url() {
  local bind port
  bind=$(env_value HTTP_BIND)
  port=$(env_value HTTP_PORT)
  printf 'http://%s:%s/api/health' "${bind:-127.0.0.1}" "${port:-8080}"
}

wait_ready() {
  local url deadline body
  url=$(health_url)
  deadline=$(( $(date +%s) + READY_TIMEOUT_SECONDS ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if body=$(curl -fsS --max-time 5 "$url" 2>/dev/null) && [[ $body == *'"status":"UP"'* ]]; then
      log "стенд отвечает: $url → $body"
      return 0
    fi
    sleep 5
  done
  log "стенд не ответил на $url за ${READY_TIMEOUT_SECONDS} с"
  compose logs --tail 80 "$SERVICE" || true
  return 1
}

migrations_changed() {
  local now
  now=$(ls -1 src/main/resources/db/migration 2>/dev/null || true)
  [ "$now" != "$(cat .migrations-before 2>/dev/null || true)" ]
}

# Образ с busybox tar — сам собранный образ, чтобы не тянуть лишнего.
volume_shell() {
  docker run --rm -i --user 0 --entrypoint sh -v "$DB_VOLUME:/data/db" "$IMAGE" -c "$1"
}

backup() {
  if ! docker volume inspect "$DB_VOLUME" > /dev/null 2>&1; then
    log "backup: volume $DB_VOLUME ещё нет, копировать нечего"
    return 0
  fi
  mkdir -p "$BACKUP_DIR"
  DB_DUMP="$BACKUP_DIR/wa-group-sender-db-$(date -u +%Y-%m-%d-%H%M)-$SHORT_SHA.tar.gz"
  volume_shell 'tar cf - -C /data/db .' | gzip > "$DB_DUMP"
  gzip -t "$DB_DUMP" || fail "копия $DB_DUMP повреждена"
  log "backup: $DB_DUMP ($(du -h "$DB_DUMP" | cut -f1)) проходит gzip -t"
  find "$BACKUP_DIR" -maxdepth 1 -name 'wa-group-sender-db-*.tar.gz' -printf '%T@ %p\n' \
    | sort -rn | tail -n "+$((BACKUP_KEEP + 1))" | cut -d' ' -f2- | xargs -r rm -f
}

restore_db() {
  log "в коммите новые миграции: возвращаю базу из $DB_DUMP"
  compose stop "$SERVICE" || true
  gunzip -c "$DB_DUMP" | volume_shell 'find /data/db -mindepth 1 -delete && tar xf - -C /data/db && chown -R 10001:10001 /data/db'
}

rollback() {
  log "возвращаю прежний образ $PROJECT:rollback-$SHORT_SHA"
  docker tag "$PROJECT:rollback-$SHORT_SHA" "$IMAGE"
  if migrations_changed; then
    if [ -n "$DB_DUMP" ]; then
      restore_db
    else
      log "копии базы нет — прежний образ может не принять новую схему"
    fi
  fi
  compose up -d --no-build --force-recreate "$SERVICE"
  if wait_ready; then
    log "прежняя версия поднята и отвечает; коммит $SHORT_SHA не выложен"
  else
    log "прежняя версия тоже не отвечает — нужен ручной разбор"
  fi
  compose ps
}

# shellcheck disable=SC2329
on_exit() {
  local status=$?
  if [ "$status" -ne 0 ] && [ "$RECREATED" = 1 ] && [ "$HANDLING_FAILURE" = 0 ]; then
    HANDLING_FAILURE=1
    if [ "$FIRST_DEPLOY" = 1 ]; then
      log "первая выкладка, откатываться не на что"
      compose ps || true
    else
      rollback || true
    fi
    exit 1
  fi
  exit "$status"
}

main() {
  cd "$STAND_DIR"

  exec 9>"$LOCK_FILE"
  flock --timeout "$LOCK_TIMEOUT_SECONDS" 9 || fail "другая выкладка не завершилась за $LOCK_TIMEOUT_SECONDS с"

  local expected=${GITHUB_SHA:?GITHUB_SHA не задан — сценарий запускается из workflow}
  local deployed
  deployed=$(cat .deployed-sha 2>/dev/null || echo "")
  [ "$deployed" = "$expected" ] || fail "в стенде коммит ${deployed:0:12}, а не ${expected:0:12}: синхронизация не выполнялась"
  SHORT_SHA=${expected:0:12}
  log "начало выкладки main, коммит $SHORT_SHA"

  test -r "$ENV_FILE" || fail "$ENV_FILE не найден — запусти deploy/inkbpadev/setup-host.sh"
  [ -w "$BACKUP_DIR" ] || fail "$BACKUP_DIR недоступен на запись — запусти deploy/inkbpadev/setup-host.sh"
  compose config --quiet
  IMAGE=$(compose config --images | head -1)
  [ -n "$IMAGE" ] || fail "не удалось определить имя образа из docker-compose.yml"

  local id current
  id=$(compose ps -a -q "$SERVICE")
  if [ -z "$id" ]; then
    FIRST_DEPLOY=1
    log "rollback: контейнера ещё нет — первая выкладка, без автоматического отката"
  else
    current=$(docker inspect -f '{{.Image}}' "$id")
    docker image inspect "$current" > /dev/null 2>&1 \
      || fail "образа ${current:7:12} текущего контейнера уже нет, откатываться некуда"
    docker tag "$current" "$PROJECT:rollback-$SHORT_SHA"
    log "rollback: ${current:7:12} → $PROJECT:rollback-$SHORT_SHA"
  fi

  log "сборка образа $IMAGE"
  compose build "$SERVICE"

  trap on_exit EXIT
  RECREATED=1
  if [ "$FIRST_DEPLOY" = 0 ]; then
    log "остановка для копии базы"
    compose stop -t 60 "$SERVICE"
  fi
  backup

  log "запуск"
  compose up -d --no-build --remove-orphans --force-recreate --wait --wait-timeout 300 "$SERVICE"
  wait_ready || fail "стенд не готов после выкладки"
  compose ps
  log "выкладка $SHORT_SHA завершена"
}

main "$@"
