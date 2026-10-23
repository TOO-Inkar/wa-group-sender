#!/usr/bin/env bash
# The server pulls main itself; this job only follows its progress via the production deployment statuses.
set -euo pipefail

repo=$GITHUB_REPOSITORY
sha=$GITHUB_SHA
deadline=$((SECONDS + 30 * 60))
at() { TZ=Asia/Almaty date -d "$1" '+%H:%M:%S'; }

echo "Сервер проверяет main раз в минуту и выкатывает после зелёных проверок."
deployment=""
until [ -n "$deployment" ]; do
  deployment=$(gh api "repos/$repo/deployments?sha=$sha&environment=production&per_page=1" --jq '.[0].id // empty')
  if [ -z "$deployment" ]; then
    latest=$(gh api "repos/$repo/commits/main" --jq .sha)
    if [ "$latest" != "$sha" ]; then
      echo "В main уже ${latest:0:7}: этот коммит выкатится вместе с ним."
      exit 0
    fi
    [ $SECONDS -lt $deadline ] || { echo "::error::Сервер не забрал коммит за 30 минут"; exit 1; }
    sleep 15
  fi
done

printed=0
while [ $SECONDS -lt $deadline ]; do
  mapfile -t lines < <(gh api "repos/$repo/deployments/$deployment/statuses?per_page=100" --jq 'reverse | .[] | [.created_at, .state, .description] | @tsv')
  for ((i = printed; i < ${#lines[@]}; i++)); do
    IFS=$'\t' read -r time state text <<< "${lines[$i]}"
    echo "$(at "$time")  $text"
  done
  printed=${#lines[@]}
  state=$(cut -f2 <<< "${lines[-1]:-}")
  case "$state" in
    success) echo "Сайт: https://wa-group-sender.bid"; exit 0 ;;
    failure | error) echo "::error::Выкатка не удалась, сервер откатился"; exit 1 ;;
  esac
  sleep 10
done
echo "::error::Выкатка не завершилась за 30 минут"
exit 1
