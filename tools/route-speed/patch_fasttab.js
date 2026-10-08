// s9: '최단시간' 탭이 다른 탭(지하철·버스·직행)보다 오래 걸리는 역전 수정.
//  원인: minTime 탐색은 환승당 480초(XPEN.minTime)·도보 가중 1.6배를 얹은 '가중 비용'으로 경로를 고른다.
//        그래서 실제 시간은 47분이지만 환승 1회라 가중 비용이 55(=47+8)인 경로가, 환승 없는 52분 경로에 밀려
//        최단시간 탭에는 52분이 뜨고 지하철 탭에는 47분이 뜨는 일이 생겼다(서울역→수원 등).
//  기존 후처리는 minTransfer·minWalk 만 비교했다. 같은 규칙(실제 총시간이 엄격히 더 짧으면 교체)을
//  subway·bus·direct 후보까지 넓힌다. 동률이면 기존 minTime 유지 → 역전이 없던 입력은 결과가 그대로다.
const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8');
const a='for (const _k of ["minTransfer", "minWalk"]) {\n        const _c = out[_k];';
if(s.split(a).length!==2)throw new Error('fasttab anchor');
s=s.replace(a,'for (const _k of ["minTransfer", "minWalk", "subway", "bus", "direct"]) {\n        const _c = out[_k];');
fs.writeFileSync(process.argv[3],s);console.log('ok-fasttab');

// s10: 장거리(longDistance) 경로가 '최소환승' 탭으로 들어가는 경우의 역전 수정.
//  buildAppResponse 는 장거리 경로를 fast 탭으로는 "8분/8% 이상 빠를 때만" 올리고, less 탭으로는 환승이 적고
//  1.25배+5분 이내면 올린다. 그래서 less 탭(예: 175분)이 fast 탭(181분)보다 짧은 역전이 생길 수 있었다.
//  최종 탭 경로가 정해진 뒤, fast 보다 실제 총시간이 엄격히 짧은 탭이 있으면 fast 를 그 경로로 교체한다(동률은 유지).
{
  let t=fs.readFileSync(process.argv[3],'utf8');
  const b1='  add(_fastR, 3, "fast");\n  let _lessR = result.minTransfer;';
  const b2='  add(_lessR, 3, "less");\n';
  if(t.split(b1).length!==2||t.split(b2).length!==2)throw new Error('fasttab2 anchor');
  t=t.replace(b1,'  let _lessR = result.minTransfer;');
  t=t.replace(b2,
'  try {\n'+
'    for (const _r of [_lessR, result.minWalk, result.subway, result.bus, result.direct]) {\n'+
'      if (_r && typeof _r.totalMin === "number" && _fastR && typeof _fastR.totalMin === "number" && _r.totalMin < _fastR.totalMin) _fastR = _r;\n'+
'    }\n'+
'  } catch (e) {\n'+
'  }\n'+
'  add(_fastR, 3, "fast");\n'+
'  add(_lessR, 3, "less");\n');
  fs.writeFileSync(process.argv[3],t);console.log('ok-fasttab2');
}
