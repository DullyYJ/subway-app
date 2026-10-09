#!/bin/bash
# 현재 배포본(route-v2-worker.mjs, ride-eta 포함) → 속도 패치본. 사용: ./make.sh <out.js>
set -e
cd /home/claude/work/deploy/speed
IN=${IN:-/home/claude/work/deploy/route-v2-worker.mjs}
T=$(mktemp -d)
node patch_dijkstra.js $IN $T/a.js
node patch_access.js $T/a.js $T/b.js
node patch_addbus_memo.js $T/b.js $T/c.js
node patch_s3.js $T/c.js $T/c2.js
node patch_ldcache.js $T/c2.js $T/d.js
node patch_warm.js $T/d.js $T/e.js
node patch_btverify.js $T/e.js $T/f0.js
node patch_nearcount.js $T/f0.js $T/f1.js
node patch_restlimit.js $T/f1.js $T/f.js
node patch_ldwarn.js $T/f.js $T/g0.js
node patch_corridor.js $T/g0.js $T/g1.js
node patch_fasttab.js $T/g1.js $T/g2.js
node patch_nexttrain.js $T/g2.js $T/g3.js
node patch_svcboard.js $T/g3.js $T/g.js
node patch_version.js $T/g.js $1
cp $1 $1.chk.mjs && node --check $1.chk.mjs && rm -f $1.chk.mjs
echo built $1 $(wc -c < $1)
