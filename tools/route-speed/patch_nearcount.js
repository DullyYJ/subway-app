// s6: 캐시(mem/KV/tile) 경로에서 busDiag.nearRoutes가 0으로 나와 "2.5km 안 버스 노선 없음" 경고가 잘못 뜨던 문제 수정.
// 라우팅 결과(rows)는 건드리지 않는다. 진단값(nearRoutes)과 warnings 만 D1 경로와 같게 만든다.
const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8');
const a1='var BT_SQL = ';
const a2='    nearRoutes: _nearKeySet ? _nearKeySet.size : 0,';
if(s.split(a1).length!==2||s.split(a2).length!==2)throw new Error('nearcount anchors');
s=s.replace(a1,`function btNearCount(rows, SY, SX, EY, EX, NEAR) {
  var ks = {}, n = 0;
  var y0 = SY - NEAR, y1 = SY + NEAR, x0 = SX - NEAR, x1 = SX + NEAR, y2 = EY - NEAR, y3 = EY + NEAR, x2 = EX - NEAR, x3 = EX + NEAR;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], la = r.lat, ln = r.lng;
    if (ks[r.route_key]) continue;
    if (la >= y0 && la <= y1 && ln >= x0 && ln <= x1 || la >= y2 && la <= y3 && ln >= x2 && ln <= x3) {
      ks[r.route_key] = 1;
      if (++n >= 600) break;
    }
  }
  return n;
}
__name(btNearCount, "btNearCount");
`+a1);
s=s.replace(a2,'    nearRoutes: _nearKeySet ? _nearKeySet.size : _cached || _kvHit ? btNearCount(rows, SY, SX, EY, EX, NEAR_BOX) : 0,');
fs.writeFileSync(process.argv[3],s);console.log('ok6');
