#!/usr/bin/env bash
# Выкладка wa-group-sender на стенд inkbpadev. Запускается джобой deploy из
# ci.yml после того, как она положила проверенный коммит в каталог стенда.
#
# Два контейнера: wa-group-sender (Java) и wa-bridge (WhatsApp-клиент на
# whatsmeow, сессия в volume wa-bridge).
#
# Порядок: теги отката → сборка → остановка приложения → копия базы → запуск →
# проверка. База H2 — файл в volume, поэтому копия снимается с остановленного
# контейнера. Схему меняет Flyway при старте. При отказе возвращаются прежние
# образы, а если в коммите появились новые миграции — ещё и база из копии.
# Сессию WhatsApp не копируем и не возвращаем: в ней ключи, которые меняются
# на ходу, старая копия сломает сессию.
set -euo pipefail

PROJECT=wa-group-sender
APP=wa-group-sender
SERVICES=(wa-group-sender wa-bridge)
STAND_DIR=/srv/stands/wa-group-sender
ENV_FILE=/etc/wa-group-sender/.env
BACKUP_DIR=/var/backups/wa-group-sender
BACKUP_KEEP=10
LOCK_FILE=$STAND_DIR/.deploy.lock
LOCK_TIMEOUT_SECONDS=600
READY_TIMEOUT_SECONDS=180
DB_VOLUME=${PROJECT}_wa-db

declare -A ROLLBACK_NAME=()
RECREATED=0
HANDLING_FAILURE=0
SHORT_SHA=""
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
  compose logs --tail 80 || true
  return 1
}

migrations_changed() {
  local now
  now=$(ls -1 src/main/resources/db/migration 2>/dev/null || true)
  [ "$now" != "$(cat .migrations-before 2>/dev/null || true)" ]
}

# Одноразовый контейнер приложения с его volume /data/db: в образе есть busybox tar.
db_shell() {
  compose run --rm --no-deps -T --user 0 --entrypoint sh "$APP" -c "$1"
}

backup() {
  if ! docker volume inspect "$DB_VOLUME" > /dev/null 2>&1; then
    log "backup: volume $DB_VOLUME ещё нет, копировать нечего"
    return 0
  fi
  mkdir -p "$BACKUP_DIR"
  DB_DUMP="$BACKUP_DIR/wa-group-sender-db-$(date -u +%Y-%m-%d-%H%M)-$SHORT_SHA.tar.gz"
  db_shell 'tar cf - -C /data/db .' | gzip > "$DB_DUMP"
  gzip -t "$DB_DUMP" || fail "копия $DB_DUMP повреждена"
  log "backup: $DB_DUMP ($(du -h "$DB_DUMP" | cut -f1)) проходит gzip -t"
  find "$BACKUP_DIR" -maxdepth 1 -name 'wa-group-sender-db-*.tar.gz' -printf '%T@ %p\n' \
    | sort -rn | tail -n "+$((BACKUP_KEEP + 1))" | cut -d' ' -f2- | xargs -r rm -f
}

restore_db() {
  log "в коммите новые миграции: возвращаю базу из $DB_DUMP"
  compose stop "$APP" || true
  gunzip -c "$DB_DUMP" | db_shell 'find /data/db -mindepth 1 -delete && tar xf - -C /data/db && chown -R 10001:10001 /data/db'
}

rollback() {
  local service
  for service in "${SERVICES[@]}"; do
    if [ -n "${ROLLBACK_NAME[$service]:-}" ]; then
      log "rollback: $service ← $PROJECT-$service:rollback-$SHORT_SHA"
      docker tag "$PROJECT-$service:rollback-$SHORT_SHA" "${ROLLBACK_NAME[$service]}"
    else
      # Сервиса до выкладки не было — прежней версии он не нужен.
      log "rollback: $service появился в этой выкладке, останавливаю"
      compose rm -sf "$service" || true
    fi
  done
  if migrations_changed; then
    if [ -n "$DB_DUMP" ]; then
      restore_db
    else
      log "копии базы нет — прежний образ может не принять новую схему"
    fi
  fi
  for service in "${SERVICES[@]}"; do
    if [ -n "${ROLLBACK_NAME[$service]:-}" ]; then
      compose up -d --no-build --no-deps --force-recreate "$service"
    fi
  done
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
    if [ -z "${ROLLBACK_NAME[$APP]:-}" ]; then
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

  local service id current
  for service in "${SERVICES[@]}"; do
    id=$(compose ps -a -q "$service")
    if [ -z "$id" ]; then
      log "rollback: контейнера $service ещё нет — для него отката не будет"
      continue
    fi
    current=$(docker inspect -f '{{.Image}}' "$id")
    docker image inspect "$current" > /dev/null 2>&1 \
      || fail "образа ${current:7:12} контейнера $service уже нет, откатываться некуда"
    docker tag "$current" "$PROJECT-$service:rollback-$SHORT_SHA"
    ROLLBACK_NAME[$service]=$(docker inspect -f '{{.Config.Image}}' "$id")
    log "rollback: $service ${current:7:12} → $PROJECT-$service:rollback-$SHORT_SHA"
  done

  log "сборка образов: ${SERVICES[*]}"
  compose build

  trap on_exit EXIT
  RECREATED=1
  if [ -n "${ROLLBACK_NAME[$APP]:-}" ]; then
    log "остановка приложения для копии базы"
    compose stop -t 60 "$APP"
  fi
  backup

  # Без --force-recreate: wa-bridge пересоздаётся, только если изменился его образ,
  # и сессия WhatsApp не переподключается на каждую выкладку.
  log "запуск"
  compose up -d --no-build --remove-orphans --wait --wait-timeout 300
  wait_ready || fail "стенд не готов после выкладки"
  compose ps
  log "выкладка $SHORT_SHA завершена"
}

main "$@"
