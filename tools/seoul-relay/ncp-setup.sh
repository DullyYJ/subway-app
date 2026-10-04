#!/bin/bash
# 길동무 서울 지하철 릴레이 — 리눅스 서버(NCP 등) 원클릭 설치.
# 사용: curl -fsSL https://raw.githubusercontent.com/DullyYJ/subway-app/main/tools/seoul-relay/ncp-setup.sh | bash
# 물어보는 것 2가지(RELAY_TOKEN, 서울 인증키)만 입력하면 설치 → 점검 → 상시 실행 등록까지 끝낸다.
set -e
[ "$(id -u)" = "0" ] || { echo "root 로 실행하세요."; exit 1; }
DIR=/opt/subway-app
echo "== 1/5 Node.js, git 설치"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v git >/dev/null 2>&1 || apt-get install -y git
echo "== 2/5 프로그램 내려받기"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone --depth 1 https://github.com/DullyYJ/subway-app.git "$DIR"; fi
cd "$DIR/tools/seoul-relay"
echo "== 3/5 설정 (이미 .env 가 있으면 건너뜀)"
if [ ! -s .env ]; then
  # 파이프로 실행돼도 키보드에서 읽도록 /dev/tty 사용
  printf "RELAY_TOKEN (16자 이상, 아무 글자. Cloudflare 에도 같은 값 등록): " > /dev/tty
  read -r TOKEN < /dev/tty
  printf "서울 인증키 (여러 개면 쉼표로 구분): " > /dev/tty
  read -r KEYS < /dev/tty
  [ "${#TOKEN}" -ge 16 ] || { echo "RELAY_TOKEN 이 16자보다 짧습니다. 다시 실행하세요."; exit 1; }
  [ -n "$KEYS" ] || { echo "서울 인증키가 비었습니다. 다시 실행하세요."; exit 1; }
  umask 077
  printf "RELAY_TOKEN=%s\nSEOUL_API_KEYS=%s\n" "$TOKEN" "$KEYS" > .env
fi
echo "== 4/5 점검 (서울 응답 200 과 [정상] 이 나와야 함)"
node relay.js --check || { echo "점검 실패 — 위 메시지를 알려주세요. (서울 서버가 이 서버 IP 를 막았을 수 있음)"; exit 1; }
echo "== 5/5 상시 실행 등록"
cat > /etc/systemd/system/gildongmu-relay.service <<UNIT
[Unit]
Description=Gildongmu Seoul subway relay
After=network-online.target
Wants=network-online.target
[Service]
WorkingDirectory=$DIR/tools/seoul-relay
ExecStart=$(command -v node) relay.js
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now gildongmu-relay
sleep 6
systemctl is-active gildongmu-relay && echo "완료: 릴레이가 켜져 있고 서버가 재부팅돼도 자동으로 다시 켜집니다."
journalctl -u gildongmu-relay -n 5 --no-pager || true
