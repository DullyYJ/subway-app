// s7: 장거리(longDistance)만 있는 응답에서 시내 그래프 진단 경고
// ("버스만으로…못했습니다", "경로없음: 모든 모드가 비었습니다", "정류장 상한 도달")가 붙던 것을 제거.
// warnings 필드(진단)만 바뀌고 경로 계산·결과는 그대로.
const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8');
function rep(a,b){ if(s.split(a).length!==2) throw new Error('anchor: '+a.slice(0,60)); s=s.replace(a,b); }
rep('    if (!out.bus) _warn.push(', '    const _ldOnly = !!out.longDistance && !out.minTime && !out.minTransfer && !out.minWalk && !out.bus;\n    if (!out.bus && !_ldOnly) _warn.push(');
rep('    if (!out.minTime && !out.minTransfer && !out.minWalk && !out.bus)\n      _warn.push(', '    if (!out.minTime && !out.minTransfer && !out.minWalk && !out.bus && !out.longDistance)\n      _warn.push(');
rep('    if (_busDiag.capped)\n      _warn.push(', '    if (_busDiag.capped && !_ldOnly)\n      _warn.push(');
fs.writeFileSync(process.argv[3],s);console.log('ok7');
