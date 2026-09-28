#!/usr/bin/env bash
# Разовая подготовка сервера inkbpadev под wa-group-sender. Идемпотентный:
# можно запускать повторно, существующий /etc/wa-group-sender/.env не
# перезаписывается (кроме переезда контейнера с порта 8097 на 8098, см. п. 1).
#
#   sudo bash deploy/inkbpadev/setup-host.sh
#
# Что делает:
#   1. /etc/wa-group-sender/.env — настройки стенда из .env.example. Лежит вне
#      каталога раннера: actions/checkout делает git clean -ffdx и стёр бы его.
#      Стенд стартует в профиле fake (без номера и таблицы). Для боевого
#      профиля — SPRING_PROFILES_ACTIVE=prod, таблица, Telegram и ключ Google.
#   2. /etc/wa-group-sender/secrets — ключ Google, монтируется в /run/secrets.
#   3. /srv/stands/wa-group-sender — каталог стенда, из него поднимает стек джоба
#      deploy в .github/workflows/ci.yml при push в main.
#   4. /var/backups/wa-group-sender — копии базы H2, которые снимает выкладка.
#   5. Системный nginx: :8097 → 127.0.0.1:8098.
set -euo pipefail

RUNNER_USER="gha-runner"
APP_UID=10001
ENV_DIR="/etc/wa-group-sender"
ENV_FILE="${ENV_DIR}/.env"
SECRETS_DIR="${ENV_DIR}/secrets"
STAND_DIR="/srv/stands/wa-group-sender"
BACKUP_DIR="/var/backups/wa-group-sender"
HOST_IP="10.10.1.132"
PUBLIC_PORT=8097
HTTP_PORT=8098
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE="$SCRIPT_DIR/../../.env.example"

[[ $EUID -eq 0 ]] || { echo "Нужен sudo"; exit 1; }
id "$RUNNER_USER" &>/dev/null || { echo "Нет юзера $RUNNER_USER — сначала поставь раннер"; exit 1; }
[[ -r "$EXAMPLE" ]] || { echo "Нет $EXAMPLE — запускай из клона репозитория"; exit 1; }

port_busy() { ss -Hltn "sport = :$1" | grep -q .; }

stand_compose() {
  (cd "$STAND_DIR" && docker compose -p wa-group-sender --env-file "$ENV_FILE" \
     -f docker-compose.yml -f deploy/inkbpadev/docker-compose.override.yml "$@")
}

# --- 1. Настройки -------------------------------------------------------------
install -d -m 0750 -o root -g "$RUNNER_USER" "$ENV_DIR"
if [[ ! -f "$ENV_FILE" ]]; then
  for p in "$PUBLIC_PORT" "$HTTP_PORT"; do
    if port_busy "$p"; then echo "Порт $p уже занят:"; ss -Hltnp "sport = :$p"; exit 1; fi
  done
  umask 027
  {
    echo "# wa-group-sender на inkbpadev. Создан setup-host.sh $(date -I) из .env.example."
    echo
    sed -e "s/^SPRING_PROFILES_ACTIVE=.*/SPRING_PROFILES_ACTIVE=fake/" \
        -e "s/^HTTP_BIND=.*/HTTP_BIND=127.0.0.1/" \
        -e "s/^HTTP_PORT=.*/HTTP_PORT=${HTTP_PORT}/" \
        -e "s/^ADMIN_TOKEN=.*/ADMIN_TOKEN=$(openssl rand -hex 32)/" \
        -e "s/^MESSAGE_CONTACT=.*/MESSAGE_CONTACT=Диспетчер (тест)/" \
        "$EXAMPLE"
  } >"$ENV_FILE"
  chown root:"$RUNNER_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  echo "Создан $ENV_FILE (профиль fake, контейнер на 127.0.0.1:${HTTP_PORT})"
elif grep -qx "HTTP_PORT=${PUBLIC_PORT}" "$ENV_FILE"; then
  # Первая версия скрипта сажала контейнер прямо на 8097; теперь этот порт
  # у nginx, а контейнер переезжает на 8098.
  if port_busy "$HTTP_PORT"; then echo "Порт $HTTP_PORT уже занят:"; ss -Hltnp "sport = :$HTTP_PORT"; exit 1; fi
  sed -i "s/^HTTP_PORT=${PUBLIC_PORT}\$/HTTP_PORT=${HTTP_PORT}/" "$ENV_FILE"
  echo "$ENV_FILE: HTTP_PORT ${PUBLIC_PORT} → ${HTTP_PORT}"
  if [[ -f "$STAND_DIR/.deployed-sha" ]]; then
    stand_compose up -d --no-build --wait --wait-timeout 300 wa-group-sender
    echo "Контейнер пересоздан на 127.0.0.1:${HTTP_PORT}"
  fi
else
  echo "$ENV_FILE уже есть, не трогаю"
fi

# --- 2. Ключ Google -------------------------------------------------------------
# Каталог без чтения для чужих, только проход: контейнер (uid $APP_UID) открывает
# файл по известному имени. Сам ключ читает только группа $APP_UID.
install -d -m 0711 -o root -g root "$SECRETS_DIR"
echo "Ключ Google: sudo install -m 0440 -o root -g $APP_UID key.json $SECRETS_DIR/google-service-account.json"

# --- 3. Каталог стенда --------------------------------------------------------
install -d -m 0755 -o root -g root "$(dirname "$STAND_DIR")"
install -d -m 0750 -o "$RUNNER_USER" -g "$RUNNER_USER" "$STAND_DIR"
echo "Стенд: $STAND_DIR"

# --- 4. Копии базы -------------------------------------------------------------
install -d -m 0750 -o "$RUNNER_USER" -g "$RUNNER_USER" "$BACKUP_DIR"
echo "Копии базы: $BACKUP_DIR"

# --- 5. nginx -----------------------------------------------------------------
install -m 0644 "$SCRIPT_DIR/nginx-wa-group-sender.conf" /etc/nginx/sites-available/wa-group-sender
ln -sfn ../sites-available/wa-group-sender /etc/nginx/sites-enabled/wa-group-sender
nginx -t
systemctl reload nginx
if command -v ufw &>/dev/null && ufw status | grep -q '^Status: active'; then
  ufw allow "${PUBLIC_PORT}/tcp" comment wa-group-sender
fi
echo "nginx: http://${HOST_IP}:${PUBLIC_PORT}/api/health"

echo "Токен администратора: sudo grep ^ADMIN_TOKEN $ENV_FILE"
