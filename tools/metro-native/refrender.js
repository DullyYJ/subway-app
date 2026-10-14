// 참조 렌더러(브라우저 Canvas2D) — 자바 MetroMapView 가 하는 일을 그대로 한 번 더 구현한 것이다.
//   목적: ① 데이터(metro_native.bin)가 원본 SVG 와 같은 그림이 되는지 픽셀로 확인, ② 자바 그리기 규칙의 기준.
//   자바와 같은 규칙: 문서 순서대로 그리기 · 필터 상태 0=건너뜀/1~255=불투명도 · 클립은 save/clip/restore · 영문 글자(en)는 lod 일 때 숨김.
//   브라우저 페이지 안에서 실행되도록 순수 함수 하나로 둔다(함수 본문을 문자열로 넘겨 쓴다).
'use strict';
function drawModel(ctx, M, o) {
  // o: { scale(화면px/SVG단위), ox, oy(화면 왼쪽 위에 오는 SVG 좌표), w, h(화면 px), filter(이름), lod(true 면 영문 숨김), only(op 번호 범위) }
  const fi = Math.max(0, M.filters.findIndex(f => M.strings[f.name] === (o.filter || 'ALL')));
  const st = M.filters[fi].state;
  const argb = (c) => 'rgba(' + ((c >>> 16) & 255) + ',' + ((c >>> 8) & 255) + ',' + (c & 255) + ',' + (((c >>> 24) & 255) / 255) + ')';
  const cache = new Array(M.shapes.length);
  const P = (i) => cache[i] || (cache[i] = (() => { const s = M.shapes[i], p = new Path2D(); let k = 0; for (const c of s.cmd) { if (c === 0) { p.moveTo(s.coord[k], s.coord[k + 1]); k += 2; } else if (c === 1) { p.lineTo(s.coord[k], s.coord[k + 1]); k += 2; } else if (c === 2) { p.bezierCurveTo(s.coord[k], s.coord[k + 1], s.coord[k + 2], s.coord[k + 3], s.coord[k + 4], s.coord[k + 5]); k += 6; } else p.closePath(); } return p; })());
  ctx.save();
  ctx.fillStyle = argb(M.bg); ctx.fillRect(0, 0, o.w, o.h);
  ctx.scale(o.scale, o.scale); ctx.translate(-o.ox, -o.oy);
  const vx0 = o.ox, vy0 = o.oy, vx1 = o.ox + o.w / o.scale, vy1 = o.oy + o.h / o.scale;
  let drawn = 0;
  for (let i = 0; i < M.ops.length; i++) {
    const op = M.ops[i], s = st[i];
    if (!s) continue;
    const b = op.bbox; if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue;   // 화면 밖은 건너뜀(자바도 같음)
    ctx.save();
    if (op.clip >= 0) ctx.clip(P(M.clips[op.clip]));
    if (s !== 255) ctx.globalAlpha = s / 255;
    if (op.kind === 0) {
      if (op.m) ctx.transform(op.m[0], op.m[1], op.m[2], op.m[3], op.m[4], op.m[5]);
      const p = P(op.shape);
      if (op.fill != null) { ctx.fillStyle = argb(op.fill); ctx.fill(p, op.evenodd ? 'evenodd' : 'nonzero'); }
      if (op.stroke != null) { ctx.strokeStyle = argb(op.stroke); ctx.lineWidth = op.sw; ctx.lineCap = op.round ? 'round' : 'butt'; ctx.lineJoin = 'miter'; ctx.miterLimit = 4; ctx.setLineDash(op.dash); ctx.stroke(p); ctx.setLineDash([]); }
    } else if (op.kind === 1) {
      ctx.translate(op.x, op.y); ctx.fillStyle = argb(op.fill); ctx.fill(P(op.shape));
    } else {
      for (const it of op.inst) { if (it.en && o.lod) continue; ctx.save(); ctx.translate(it.x, it.y); ctx.fillStyle = argb(it.fill); ctx.fill(P(it.shape)); ctx.restore(); }
    }
    ctx.restore(); drawn++;
  }
  ctx.restore();
  return drawn;
}
module.exports = { drawModel };
