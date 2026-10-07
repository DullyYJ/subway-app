#!/bin/bash
# 현재 배포본(route-v2-worker.mjs, ride-eta 포함) → 속도 패치본. 사용: ./make.sh <out.js>
set -e
cd /home/claude/work/deploy/speed
IN=${IN:-/home/claude/work/deploy/route-v2-worker.mjs}
T=$(mktemp -d)
node patch_dijkstra.js $IN $T/a.js
node patch_access.js $T/a.js $T/b.js
node patch_addbus_memo.js $T/b.js $T/c.js
node patch_version.js $T/c.js $1
cp $1 $1.chk.mjs && node --check $1.chk.mjs && rm -f $1.chk.mjs
echo built $1 $(wc -c < $1)
