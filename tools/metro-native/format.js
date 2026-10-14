// 길동무 네이티브 노선도 데이터(metro_native.bin) 형식 — 쓰기(build.js)와 읽기(참조 구현, 시험용)가 같은 파일을 쓴다.
// 자바 쪽 파서(native/MetroMapData.java)는 이 형식을 그대로 읽는다. 형식을 바꾸면 세 곳(여기·자바·시험)을 같이 바꾼다.
//
// 전체를 gzip 으로 감싼다. 안쪽은 little-endian:
//   'GMN1'
//   f32 svgW, f32 svgH, u32 bgARGB
//   u32 nStr; { u16 len; utf8 }...                          ← 문자열 표
//   u32 nShape; { u32 nCmd; u32 nCoord; u8 cmd[nCmd]; f32 coord[nCoord] }...
//        cmd 0=M(2) 1=L(2) 2=C(6) 3=Z(0).  H·V 는 L 로 바꿔 둔다.  모든 좌표는 절대 좌표(SVG 단위)
//   u16 nClip; u32 clipShape[nClip]                           ← 클립 번호 → 도형 번호 (op 의 clip 이 이 표의 번호)
//   u32 nOp; { u8 kind; i16 clip; f32 x0,y0,x1,y1 ; ...kind별... }...      ← 그리는 순서 = SVG 문서 순서
//        kind 0 도형: u32 shape; u8 flags(1=변환 2=채움 4=선 8=evenodd 16=둥근끝); [f32 m[6] a b c d e f]; [u32 fill]; [u32 stroke; f32 width]; u8 nDash; f32 dash[]
//        kind 1 글리프: u32 shape; f32 x,y; u32 fill
//        kind 2 라벨(역명): u32 nameStr; i32 altStr(-1=없음); f32 tx,ty,tw,th; u16 nInst; { u32 shape; f32 x,y; u32 fill; u8 isEn }...
//   u8 nFilter; { u32 nameStr; u8 state[nOp] }...      ← 호선 필터별 각 도형의 보임 상태(0=숨김, 1~255=불투명도). 앱의 gmFilterLine 결과를 그대로 기록한 것
'use strict';
const zlib = require('zlib');

class W {
  constructor() { this.parts = []; this.n = 0; }
  _push(b) { this.parts.push(b); this.n += b.length; }
  u8(v) { const b = Buffer.alloc(1); b.writeUInt8(v & 255); this._push(b); }
  u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v); this._push(b); }
  i16(v) { const b = Buffer.alloc(2); b.writeInt16LE(v); this._push(b); }
  u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); this._push(b); }
  i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v); this._push(b); }
  f32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v); this._push(b); }
  bytes(b) { this._push(Buffer.from(b)); }
  str(s) { const b = Buffer.from(s, 'utf8'); this.u16(b.length); this._push(b); }
  done() { return Buffer.concat(this.parts); }
}

function encode(m) {
  const w = new W();
  w.bytes(Buffer.from('GMN1'));
  w.f32(m.svgW); w.f32(m.svgH); w.u32(m.bg >>> 0);
  w.u32(m.strings.length); m.strings.forEach(s => w.str(s));
  w.u32(m.shapes.length);
  for (const sh of m.shapes) {
    w.u32(sh.cmd.length); w.u32(sh.coord.length);
    w.bytes(Buffer.from(sh.cmd));
    const fb = Buffer.alloc(sh.coord.length * 4); sh.coord.forEach((v, i) => fb.writeFloatLE(v, i * 4)); w._push(fb);
  }
  w.u16(m.clips.length); m.clips.forEach(i => w.u32(i));
  w.u32(m.ops.length);
  for (const o of m.ops) {
    w.u8(o.kind); w.i16(o.clip); w.f32(o.bbox[0]); w.f32(o.bbox[1]); w.f32(o.bbox[2]); w.f32(o.bbox[3]);
    if (o.kind === 0) {
      w.u32(o.shape);
      const flags = (o.m ? 1 : 0) | (o.fill != null ? 2 : 0) | (o.stroke != null ? 4 : 0) | (o.evenodd ? 8 : 0) | (o.round ? 16 : 0);
      w.u8(flags);
      if (o.m) o.m.forEach(v => w.f32(v));
      if (o.fill != null) w.u32(o.fill);
      if (o.stroke != null) { w.u32(o.stroke); w.f32(o.sw); }
      w.u8(o.dash.length); o.dash.forEach(v => w.f32(v));
    } else if (o.kind === 1) {
      w.u32(o.shape); w.f32(o.x); w.f32(o.y); w.u32(o.fill);
    } else {
      w.u32(o.name); w.i32(o.alt); o.tb.forEach(v => w.f32(v));
      w.u16(o.inst.length);
      for (const it of o.inst) { w.u32(it.shape); w.f32(it.x); w.f32(it.y); w.u32(it.fill); w.u8(it.en ? 1 : 0); }
    }
  }
  w.u8(m.filters.length);
  for (const f of m.filters) { w.u32(f.name); w.bytes(Buffer.from(f.state)); }
  return zlib.gzipSync(w.done(), { level: 9 });
}

function decode(gz) {
  const buf = zlib.gunzipSync(gz);
  let p = 0;
  const u8 = () => buf.readUInt8(p++), u16 = () => { const v = buf.readUInt16LE(p); p += 2; return v; };
  const i16 = () => { const v = buf.readInt16LE(p); p += 2; return v; };
  const u32 = () => { const v = buf.readUInt32LE(p); p += 4; return v; };
  const i32 = () => { const v = buf.readInt32LE(p); p += 4; return v; };
  const f32 = () => { const v = buf.readFloatLE(p); p += 4; return v; };
  if (buf.toString('latin1', 0, 4) !== 'GMN1') throw new Error('bad magic'); p = 4;
  const m = { svgW: f32(), svgH: f32(), bg: u32(), strings: [], shapes: [], clips: [], ops: [], filters: [] };
  let n = u32();
  for (let i = 0; i < n; i++) { const l = u16(); m.strings.push(buf.toString('utf8', p, p + l)); p += l; }
  n = u32();
  for (let i = 0; i < n; i++) {
    const nc = u32(), nf = u32(); const cmd = Array.from(buf.subarray(p, p + nc)); p += nc;
    const coord = new Array(nf); for (let k = 0; k < nf; k++) coord[k] = f32();
    m.shapes.push({ cmd, coord });
  }
  n = u16(); m.clips = []; for (let i = 0; i < n; i++) m.clips.push(u32());
  n = u32();
  for (let i = 0; i < n; i++) {
    const o = { kind: u8(), clip: i16(), bbox: [f32(), f32(), f32(), f32()] };
    if (o.kind === 0) {
      o.shape = u32(); const fl = u8(); o.evenodd = !!(fl & 8); o.round = !!(fl & 16);
      o.m = (fl & 1) ? [f32(), f32(), f32(), f32(), f32(), f32()] : null;
      o.fill = (fl & 2) ? u32() : null;
      if (fl & 4) { o.stroke = u32(); o.sw = f32(); } else o.stroke = null;
      const nd = u8(); o.dash = []; for (let k = 0; k < nd; k++) o.dash.push(f32());
    } else if (o.kind === 1) { o.shape = u32(); o.x = f32(); o.y = f32(); o.fill = u32(); }
    else { o.name = u32(); o.alt = i32(); o.tb = [f32(), f32(), f32(), f32()]; const ni = u16(); o.inst = []; for (let k = 0; k < ni; k++) o.inst.push({ shape: u32(), x: f32(), y: f32(), fill: u32(), en: !!u8() }); }
    m.ops.push(o);
  }
  n = u8();
  for (let i = 0; i < n; i++) { const nm = u32(); m.filters.push({ name: nm, state: Array.from(buf.subarray(p, p + m.ops.length)) }); p += m.ops.length; }
  if (p !== buf.length) throw new Error('trailing bytes ' + (buf.length - p));
  return m;
}
module.exports = { encode, decode };
