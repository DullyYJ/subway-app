package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import static com.dullyyj.subway.SceneUtil.*;

import java.util.ArrayList;
import java.util.List;

/**
 * 지하철 객실 장면 — 혼잡도 카드를 옆으로 밀면 보이는 두 번째 쪽 (2026-10-26, YJ: "길동무 친구들이 지하철을 타고 이동하는 장면 ·
 * 이동 중이면 이동하는 배경 · 정지하면 일부가 랜덤으로 내리고 타는 애니메이션").
 *
 * ★ 원칙: "계산은 엔진이, 그림은 앱이".
 *   · 누가 타고 있다가 어느 역에서 내리고 타는지 · 역 이름 · 말풍선 글은 엔진(sceneTrain)이 정해 준다(res.train).
 *   · 지금 달리는 중인지 서 있는지 · 언제 닿고 언제 출발하는지는 탑승 엔진이 정한 시각표(pos.segs: from·to·a(닿는 시각)·t0(출발)·t1(다음 역에 닿는 시각))다.
 *     앱은 그 시각표와 지금 시각을 받아 그 순간의 그림을 그리기만 한다. 모든 움직임은 '지금 시각'의 함수라서, 이 쪽을 중간에 열어도 그 순간의 장면이 바로 나온다.
 *   · 이 파일은 시각표를 해석하지 않는다 — 구간(달림/섬)을 고르고 거기에 맞춰 그리는 일뿐이다.
 */
final class SceneTrain {
    private SceneTrain() {}

    static final class Seg { int from, to; double a, t0, t1; }
    /** 한 번의 정차에서 한 친구의 모습 */
    static final class Pax { int ci; double x, y, z; int dir = 1; boolean sit, nap, walking, behind; double alpha = 1, walkT; String say = ""; }

    static final class St {
        SceneModel.Train T; final List<Seg> segs = new ArrayList<>(); boolean posOk;
        double nowMs; boolean clocked;
        double scroll, v = 1, sway, acc, vPrev;
        int seed;
        // 현재 구간
        boolean stop; int k = -1, toK = -1; double e, dwell, el, rem, dur;
        double shift;            // 승강장 가로 이동(화면 px; 도착 때는 음수에서 0으로, 출발 때는 0에서 양수로)
        boolean platform;
        // 자리
        double[] spotX = new double[6], spotY = new double[6]; boolean[] spotSit = new boolean[6]; int[] spotOf = new int[6];
        // 그림 틀(장면 좌표)
        double ceilB, winT, winB, floorLine, benchBack, seatY, laneY, platFeet, doorW, sillY;
        double[] doorX = new double[2];
        int nTrip;
    }

    // ═══ 준비 ═══
    static void setup(SceneCore s) {
        St old = s.tr; St z = new St(); s.tr = z; z.T = s.res.train;
        if (old != null) { z.segs.addAll(old.segs); z.posOk = old.posOk; z.nowMs = old.nowMs; z.scroll = old.scroll; }          // 크기가 바뀌어 다시 만들어도 시각표·시계는 이어서
        if (z.T == null) z.T = new SceneModel.Train();
        double W = s.W, H = s.H;
        z.ceilB = Math.round(H * .085); z.winT = Math.round(H * .125); z.winB = Math.round(H * .435); z.benchBack = Math.round(H * .475); z.seatY = Math.round(H * .62);
        z.floorLine = Math.round(H * .765); z.laneY = Math.round(H * .90); z.platFeet = Math.round(H * .72); z.sillY = z.floorLine;
        z.doorW = Math.round(W * .165); z.doorX[0] = Math.round(W * .30); z.doorX[1] = Math.round(W * .70);
        StringBuilder sb = new StringBuilder(); for (String n : z.T.names) sb.append(n).append('|');
        z.seed = (sb.toString() + s.res.hero + z.T.first).hashCode();
        // 자리: 앉는 자리 4 · 서는 자리 2 (한 번 정하면 이 여정 내내 같은 친구가 같은 자리)
        double[] sx = { .12, .43, .57, .88, .50, .24 }; boolean[] sit = { true, true, true, true, false, false };
        double[] sy = { z.seatY + 12, z.seatY + 12, z.seatY + 12, z.seatY + 12, H * .93, H * .86 };
        for (int i = 0; i < 6; i++) { z.spotX[i] = Math.round(W * sx[i]); z.spotSit[i] = sit[i]; z.spotY[i] = Math.round(sy[i]); }
        // 대표 캐릭터는 가운데 앉는 자리. 나머지는 시드로 섞는다
        List<Integer> order = new ArrayList<>(); for (int i = 0; i < 6; i++) order.add(i);
        java.util.Random rr = new java.util.Random(z.seed * 31L + 7); java.util.Collections.shuffle(order, rr);
        int hi = indexOfId(s.res.hero); int[] spotOf = new int[6]; java.util.Arrays.fill(spotOf, -1);
        if (hi >= 0) { spotOf[hi] = 1; order.remove(Integer.valueOf(1)); }
        for (int c = 0; c < 6; c++) if (spotOf[c] < 0) spotOf[c] = order.remove(0);
        z.spotOf = spotOf;
        if (old == null) z.nowMs = System.currentTimeMillis();
    }
    /** 같은 여정의 새 엔진 값이 왔다: 친구·역이 같으면 값만 바꾸고(자리·움직임은 그대로), 다른 여정이면 처음부터 다시 만든다. */
    static void refresh(SceneCore s) {
        St z = s.tr; SceneModel.Train n = s.res.train;
        if (z == null || n == null) { setup(s); return; }
        boolean same = z.T != null && z.T.first == n.first && z.T.names.equals(n.names) && z.T.init == n.init;
        if (same) z.T = n; else setup(s);
    }
    static int indexOfId(String id) { for (int i = 0; i < SceneModel.ORDER.length; i++) if (SceneModel.ORDER[i].equals(id)) return i; return -1; }

    // ═══ 바깥에서 받는 값 ═══
    /** 탑승 엔진의 위치 글({from,to,t0,t1,segs:[{from,to,a,t0,t1}…]}). 없거나 이상하면 시각표 없이 계속 달리는 그림. */
    @SuppressWarnings("unchecked")
    static void feedPos(SceneCore s, String json) {
        if (s.tr == null) return;
        St z = s.tr; z.segs.clear(); z.posOk = false;
        if (json == null || json.length() < 4) return;
        Object o = SceneModel.Json.parse(json);
        if (!(o instanceof java.util.Map)) return;
        Object so = ((java.util.Map<String, Object>) o).get("segs");
        if (!(so instanceof List)) return;
        for (Object x : (List<Object>) so) {
            if (!(x instanceof java.util.Map)) continue;
            java.util.Map<String, Object> m = (java.util.Map<String, Object>) x;
            if (!(m.get("from") instanceof Number) || !(m.get("to") instanceof Number) || !(m.get("a") instanceof Number) || !(m.get("t0") instanceof Number) || !(m.get("t1") instanceof Number)) continue;
            Seg g = new Seg(); g.from = ((Number) m.get("from")).intValue(); g.to = ((Number) m.get("to")).intValue();
            g.a = ((Number) m.get("a")).doubleValue(); g.t0 = ((Number) m.get("t0")).doubleValue(); g.t1 = ((Number) m.get("t1")).doubleValue();
            if (g.t1 > g.t0 && g.t0 >= g.a) z.segs.add(g);
        }
        z.posOk = !z.segs.isEmpty();
    }
    static void feedClock(SceneCore s, long nowMs) { if (s.tr == null) return; s.tr.nowMs = nowMs; s.tr.clocked = true; }

    // ═══ 구간 고르기 (시각표 + 지금 시각 → 달림/섬) ═══
    static final double K_SPEED = .42;      // 가장 빠를 때 초당 움직이는 거리(장면 폭 배수)
    static void phase(SceneCore s, St z) {
        double now = z.nowMs; z.stop = false; z.k = -1; z.toK = -1; z.e = 0; z.dwell = 1e9; z.el = 0; z.rem = 0; z.dur = 0; z.platform = false; z.shift = 0;
        if (!z.posOk) { z.v = 1; return; }
        Seg cur = null; for (Seg g : z.segs) if (now < g.t1) { cur = g; break; }
        if (cur == null) { Seg l = z.segs.get(z.segs.size() - 1); z.stop = true; z.k = l.to - z.T.first; z.e = Math.max(0, (now - l.t1) / 1000); z.dwell = 1e9; z.v = 0; z.platform = true; return; }
        if (now < cur.t0) { z.stop = true; z.k = cur.from - z.T.first; z.e = Math.max(0, (now - cur.a) / 1000); z.dwell = Math.max(1, (cur.t0 - cur.a) / 1000); z.v = 0; z.platform = true; return; }
        z.el = (now - cur.t0) / 1000; z.rem = (cur.t1 - now) / 1000; z.dur = (cur.t1 - cur.t0) / 1000; z.k = cur.from - z.T.first; z.toK = cur.to - z.T.first;
        double ta = Math.min(7, z.dur * .25), td = Math.min(8, z.dur * .3);
        z.v = clamp(Math.min(1, Math.min(z.el / Math.max(.1, ta), z.rem / Math.max(.1, td))), 0, 1);
        double Wd = s.W * K_SPEED;
        double dd = z.el < ta ? z.el * z.el / (2 * ta) : ta / 2 + (z.el - ta);
        double rr = z.rem < td ? z.rem * z.rem / (2 * td) : td / 2 + (z.rem - td);
        z.shift = z.el <= z.rem ? dd * Wd : -rr * Wd;
        z.platform = true;      // 보이는지는 그릴 때 범위로 정한다
    }

    // ═══ 한 걸음 ═══
    static void step(SceneCore s, double dt) {
        St z = s.tr; if (z == null) return;
        if (!z.clocked) z.nowMs += dt * 1000;      // 시계를 받지 못하면 스스로 센다
        z.clocked = false;
        phase(s, z);
        double K = s.W * K_SPEED;
        z.scroll += z.v * dt * K;
        double tgt = clamp((z.v - z.vPrev) / Math.max(dt, .001), -1.2, 1.2);
        z.acc = z.acc * .9 + tgt * .1; z.vPrev = z.v;
        z.sway = Math.sin(s.t * 1.6) * .03 - z.acc * .05;
    }

    // ═══ 친구 한 명의 그 순간 모습 ═══
    static double ease(double u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
    static int h(int a, int b) { int x = a * 73856093 ^ b * 19349663; x ^= x >>> 13; x *= 0x5bd1e995; x ^= x >>> 15; return x & 0x7fffffff; }

    /** 정차 중(또는 마침) 친구 ci 의 모습. 없으면 null. */
    static Pax paxAt(SceneCore s, St z, int ci, int k, double e, double dwell) {
        SceneModel.Train T = z.T; double W = s.W, H = s.H;
        int[] sp = (k >= 0 && k < T.stops.size()) ? T.stops.get(k) : new int[] { T.init, 0, 0 };
        int before = sp[0], out = sp[1], in = sp[2], b = 1 << ci;
        boolean isIn = (before & b) != 0, isOut = (out & b) != 0, isBoard = (in & b) != 0;
        Pax p = new Pax(); p.ci = ci; int spot = z.spotOf[ci];
        double sx = z.spotX[spot], sy = z.spotY[spot]; boolean sitSpot = z.spotSit[spot];
        double sc = clamp(H / 190.0, .8, 1.2);
        if (!isOut && !isBoard) {
            if (!isIn) return null;
            fillIdle(s, z, p, sx, sy, sitSpot, sc); return p;
        }
        // 문 열림 시간표
        double tOpen = Math.min(1.1, dwell * .1), tClose = dwell >= 1e8 ? 1e9 : dwell - Math.min(3.2, dwell * .2);
        double win = tClose >= 1e8 ? 30 : Math.max(2.5, tClose - tOpen - 1.0);
        int idx = 0, cnt = 0;                         // 나와 같은 일을 하는 친구들 중 내 순번
        for (int c = 0; c < 6; c++) { int bb = 1 << c; boolean same = isOut ? (out & bb) != 0 : (in & bb) != 0; if (same) { if (c < ci) idx++; cnt++; } }
        int hs = h(z.seed + k, ci);
        double f = 1.0;                               // 정차가 짧으면 모두 서두른다
        double need = 6.5 + 1.4 * Math.max(0, cnt - 1) + (isOut ? 0 : 0); if (need > win) f = clamp(win / need, .35, 1);
        double d0 = tOpen + 0.7 * f + idx * 1.5 * f + (hs % 60) / 100.0 * f;                 // 내 시작 시각
        double doorFoot = z.floorLine + 3;
        double dxd = z.doorX[Math.abs(sx - z.doorX[0]) <= Math.abs(sx - z.doorX[1]) ? 0 : 1];
        double laneJ = ((hs >> 8) % 11 - 5);             // 문 앞에서 몸이 겹치지 않게 조금씩 어긋난다
        double walkSp = 34 * W / 208.0;                  // 장면 px/초
        double dh = Math.abs(sx + laneJ - dxd), tW = Math.max(.4, dh / walkSp) * f;
        double tCross = 0.9 * f, tPlat = 2.3 * f, tSit = .35 * f, tStand = sitSpot ? .35 * f : 0;
        int pdir = (hs >> 4) % 2 == 0 ? 1 : -1;
        double platX0 = dxd, scLane = 1.0 * sc, scPlat = .6 * sc;
        double ty = sy;
        if (isOut) {
            double u = e - d0;
            if (u < 0) { fillIdle(s, z, p, sx, sy, sitSpot, sc); return p; }
            if (u < tStand) { p.x = sx; p.y = sy; p.z = scLane; p.dir = sx < dxd ? 1 : -1; p.sit = false; p.walking = false; p.say = ""; return p; }
            u -= tStand;
            double ly = Math.max(sy, z.laneY - 4);
            if (u < tW) { double q = ease(u / tW); p.x = lerp(sx, dxd + laneJ, q); p.y = lerp(sy, ly, Math.min(1, q * 2)); p.z = scLane; p.dir = (dxd + laneJ) >= sx ? 1 : -1; p.walking = true; p.walkT = u; p.say = hs % 3 == 0 && u < 1.6 * f ? pick(T.sayOut, hs) : ""; return p; }
            u -= tW;
            if (u < tCross) {
                double q = ease(u / tCross); p.x = lerp(dxd + laneJ, dxd, q); p.y = lerp(ly, z.platFeet, q); p.z = lerp(scLane, scPlat, q); p.dir = 1; p.walking = true; p.walkT = u + tW;
                p.behind = p.y < doorFoot - 2; p.say = ""; return p;
            }
            u -= tCross;
            if (u < tPlat) { double q = u / tPlat; p.x = dxd + pdir * q * z.doorW * .9; p.y = z.platFeet; p.z = scPlat; p.dir = pdir; p.walking = true; p.walkT = u + tW + tCross; p.behind = true; p.alpha = q > .75 ? 1 - (q - .75) / .25 : 1; return p; }
            return null;
        }
        // 타는 친구
        double u = e - d0;
        double total = tPlat * .6 + tCross + tW + tSit;
        if (u < 0) return null;
        double tIn = tPlat * .6;
        if (u < tIn) { double q = u / tIn; p.x = dxd - pdir * (1 - q) * z.doorW * .9; p.y = z.platFeet; p.z = scPlat; p.dir = pdir; p.walking = true; p.walkT = u; p.behind = true; p.alpha = Math.min(1, q * 4); p.dir = (dxd - p.x) * pdir >= 0 ? pdir : -pdir; p.dir = pdir; return p; }
        u -= tIn;
        double ly = Math.max(sy, z.laneY - 4);
        if (u < tCross) { double q = ease(u / tCross); p.x = lerp(dxd, dxd + laneJ, q); p.y = lerp(z.platFeet, ly, q); p.z = lerp(scPlat, scLane, q); p.dir = 1; p.walking = true; p.walkT = u + tIn; p.behind = p.y < doorFoot - 2; p.say = hs % 3 == 0 ? pick(T.sayIn, hs) : ""; return p; }
        u -= tCross;
        if (u < tW) { double q = ease(u / tW); p.x = lerp(dxd + laneJ, sx, q); p.y = lerp(ly, sy, Math.max(0, (q - .4) / .6)); p.z = scLane; p.dir = sx >= dxd + laneJ ? 1 : -1; p.walking = true; p.walkT = u + tIn + tCross; return p; }
        fillIdle(s, z, p, sx, sy, sitSpot, sc);
        return p;
    }
    static String pick(List<String> l, int hs) { return l == null || l.isEmpty() ? "" : l.get((hs >> 3) % l.size()); }
    static double lerp(double a, double b, double u) { return a + (b - a) * u; }
    static void fillIdle(SceneCore s, St z, Pax p, double sx, double sy, boolean sit, double sc) {
        p.x = sx; p.y = sy; p.z = sc; p.sit = sit; p.dir = sx < s.W / 2 ? 1 : -1; p.walking = false;
        int ci = p.ci;
        // 앉은 친구는 가끔 꾸벅 존다(40초 단위로 정한 시드)
        long bucket = (long) (z.nowMs / 40000.0);
        p.nap = sit && h((int) bucket, ci + 11) % 100 < 22;
        p.alpha = 1;
    }

    // ═══ 그리기 ═══
    static void draw(SceneCore s, SceneCv c) {
        St z = s.tr; if (z == null) return;
        double W = s.W, H = s.H;
        SceneModel.Train T = z.T; int lineCol = SceneArt.lineColor(T.line);
        boolean night = s.L.night;
        // 바탕: 객실 벽
        c.fillStyle("#1a1e29"); c.fillRect(0, 0, W, H);
        // 천장
        SceneCv.Grad ceil = c.linear(0, 0, 0, z.ceilB + 6).stop(0, css("#d9dee6")).stop(1, css("#b9c0cc")); c.fillGrad(ceil); c.fillRect(3, 3, W - 6, z.ceilB + 3);
        c.fillStyle("#fff9d8"); for (double lx = 14; lx < W - 14; lx += 46) { rr(c, lx, 5, 30, 3.2, 1.6); c.fill(); }
        // 벽(창 위·아래)
        SceneCv.Grad wall = c.linear(0, z.ceilB, 0, z.floorLine).stop(0, css("#e7ebf1")).stop(1, css("#c7cfdb")); c.fillGrad(wall); c.fillRect(3, z.ceilB + 3, W - 6, z.floorLine - z.ceilB - 3);
        // 창·문 구멍 모양
        double[][] holes = holes(z, W);
        // ── 바깥 풍경(터널 또는 승강장): 구멍 모양으로 잘라서 보여준다 ──
        c.save(); c.beginPath(); for (double[] r : holes) c.rect(r[0], r[1], r[2], r[3]); c.clip();
        drawOutside(s, z, c, W, H);
        // 유리 반사
        c.fillStyle("rgba(255,255,255,.08)"); for (double[] r : holes) { c.beginPath(); c.moveTo(r[0] + 5, r[1]); c.lineTo(r[0] + 14, r[1]); c.lineTo(r[0] + 2, r[1] + r[3]); c.lineTo(r[0] - 7, r[1] + r[3]); c.closePath(); c.fill(); }
        // 플랫폼 쪽에 있는 친구(문 구멍 안에서만 보인다)
        double[] doorHole0 = holes[2], doorHole1 = holes[5];
        double[][] dh = { doorHole0, doorHole1 };
        List<Pax> paxes = allPax(s, z);
        c.restore();
        for (int d = 0; d < 2; d++) {
            c.save(); c.beginPath(); c.rect(dh[d][0], dh[d][1], dh[d][2], dh[d][3]); c.clip();
            for (Pax p : paxes) if (p.behind && nearestDoor(z, p.x) == d) drawPax(s, c, p);
            c.restore();
        }
        // 문짝
        double open = doorOpen(z);
        for (int d = 0; d < 2; d++) drawDoor(s, z, c, dh[d], open, lineCol);
        // 창틀
        c.strokeStyle("#8c95a6"); c.lineWidth(1.6); for (double[] r : holes) { rr(c, r[0], r[1], r[2], r[3], 2.5); c.stroke(); }
        // 의자(창 아래 긴 의자 세 토막)
        drawBench(s, z, c, W, lineCol);
        // 바닥
        SceneCv.Grad fl = c.linear(0, z.floorLine, 0, H).stop(0, css("#8c93a1")).stop(1, css("#5c6270")); c.fillGrad(fl); c.fillRect(3, z.floorLine, W - 6, H - z.floorLine - 3);
        c.fillStyle("rgba(0,0,0,.18)"); c.fillRect(3, z.floorLine, W - 6, 1.6);
        // 손잡이 봉
        c.fillStyle("#cfd4de"); c.fillRect(8, z.ceilB + 12, W - 16, 2.2); c.fillStyle("rgba(0,0,0,.2)"); c.fillRect(8, z.ceilB + 14.2, W - 16, .9);
        double[] hx = { .08, .20, .40, .50, .60, .80, .92 };
        for (double q : hx) {
            double x = W * q; c.save(); c.translate(x, z.ceilB + 14); c.rotate(z.sway * (q < .5 ? 1 : .85));
            c.strokeStyle("#4b5263"); c.lineWidth(1.2); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 15); c.stroke();
            c.strokeStyle("#ffb347"); c.lineWidth(1.8); c.beginPath(); c.arc(0, 19, 4, 0, PI2); c.stroke(); c.restore();
        }
        // 문 옆 기둥
        c.fillStyle("#d4d9e3"); for (int d = 0; d < 2; d++) { c.fillRect(z.doorX[d] - z.doorW / 2 - 4, z.ceilB + 6, 2.2, z.floorLine - z.ceilB - 5); c.fillRect(z.doorX[d] + z.doorW / 2 + 2, z.ceilB + 6, 2.2, z.floorLine - z.ceilB - 5); }
        // 안내 표시(문 위 가운데): 다음 역 / 이번 역
        drawLed(s, z, c, W, lineCol);
        // 안쪽 친구들
        List<Pax> inner = new ArrayList<>(); for (Pax p : paxes) if (!p.behind) inner.add(p);
        java.util.Collections.sort(inner, new java.util.Comparator<Pax>() { public int compare(Pax a, Pax b) { return Double.compare(a.y, b.y); } });
        for (Pax p : inner) drawPax(s, c, p);
        for (Pax p : inner) if (!p.say.isEmpty()) SceneArt.drawBubble(c, p.x + p.dir * 4, p.y - 50 * p.z, p.say);
        s.drawParts(c, s.dtLast);
        // 흔들림에 맞춘 조명 번쩍임(달리는 동안 가끔 불빛이 훑고 지나간다)
        if (z.v > .5) { double q = (z.scroll / 160.0) % 1; if (q < .12) { c.fillStyle(rgba(255, 255, 230, .06 * (1 - q / .12))); c.fillRect(3, z.ceilB, W - 6, z.floorLine - z.ceilB); } }
        // 바깥 틀(차체 테두리)
        c.strokeStyle("#2a2f3b"); c.lineWidth(3); rr(c, 1.5, 1.5, W - 3, H - 3, 9); c.stroke();
        if (night) { c.fillStyle("rgba(6,10,30,.05)"); c.fillRect(0, 0, W, H); }
    }

    static double[][] holes(St z, double W) {
        double[][] r = new double[7][];
        double wt = z.winT, wh = z.winB - z.winT, dw = z.doorW, dt = z.ceilB + 6, dhh = z.floorLine - dt;
        double x1 = z.doorX[0] - dw / 2, x2 = z.doorX[0] + dw / 2, x3 = z.doorX[1] - dw / 2, x4 = z.doorX[1] + dw / 2;
        r[0] = new double[] { 8, wt, x1 - 13 - 8, wh };                               // 왼쪽 창
        r[1] = new double[] { x2 + 7, wt, x3 - 7 - x2 - 7, wh };                      // 가운데 창
        r[2] = new double[] { x1, dt, dw, dhh };                                      // 문 1
        r[3] = new double[] { x4 + 13, wt, W - 8 - x4 - 13, wh };                     // 오른쪽 창
        r[4] = new double[] { x2 + 7 + 0, wt, 0, 0 };                                 // 자리 표시(미사용)
        r[5] = new double[] { x3, dt, dw, dhh };                                      // 문 2
        r[6] = new double[] { x1 - 13, wt, 0, 0 };
        // 창 배열을 앞의 순서대로 쓰도록 크기 0 인 칸은 그리지 않게 정리
        java.util.ArrayList<double[]> l = new java.util.ArrayList<>(); for (double[] q : r) l.add(q);
        double[][] o = new double[7][]; for (int i = 0; i < 7; i++) o[i] = l.get(i); return o;
    }
    static int nearestDoor(St z, double x) { return Math.abs(x - z.doorX[0]) <= Math.abs(x - z.doorX[1]) ? 0 : 1; }

    static double doorOpen(St z) {
        if (!z.stop) return 0;
        double tOpen = Math.min(1.1, z.dwell * .1), tClose = z.dwell >= 1e8 ? 1e9 : z.dwell - Math.min(3.2, z.dwell * .2);
        if (z.e < .4) return 0;
        if (z.e < .4 + tOpen) return ease((z.e - .4) / tOpen);
        if (z.e < tClose) return 1;
        if (z.e < tClose + 1.2) return 1 - ease((z.e - tClose) / 1.2);
        return 0;
    }

    static List<Pax> allPax(SceneCore s, St z) {
        List<Pax> l = new ArrayList<>();
        int k = z.stop ? z.k : z.toK;       // 달리는 동안은 '다음 역에 닿기 직전' 타고 있는 친구들
        double e = z.stop ? z.e : -1, dwell = z.stop ? z.dwell : 1e9;
        if (!z.stop && z.k >= 0 && z.k < z.T.stops.size()) {          // 달리는 중: 직전 정차(k)가 끝난 뒤의 명단 = 다음 역(toK)의 '직전 명단'
            k = z.toK;
        }
        for (int ci = 0; ci < 6; ci++) {
            Pax p;
            if (z.stop) p = paxAt(s, z, ci, k, e, dwell);
            else {      // 달림: 다음 역에 닿기 직전의 명단 그대로 앉아 있다
                int[] sp = (k >= 0 && k < z.T.stops.size()) ? z.T.stops.get(k) : new int[] { z.T.init, 0, 0 };
                if ((sp[0] & (1 << ci)) == 0) continue;
                p = new Pax(); p.ci = ci; fillIdle(s, z, p, z.spotX[z.spotOf[ci]], z.spotY[z.spotOf[ci]], z.spotSit[z.spotOf[ci]], clamp(s.H / 190.0, .8, 1.2));
            }
            if (p != null) l.add(p);
        }
        return l;
    }

    static void drawOutside(SceneCore s, St z, SceneCv c, double W, double H) {
        double top = z.ceilB, bot = z.floorLine;
        // 터널
        SceneCv.Grad tn = c.linear(0, top, 0, bot).stop(0, css("#0a0e18")).stop(1, css("#1b2332")); c.fillGrad(tn); c.fillRect(0, top, W, bot - top);
        double sp = z.scroll;
        // 케이블(느리게) — 가로줄
        c.strokeStyle("rgba(120,140,170,.35)"); c.lineWidth(1);
        for (int i = 0; i < 3; i++) { double y = top + (bot - top) * (.22 + i * .09); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
        // 벽 이음매(중간 속도)
        c.strokeStyle("rgba(150,165,190,.22)"); c.lineWidth(1.6);
        double per = 54, off = (sp * .6) % per; for (double x = off - per; x < W + per; x += per) { c.beginPath(); c.moveTo(x, top); c.lineTo(x, bot); c.stroke(); }
        // 터널 등(가장 빠르게) — 번쩍 지나가는 불빛
        double lp = 92, lo = (sp * 1.1) % lp;
        for (double x = lo - lp; x < W + lp; x += lp) {
            SceneCv.Grad lg = c.radial(x, top + 20, 0, x, top + 20, 26).stop(0, rgba(255, 238, 180, .55)).stop(1, rgba(255, 238, 180, 0)); c.fillGrad(lg); c.fillRect(x - 26, top - 6, 52, 52);
            c.fillStyle("#fff2b8"); c.fillRect(x - 6, top + 17, 12, 3);
        }
        // 승강장
        double sh = z.shift, E = W * 1.3 + sh, S = E - W * 2.5;
        if (E > 0 && S < W) {
            double x0 = Math.max(0, S), x1 = Math.min(W, E);
            c.save(); c.beginPath(); c.rect(x0, top, x1 - x0, bot - top); c.clip();
            // 타일 벽
            SceneCv.Grad tw = c.linear(0, top, 0, bot).stop(0, css("#dfe5ee")).stop(1, css("#bcc6d6")); c.fillGrad(tw); c.fillRect(x0, top, x1 - x0, bot - top);
            c.strokeStyle("rgba(110,125,150,.28)"); c.lineWidth(.8);
            double ty = (bot - top) * .62; for (double y = top + 8; y < top + ty; y += 14) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); }
            double tper = 16, to = ((sh % tper) + tper) % tper; for (double x = x0 - tper + to - (x0 % tper); x < x1 + tper; x += tper) { c.beginPath(); c.moveTo(x, top); c.lineTo(x, top + ty); c.stroke(); }
            // 기둥(세계 좌표: 0.5W 마다)
            double pw = 7; for (int j = -3; j <= 6; j++) {
                double px = W * (.5 * j) + sh;
                if (px + pw < x0 - 2 || px - pw > x1 + 2) continue;
                SceneCv.Grad pg = c.linear(px - pw, 0, px + pw, 0).stop(0, css("#a9b3c4")).stop(.5, css("#d7dde8")).stop(1, css("#8e99ac")); c.fillGrad(pg); c.fillRect(px - pw / 2, top, pw, bot - top);
            }
            // 역 이름판(기둥 사이 가운데: 세계 좌표 0.25W + W*j)
            String nm = stationNameForSign(z);
            if (!nm.isEmpty()) for (int j = -2; j <= 3; j++) {
                double px = W * (.5 + j) * 1.0 + sh + 0; if (j != 0 && j != -1 && j != 1) { }
                double cx = W * (.25 + .5 * j * 2) + sh;
                if (cx + 40 < x0 || cx - 40 > x1) continue;
                c.fillStyle("#15213a"); rr(c, cx - 30, z.winT + 2, 60, 17, 3); c.fill(); c.fillStyle("#ffffff"); c.font(10); c.fillTextC(nm, cx + 5, z.winT + 10.5);
                int lc = SceneArt.lineColor(z.T.line); c.fillStyle(lc); c.beginPath(); c.arc(cx - 21, z.winT + 10.5, 5.6, 0, PI2); c.fill(); c.fillStyle("#fff"); c.font(7); c.fillTextC(z.T.line, cx - 21, z.winT + 10.2);
            }
            // 승강장 바닥 + 안전선
            SceneCv.Grad pf = c.linear(0, top + ty, 0, bot).stop(0, css("#a7b0c0")).stop(1, css("#8892a4")); c.fillGrad(pf); c.fillRect(x0, top + ty, x1 - x0, bot - top - ty);
            c.fillStyle("#f2c94c"); c.fillRect(x0, bot - 5, x1 - x0, 2.2);
            // 기다리는 사람 그림자(작은 실루엣, 세계 좌표 고정)
            int[] hs = { 17, 29, 43, 58, 71 };
            for (int j = 0; j < 12; j++) {
                int hh = h(z.seed, j + 5); if (hh % 3 == 0) continue;
                double px = W * (-.9 + j * .30) + sh + (hh % 20) - 10;
                if (px < x0 - 8 || px > x1 + 8) continue;
                double fy = z.platFeet - 2 - (hh >> 5) % 6;
                boolean nearDoor = Math.abs(px - z.doorX[0]) < z.doorW * .5 + 6 || Math.abs(px - z.doorX[1]) < z.doorW * .5 + 6;
                if (nearDoor && z.stop) continue;      // 문 앞은 비워 둔다(타고 내리는 자리)
                int col = hh % 2 == 0 ? css("#59647a") : css("#7a6c86"); c.fillStyle(col);
                c.beginPath(); c.arc(px, fy - 20, 3.2, 0, PI2); c.fill(); rr(c, px - 4, fy - 17, 8, 15, 3); c.fill();
            }
            c.restore();
        }
    }
    static String stationNameForSign(St z) {
        int k = z.stop ? z.k : z.toK; if (k < 0 || k >= z.T.names.size()) return "";
        return z.T.names.get(k);
    }

    static void drawDoor(SceneCore s, St z, SceneCv c, double[] r, double open, int lineCol) {
        double lw = r[2] / 2, vis = lw * (1 - open * .9);
        for (int side = 0; side < 2; side++) {
            double x = side == 0 ? r[0] : r[0] + r[2] - vis;
            c.fillStyle("#c8cfdb"); c.fillRect(x, r[1], vis, r[3]);
            c.fillStyle("rgba(160,200,235,.30)"); c.fillRect(x + 2, r[1] + 3, Math.max(0, vis - 4), r[3] * .56);
            c.fillStyle("rgba(0,0,0,.14)"); c.fillRect(x, r[1] + r[3] * .62, vis, 1.4);
            c.strokeStyle("#8f99ab"); c.lineWidth(1); c.beginPath(); c.rect(x + .5, r[1] + .5, Math.max(0, vis - 1), r[3] - 1); c.stroke();
        }
        // 문 위 표시등: 열리고 닫히는 동안 깜박인다
        double cx = r[0] + r[2] / 2; boolean blink = z.stop && ((z.e < 1.6) || (z.dwell < 1e8 && z.e > z.dwell - 3.4)) && ((int) Math.floor(s.t * 4) % 2 == 0);
        c.fillStyle(blink ? "#ff4a3d" : "#5a2220"); c.beginPath(); c.arc(cx, r[1] - 2.4, 2.1, 0, PI2); c.fill();
    }
    static void drawBench(SceneCore s, St z, SceneCv c, double W, int lineCol) {
        int sc = mix(lineCol, css("#8a8f9c"), .62), dk = shade(sc, -.22);
        double dw = z.doorW, x1 = z.doorX[0] - dw / 2 - 9, x2 = z.doorX[0] + dw / 2 + 9, x3 = z.doorX[1] - dw / 2 - 9, x4 = z.doorX[1] + dw / 2 + 9;
        double[][] seg = { { 8, x1 }, { x2, x3 }, { x4, W - 8 } };
        for (double[] sgm : seg) {
            double a = sgm[0], b = sgm[1]; if (b - a < 12) continue;
            c.fillStyle(dk); rr(c, a, z.benchBack, b - a, z.seatY - z.benchBack, 4); c.fill();
            c.fillStyle(sc); rr(c, a + 2, z.benchBack + 2, b - a - 4, (z.seatY - z.benchBack) * .55, 3); c.fill();
            c.fillStyle(dk); rr(c, a - 1, z.seatY, b - a + 2, (z.floorLine - z.seatY) * .42, 3); c.fill();
            c.fillStyle(sc); rr(c, a, z.seatY, b - a, (z.floorLine - z.seatY) * .26, 3); c.fill();
        }
    }
    static void drawLed(SceneCore s, St z, SceneCv c, double W, int lineCol) {
        String nm = z.T.names.isEmpty() ? "" : "";
        int k = z.stop ? z.k : z.toK; boolean here = z.stop;
        if (k >= 0 && k < z.T.names.size()) nm = z.T.names.get(k);
        String lab = here ? z.T.lbHere : z.T.lbNext;
        if (nm.isEmpty() || lab == null) { return; }
        String txt = lab + "  " + nm;
        double w = Math.max(70, (W * .5)), x = W * .5 - w / 2, y = 4.4, hgt = 11.5;
        c.fillStyle("#0c0f16"); rr(c, x, y, w, hgt, 3); c.fill();
        c.fillStyle(lineCol); c.beginPath(); c.arc(x + 8, y + hgt / 2, 4.4, 0, PI2); c.fill(); c.fillStyle("#fff"); c.font(6.4); c.fillTextC(z.T.line, x + 8, y + hgt / 2 - .2);
        c.fillStyle("#ffb347"); c.font(7.6); c.fillTextC(txt, x + w / 2 + 6, y + hgt / 2 - .1);
    }

    // ═══ 친구 그리기 (SceneCore.drawActor 와 같은 시트·칸 규칙) ═══
    static void drawPax(SceneCore s, SceneCv c, Pax p) {
        String id = SceneModel.ORDER[p.ci]; SceneModel.Spec D = SceneModel.D3.get(id);
        SceneCv.Img sheet = s.host.sheet(id), psh = (p.sit || p.nap) ? s.host.sheet(id + "_pose") : null;
        if (sheet == null) return;
        double bodyH = (D.base - 8) / 256 * D.cell + D.lift * .6, kk = Math.min(.8, SceneCore.TH / bodyH), zz = p.z, sct = kk * zz, sc = D.cell / 256 * sct;
        int idx;
        if (psh != null) { sheet = psh; idx = p.nap ? 1 : 0; }
        else if (p.walking) idx = (int) Math.floorMod((long) Math.floor(p.walkT * D.fps * .9), 16L);
        else idx = SceneModel.stand(id);
        double bob = p.walking ? Math.sin(p.walkT * 9) * .5 * zz : Math.sin(s.t * 1.8 + p.ci) * .5 * zz;
        double lift = D.lift * zz * zz;
        double sx = (idx % 4) * 256, sy = Math.floor(idx / 4) * 256, dx = -D.ox * sc, dy = -D.base * sc - lift + bob;
        c.save(); c.globalAlpha(clamp(p.alpha, 0, 1));
        c.fillStyle(rgba(0, 0, 0, .28)); c.beginPath(); c.ellipse(p.x, p.y + 1, D.cell * sct * .2, 2.8 * zz, 0, 0, PI2); c.fill();
        c.translate(p.x, p.y); if (p.dir < 0) c.scale(-1, 1);
        double lean = p.sit ? 0 : clamp(-s.tr.acc * .04, -.1, .1); if (lean != 0) c.rotate(lean);
        c.drawImage(sheet, sx, sy, 256, 256, dx, dy, D.cell * sct, D.cell * sct);
        c.restore();
        if (p.nap && p.alpha > .5 && s.R.next() < s.dtLast * .7) s.ptx("zzz", p.x + 8, p.y - 38 * zz, 1, SceneCore.po().a(-1.2, -.9).s(5, 9).g(-8).l(.9, 1.4).jx(2));
    }
}
