#!/usr/bin/env bash
# Разовая подготовка сервера inkbpadev под wa-group-sender. Идемпотентный:
# можно запускать повторно, существующий /etc/wa-group-sender/.env не
# перезаписывается.
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
set -euo pipefail

RUNNER_USER="gha-runner"
APP_UID=10001
ENV_DIR="/etc/wa-group-sender"
ENV_FILE="${ENV_DIR}/.env"
SECRETS_DIR="${ENV_DIR}/secrets"
STAND_DIR="/srv/stands/wa-group-sender"
BACKUP_DIR="/var/backups/wa-group-sender"
HTTP_PORT=8097
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE="$SCRIPT_DIR/../../.env.example"

[[ $EUID -eq 0 ]] || { echo "Нужен sudo"; exit 1; }
id "$RUNNER_USER" &>/dev/null || { echo "Нет юзера $RUNNER_USER — сначала поставь раннер"; exit 1; }
[[ -r "$EXAMPLE" ]] || { echo "Нет $EXAMPLE — запускай из клона репозитория"; exit 1; }

# --- 1. Настройки -------------------------------------------------------------
install -d -m 0750 -o root -g "$RUNNER_USER" "$ENV_DIR"
if [[ ! -f "$ENV_FILE" ]]; then
  if ss -Hltn "sport = :$HTTP_PORT" | grep -q .; then
    echo "Порт $HTTP_PORT уже занят:"; ss -Hltnp "sport = :$HTTP_PORT"; exit 1
  fi
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
  echo "Создан $ENV_FILE (профиль fake, порт 127.0.0.1:${HTTP_PORT})"
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

echo "Токен администратора: sudo grep ^ADMIN_TOKEN $ENV_FILE"
