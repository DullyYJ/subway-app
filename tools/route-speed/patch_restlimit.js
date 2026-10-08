// s6: D1 경로에서 rest 행을 slice(0, MAX_STOPS - near행수)로 자른 뒤 dedupe 해서,
// near+rest 합집합이 30000 미만이어도 일부 정류장이 조용히 빠지던 문제 수정.
// 이제 rest 전체를 순회하며 아직 안 본 행만 추가하고, 총 행 수가 MAX_STOPS 에 닿으면 멈춘다.
const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8');
const a='    if (restLimit > 0 && !_rr.e) pushRows((_rr.q && _rr.q.results || []).slice(0, restLimit));';
if(s.split(a).length!==2)throw new Error('restlimit anchor');
s=s.replace(a,`    if (restLimit > 0 && !_rr.e) {
      const _rl = _rr.q && _rr.q.results || [];
      for (let _ri = 0; _ri < _rl.length && rows.length < MAX_STOPS; _ri++) {
        const _r = _rl[_ri], _k = _r.route_key + "|" + _r.seq;
        if (seenRow[_k]) continue;
        seenRow[_k] = 1;
        rows.push(_r);
      }
    }`);
fs.writeFileSync(process.argv[3],s);console.log('ok-rl');
