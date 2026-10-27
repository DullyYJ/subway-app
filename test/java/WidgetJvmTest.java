package com.dullyyj.subway;

import java.awt.*;
import java.awt.geom.AffineTransform;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.HashMap;
import java.util.Map;
import javax.imageio.ImageIO;

/**
 * 캐릭터 시계 위젯의 '안드로이드와 상관없는' 부분(WidgetGeo·WidgetSim·WidgetArt)을 JVM 에서 돌려 보는 시험 도구.
 *   java WidgetJvmTest check
 *   java WidgetJvmTest render <sheetsDir(png)> <out.png> <h|v> <W> <H> <seed> <seconds> <normal|cheer|comfort|warn> <dark|light> [ids,comma]
 */
public class WidgetJvmTest {
    static int fails = 0;
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (!c) fails++; }

    static class AwtSurface implements WidgetArt.Surface {
        final Graphics2D g; final Map<String, BufferedImage> sheets; final float S;
        final java.util.ArrayDeque<AffineTransform> stack = new java.util.ArrayDeque<AffineTransform>();
        AwtSurface(Graphics2D g, Map<String, BufferedImage> sheets, float S) { this.g = g; this.sheets = sheets; this.S = S; g.scale(S, S); }
        public void save() { stack.push(g.getTransform()); }
        public void restore() { g.setTransform(stack.pop()); }
        public void translate(float x, float y) { g.translate(x, y); }
        public void rotate(float deg) { g.rotate(Math.toRadians(deg)); }
        public void scale(float sx, float sy) { g.scale(sx, sy); }
        public void cell(String id, int frame, float l, float t, float r, float b, float alpha) {
            BufferedImage im = sheets.get(id); if (im == null) return;
            int sx = (frame % 4) * 256, sy = (frame / 4) * 256;
            AffineTransform at = g.getTransform();
            g.translate(l, t); g.scale((r - l) / 256f, (b - t) / 256f);
            g.drawImage(im.getSubimage(sx, sy, 256, 256), 0, 0, null);
            g.setTransform(at);
        }
        void argb(int c) { g.setColor(new Color(c, true)); }
        public void ellipse(float cx, float cy, float rx, float ry, int argb) { argb(argb); g.fill(new java.awt.geom.Ellipse2D.Float(cx - rx, cy - ry, rx * 2, ry * 2)); }
        public void circle(float cx, float cy, float r, int argb) { ellipse(cx, cy, r, r, argb); }
        public void poly(float[] xy, int argb) { argb(argb); g.fill(path(xy)); }
        Path2D.Float path(float[] xy) { Path2D.Float p = new Path2D.Float(); p.moveTo(xy[0], xy[1]); for (int i = 2; i < xy.length; i += 2) p.lineTo(xy[i], xy[i + 1]); p.closePath(); return p; }
        public void polyGrad(float[] xy, float y0, float y1, int c0, int c1) { Paint old = g.getPaint(); g.setPaint(new GradientPaint(0f, y0, new Color(c0, true), 0f, Math.max(y1, y0 + 0.5f), new Color(c1, true))); g.fill(path(xy)); g.setPaint(old); }
    }

    static final String[] ALL = WidgetSim.ORDER;
    static boolean fin(float v) { return !Float.isNaN(v) && !Float.isInfinite(v); }

    static void check() {
        float[][] sizes = { { 230f, 90f }, { 180f, 80f }, { 300f, 100f }, { 360f, 160f }, { 170f, 210f }, { 130f, 250f }, { 160f, 320f } };
        for (float[] sz : sizes) {
            boolean v = sz[1] > sz[0];
            WidgetGeo g = WidgetGeo.of(v, sz[0], sz[1]);
            String tag = (v ? "세로 " : "가로 ") + (int) sz[0] + "x" + (int) sz[1];
            ok(g.clkL >= 0 && g.clkR() <= g.W && g.clkT >= g.charH + 3.9f && g.clkB() <= g.H, tag + ": 시계 상자가 위젯 안, 위에 캐릭터가 올라설 여유(" + g.clkT + " >= " + g.charH + ")");
            ok(g.clkW >= (v ? g.W * 0.38f : g.W * 0.45f) || g.clkH >= g.H * 0.40f, tag + ": 시계가 위젯 칸에 크게 들어찬다(" + g.clkW + "x" + g.clkH + " / " + g.W + "x" + g.H + ")");
            WidgetGeo gc = WidgetGeo.of(v, sz[0], sz[1]); gc.setCommute(true);
            ok(gc.textDp <= g.textDp && gc.clkW <= g.clkW, tag + ": 출퇴근 장면에서 시계는 커지지 않는다(" + g.textDp + "→" + gc.textDp + ")");
            ok(gc.textDp > gc.bubTs && gc.bubTs > gc.btnTs && gc.btnTs >= 8f, tag + ": 글자 크기 순서 시계 > 말풍선 > 버튼(" + gc.textDp + " > " + gc.bubTs + " > " + gc.btnTs + ")");
            ok(gc.btnH >= 24f && gc.btnH >= gc.btnTs * 2f, tag + ": 버튼이 글자에 비례해 넉넉하다(h=" + gc.btnH + ")");
            ok(Math.abs(gc.bubH - gc.bubbleHeight()) < 0.01f, tag + ": 말풍선 상자 높이는 글 줄 수만큼만(" + gc.bubLines + "줄 → " + gc.bubH + ")");
            if (v) {
                float need = gc.charH * 0.25f + 8f + gc.bubH + WidgetGeo.GAP + gc.btnH + WidgetGeo.MARGIN_B, room = gc.H - (gc.charH + 4f) - gc.clkH;
                ok(room + 0.5f >= need || gc.textDp <= 14.01f, tag + ": (출퇴근) 시계 아래 자리가 말풍선·버튼에 충분(" + room + " >= " + need + ")");
                float spare = room - need;
                ok(spare <= 0.30f * gc.textDp + 12f || gc.textDp >= g.textDp - 0.01f, tag + ": 시계는 필요한 만큼만 줄어든다(남는 자리 " + spare + ")");
            }
            // 말풍선 글이 길어 줄이 늘면 상자는 그만큼 커지고 시계는 더 줄어든다(넘치지 않는다)
            WidgetGeo g1 = WidgetGeo.of(v, sz[0], sz[1]); g1.setCommute(true, 1);
            WidgetGeo g4 = WidgetGeo.of(v, sz[0], sz[1]); g4.setCommute(true, 4);
            ok(g4.bubH > g1.bubH && g4.textDp <= g1.textDp + 0.01f && g4.btnT + g4.btnH <= g4.H && g4.bubT >= 0, tag + ": 말풍선 줄 수가 늘면 상자가 커지고 위젯 밖으로 안 나간다(" + g1.bubH + "→" + g4.bubH + ")");
            ok(gc.bubL >= 0 && gc.bubL + gc.bubW <= gc.W + 0.01f && gc.btnL >= 0 && gc.btnL + gc.btnW <= gc.W + 0.01f && gc.btnT + gc.btnH <= gc.H && gc.bubT + gc.bubH <= gc.btnT + 0.01f, tag + ": (출퇴근) 말풍선·버튼이 위젯 안에서 겹치지 않음");
            ok(Math.abs(gc.btnW - gc.bubW) < 0.01f && Math.abs(gc.btnL - gc.bubL) < 0.01f, tag + ": (출퇴근) 버튼 폭이 말풍선 폭과 같다(" + gc.btnW + " vs " + gc.bubW + ")");
            ok(gc.bubH >= gc.bubLines * gc.bubTs && gc.bubW >= 60f, tag + ": (출퇴근) 말풍선이 글을 담을 만큼 크다(" + gc.bubW + "x" + gc.bubH + ")");
            ok(gc.clkT + gc.clkH <= gc.H, tag + ": (출퇴근) 줄어든 시계도 위젯 안");
            if (v) ok(gc.bubT >= gc.clkB() + gc.charH * 0.25f, tag + ": 말풍선이 줄 선 캐릭터 아래");
            else ok(gc.bubL >= gc.clkR() + 10f, tag + ": 말풍선이 시계 오른쪽");
            ok(g.stageY >= g.clkT && g.stageY <= g.ground, tag + ": 줄 서는 높이가 시계 앞~바닥");
            // 긴 시간 시뮬(시드 3개) — 범위·상태 다양성
            int[] seen = new int[WidgetSim.ST_NAME.length]; boolean allFinite = true, inBounds = true; int maxPoops = 0; boolean dogPoop = false;
            for (long seed = 1; seed <= 3; seed++) {
                WidgetSim s = new WidgetSim(g, seed, new String[] { "dolsom", "lovel", "sul" });
                for (int i = 0; i < 6000; i++) {
                    s.step(0.1f);
                    maxPoops = Math.max(maxPoops, s.poops.size());
                    for (WidgetSim.Ch c : s.cs) {
                        seen[c.st]++;
                        if (!(fin(c.x) && fin(c.y) && fin(c.off) && fin(c.rot) && fin(c.sq))) allFinite = false;
                        float hw = g.charH * 0.55f;
                        if (c.x < hw * 0.5f - 0.01f || c.x > g.W - hw * 0.5f + 0.01f || c.y - c.off - g.charH < -3f || c.y > g.H + 0.5f) { inBounds = false; }
                        if (c.st == WidgetSim.POOP && c.id.equals("dolsom")) dogPoop = true;
                    }
                }
            }
            ok(allFinite, tag + ": 모든 값이 유한");
            ok(inBounds, tag + ": 캐릭터가 위젯 밖으로 나가지 않는다(머리 끝 포함)");
            boolean climb = seen[WidgetSim.TOP_WALK] > 0 || seen[WidgetSim.TOP_REST] > 0;
            ok(seen[WidgetSim.WALK] > 0 && seen[WidgetSim.REST] > 0 && seen[WidgetSim.HOP] > 0, tag + ": 걷기·쉬기·콩콩이 다 나온다");
            ok(climb && seen[WidgetSim.JUMP] > 0, tag + ": 시계에 뛰어올라 시계 위를 걷고 쉰다");
            ok(seen[WidgetSim.HANG] > 0, tag + ": 시계 모서리에 매달린다");
            ok(dogPoop && maxPoops >= 1 && maxPoops <= 3, tag + ": 강아지가 응가를 하고 최대 3개만 남는다(" + maxPoops + ")");
            // 출퇴근
            for (String mood : new String[] { "cheer", "comfort", "warn" }) {
                WidgetSim s = new WidgetSim(g, 7, new String[] { "dolsom", "lovel", "sul" });
                for (int i = 0; i < 300; i++) s.step(0.1f);
                float clkW0 = g.clkW; g.setCommute(true);
                ok(g.clkW <= clkW0, tag + ": 출퇴근 장면에서 시계는 커지지 않는다(" + clkW0 + "→" + g.clkW + ")");
                s.setMode(WidgetSim.COMMUTE, mood);
                for (int i = 0; i < 150; i++) s.step(0.1f);
                boolean all = true, nearSlot = true;
                for (int i = 0; i < s.cs.size(); i++) {
                    WidgetSim.Ch c = s.cs.get(i);
                    if (c.st != WidgetSim.CHEER || c.zone != 0) all = false;
                    float slot = g.stageL + g.stageW * ((i + 0.5f) / s.cs.size());
                    if (Math.abs(c.x - Math.max(g.charH * 0.55f * 0.85f, Math.min(g.W - g.charH * 0.55f * 0.85f, slot))) > 1.5f || Math.abs(c.y - g.stageY) > 0.6f) nearSlot = false;
                }
                ok(all && nearSlot, tag + ": 출퇴근(" + mood + ") 모두 시계 앞 자리에 줄을 서서 응원");
                // 말풍선과 캐릭터가 겹치지 않는다(세로: 캐릭터 머리~발이 말풍선 위, 가로: 캐릭터 가로 범위가 말풍선 왼쪽)
                boolean noOverlap = true;
                for (WidgetSim.Ch c : s.cs) {
                    float hw = g.charH * 0.55f;
                    if (v) { if (c.y > g.bubT + 0.5f) noOverlap = false; }
                    else if (c.x + hw * 0.5f > g.bubL + 4f) noOverlap = false;
                }
                ok(noOverlap, tag + ": 줄 선 캐릭터가 말풍선을 가리지 않는다(" + mood + ")");
                g.setCommute(false);
                s.setMode(WidgetSim.NORMAL, mood);
                for (int i = 0; i < 100; i++) s.step(0.1f);
                boolean back = false; for (WidgetSim.Ch c : s.cs) if (c.st != WidgetSim.CHEER) back = true;
                ok(back, tag + ": 출퇴근이 끝나면 다시 놀러 다닌다");
            }
            // 매달리거나 시계 위에 있는 중에 출퇴근이 시작돼도 내려와 줄을 선다
            WidgetSim s2 = new WidgetSim(g, 11, new String[] { "dolsom", "lovel", "dudung" });
            boolean mid = false;
            for (int i = 0; i < 20000 && !mid; i++) { s2.step(0.05f); for (WidgetSim.Ch c : s2.cs) if (c.zone != 0) mid = true; }
            g.setCommute(true);
            s2.setMode(WidgetSim.COMMUTE, "cheer");
            for (int i = 0; i < 240; i++) s2.step(0.05f);
            boolean all2 = true; for (WidgetSim.Ch c : s2.cs) if (c.st != WidgetSim.CHEER || c.zone != 0) all2 = false;
            g.setCommute(false);
            ok(mid && all2, tag + ": 시계 위·매달린 중에 출퇴근이 시작돼도 내려와 줄을 선다");
            // 멈추기: 하던 동작을 마치고 바닥에서 쉰다
            WidgetSim s3 = new WidgetSim(g, 5, new String[] { "ppopu", "sul" });
            for (int i = 0; i < 400; i++) s3.step(0.1f);
            s3.requestSettle(); int n = 0; while (!s3.isSettled() && n < 600) { s3.step(0.1f); n++; }
            ok(s3.isSettled() && n < 600, tag + ": 멈추라고 하면 " + (n / 10f) + "초 안에 바닥에서 쉰다");
            s3.resume();
        }
        // 잠자리: 동물마다 종류에 맞는 집이 무작위 자리에 서서히 생기고, 걸어 들어가 자다가 무작위로 깨어 나온다. 위젯을 만지면 모두 즉시 깨어난다
        for (int sz = 0; sz < 2; sz++) {
            WidgetGeo gs = sz == 0 ? WidgetGeo.of(false, 230f, 90f) : WidgetGeo.of(true, 170f, 210f);
            String tag2 = sz == 0 ? "가로" : "세로";
            String[] six = WidgetSim.ORDER; boolean allKinds = true, noOverlapMostly = true, allSlept = true, hiddenOk = true, wokeRandom = true, housesGone = true, grewSlowly = true; int zs = 0;
            java.util.Set<Integer> xsSeen = new java.util.HashSet<Integer>(), durs = new java.util.HashSet<Integer>(); java.util.Set<String> kinds = new java.util.HashSet<String>();
            for (int trial = 0; trial < 40; trial++) {
                String[] ids = WidgetSim.pickSet(500 + trial, null);
                WidgetSim sl = new WidgetSim(gs, 100 + trial, ids);
                for (int i = 0; i < 200; i++) sl.step(0.1f);
                sl.bed(false);
                if (sl.houses.size() != 3) allKinds = false;
                for (WidgetSim.House h : sl.houses) { kinds.add(h.kind); xsSeen.add(Math.round(h.x)); if (!h.kind.equals(WidgetSim.houseKind(h.owner.id))) allKinds = false; if (h.a != 0f) grewSlowly = false; }
                sl.step(0.1f); for (WidgetSim.House h : sl.houses) if (!(h.a > 0f && h.a < 0.3f)) grewSlowly = false;   // 서서히 생긴다
                int n = 0; while (!sl.allInBed() && n < 400) { sl.step(0.1f); n++; }
                if (!sl.allInBed()) allSlept = false;
                for (WidgetSim.Ch c : sl.cs) { if (Math.abs(c.x - c.home.x) > 0.5f || c.y != gs.ground) allSlept = false; if (WidgetSim.hides(c.home.kind) ? c.alpha > 0.01f : c.alpha < 0.99f) hiddenOk = false; }
                for (int i = 0; i < 20; i++) sl.step(0.1f);
                for (WidgetSim.Ch c : sl.cs) if (c.zz < 0.9f) zs++;
                // 깨어나는 시각은 마리마다 제각각(잠든 순간부터 20~60초 사이)
                float mn = 1e9f, mx = -1f;
                for (WidgetSim.Ch c : sl.cs) { float d = c.until - c.t0; mn = Math.min(mn, d); mx = Math.max(mx, d); durs.add(Math.round(d)); }
                if (mn < 19.9f || mx > 60.1f) wokeRandom = false;
                float t = 0f; while (t < 130f && !sl.allUp()) { sl.step(0.1f); t += 0.1f; }
                if (!sl.allUp()) housesGone = false;
            }
            if (durs.size() < 15) wokeRandom = false;
            ok(allKinds && kinds.size() == 5, tag2 + ": 잠자리: 개집·바구니·굴·둥지·연못이 동물에 맞게 생긴다(" + kinds + ")");
            ok(grewSlowly, tag2 + ": 잠자리: 집이 서서히 나타난다(처음엔 안 보임)");
            ok(xsSeen.size() >= 20, tag2 + ": 잠자리: 집 자리가 매번 무작위다(" + xsSeen.size() + "곳)");
            ok(allSlept && hiddenOk, tag2 + ": 잠자리: 모두 자기 자리까지 걸어가 자는 장면으로 바뀐다(걷던 몸은 사라진다)");
            ok(zs == 0, tag2 + ": 잠자리: 자는 동안 머리 위 zzz 가 진해진다");
            ok(wokeRandom && housesGone, tag2 + ": 잠자리: 마리마다 20~60초 사이 무작위로 깨고 모두 깨면 집이 사라진다");
        }
        {
            WidgetGeo gs = WidgetGeo.of(false, 230f, 90f);
            WidgetSim sl = new WidgetSim(gs, 11, new String[] { "dolsom", "lovel", "sul" });
            for (int i = 0; i < 300; i++) sl.step(0.1f);
            sl.bed(true); int n = 0; while (!sl.allInBed() && n < 400) { sl.step(0.1f); n++; }
            for (int i = 0; i < 1500; i++) sl.step(0.1f);       // 150초 — 깨울 때까지 안 깬다
            ok(sl.allInBed(), "잠자리: '깨울 때까지' 모드에서는 150초가 지나도 자동으로 깨지 않는다");
            final int[] polys = { 0, 0 }; final java.util.List<String> cells = new java.util.ArrayList<String>(); final java.util.List<float[]> cellBox = new java.util.ArrayList<float[]>(); final java.util.List<Integer> cellFr = new java.util.ArrayList<Integer>(); final float[] lastA = { 1f };
            WidgetArt.Surface ps = new WidgetArt.Surface() {
                public void save() {} public void restore() {} public void translate(float x, float y) {} public void rotate(float d) {} public void scale(float x, float y) {}
                public void cell(String id, int f, float l, float t, float r, float bb, float al) { cells.add(id); cellFr.add(f); cellBox.add(new float[] { l, t, r, bb }); lastA[0] = al; }
                public void ellipse(float a1, float a2, float a3, float a4, int c) {} public void circle(float a1, float a2, float a3, int c) {}
                public void poly(float[] xy, int c) { if (xy.length == 20) polys[0]++; }
                public void polyGrad(float[] xy, float y0, float y1, int c0, int c1) { polys[1]++; }
            };
            WidgetArt.draw(sl, ps, false);
            ok(polys[0] == 3 * 2 * 3 && polys[1] == 0, "잠자리: 그림에 Z 가 캐릭터마다 3개씩(그림자+글자) 들어간다(Z " + polys[0] + ") · 예전 벡터 집(그라데이션)은 더 안 그린다(" + polys[1] + ")");
            { boolean allSleepCells = cells.size() == 3, framesOk = true, boxOk = true, mixOk = lastA[0] == 1f;
              for (int i = 0; i < cells.size(); i++) { if (!cells.get(i).endsWith("_sleep")) allSleepCells = false; if (cellFr.get(i) < 0 || cellFr.get(i) > 15) framesOk = false; float[] bx = cellBox.get(i); if (!(bx[2] - bx[0] > sl.geo.charH * 0.8f) || Math.abs((bx[3] - bx[1]) - (bx[2] - bx[0])) > 0.01f || bx[3] < sl.geo.ground) boxOk = false; }
              ok(allSleepCells && framesOk && boxOk && mixOk, "잠자리: 잠든 동안엔 걷는 모습 대신 마리마다 자는 장면 한 칸(<id>_sleep · 프레임 0~15 · 정사각 · 바닥에 닿음)만 그려진다(" + cells + ")");
              java.util.Set<Integer> frs = new java.util.HashSet<Integer>(); for (int i = 0; i < 40; i++) { sl.step(0.1f); cells.clear(); cellFr.clear(); WidgetArt.draw(sl, ps, false); frs.addAll(cellFr); }
              ok(frs.size() >= 12, "잠자리: 자는 동안에도 시간이 가면 프레임이 돌아간다(숨 쉬기·물결 — " + frs.size() + "프레임 사용)"); }
            { boolean fade = true; WidgetSim s2 = new WidgetSim(gs, 55, new String[] { "dolsom", "lovel", "sul" });
              for (int i = 0; i < 200; i++) s2.step(0.1f); s2.bed(false); boolean sawMid = false, charWhileMix = true; int n2 = 0;
              while (!s2.allInBed() && n2 < 400) { s2.step(0.1f); n2++; for (WidgetSim.Ch c : s2.cs) { if (c.mix > 0.05f && c.mix < 0.95f) { sawMid = true; if (Math.abs((c.alpha + c.mix) - 1f) > 0.02f) charWhileMix = false; } } }
              ok(sawMid && charWhileMix, "잠자리: 들어갈 때 걷던 모습은 옅어지고(alpha) 자는 장면은 짙어진다(mix) — 둘의 합이 1 이라 몸이 겹쳐 보이지 않는다"); }
            sl.wakeAll();
            n = 0; while (!sl.allUp() && n < 200) { sl.step(0.1f); n++; }
            boolean walkers = false; for (int i = 0; i < 200; i++) { sl.step(0.1f); for (WidgetSim.Ch c : sl.cs) if (c.st != WidgetSim.REST) walkers = true; }
            polys[0] = 0; WidgetArt.draw(sl, ps, false);
            ok(sl.allUp() && n < 60 && walkers && polys[0] == 0 && sl.houses.isEmpty(), "잠자리: 위젯을 만지면(wakeAll) " + (n / 10f) + "초 안에 모두 깨어나 집이 사라지고 다시 돌아다닌다");
            // 자러 가는 길에 깨워도(집에 닿기 전) 바로 일어난다
            WidgetSim s4 = new WidgetSim(gs, 12, new String[] { "ppopu", "sul", "chaeng" });
            for (int i = 0; i < 100; i++) s4.step(0.1f);
            s4.bed(false); for (int i = 0; i < 3; i++) s4.step(0.1f); s4.wakeAll();
            n = 0; while (!s4.allUp() && n < 200) { s4.step(0.1f); n++; }
            ok(s4.allUp(), "잠자리: 자러 가는 중에 깨워도 곧 모두 일어난다");
            // 출퇴근: 자지 않는다 · 자는 중에 시작돼도 깨어나 줄을 선다
            WidgetGeo gc = WidgetGeo.of(false, 230f, 90f); WidgetSim sc = new WidgetSim(gc, 3, new String[] { "dolsom", "lovel", "sul" });
            gc.setCommute(true); sc.setMode(WidgetSim.COMMUTE, "cheer"); sc.bed(false);
            ok(sc.houses.isEmpty(), "잠자리: 출퇴근 장면에선 집이 안 생기고 자지 않는다");
            gc.setCommute(false);
            sl.setMode(WidgetSim.NORMAL, null); sl.bed(false); for (int i = 0; i < 80; i++) sl.step(0.1f);
            gc.setCommute(true); sl.setMode(WidgetSim.COMMUTE, "cheer");
            for (int i = 0; i < 300; i++) sl.step(0.05f);
            boolean all = true; for (WidgetSim.Ch c : sl.cs) if (c.st != WidgetSim.CHEER || c.alpha < 0.99f) all = false;
            ok(all && sl.houses.isEmpty(), "잠자리: 자는 중에 출퇴근이 시작되면 깨어나 줄을 서고 집은 사라진다");
            gc.setCommute(false);
        }
        // 알람 시각 계산: 정시 기준 N분 칸의 시작·다음 칸(어느 시간대에서도, 반시간 단위 시간대·서머타임 포함)
        {
            String[] zones = { "Asia/Seoul", "Asia/Kolkata", "America/New_York", "Australia/Lord_Howe", "UTC" };
            boolean okAll = true; String why = "";
            for (String zn : zones) {
                java.util.TimeZone tz = java.util.TimeZone.getTimeZone(zn);
                java.util.Calendar c = java.util.Calendar.getInstance(tz); c.clear(); c.set(2026, java.util.Calendar.MARCH, 8, 10, 0, 0);
                long h10 = c.getTimeInMillis();
                boolean a1 = WidgetSim.roamNow(h10, tz, 60, 120000L), a2 = WidgetSim.roamNow(h10 + 119999L, tz, 60, 120000L), a3 = !WidgetSim.roamNow(h10 + 120000L, tz, 60, 120000L), a4 = !WidgetSim.roamNow(h10 + 59 * 60000L + 59000L, tz, 60, 120000L), a5 = !WidgetSim.roamNow(h10 - 1000L, tz, 60, 120000L);
                java.util.Calendar n = java.util.Calendar.getInstance(tz); n.setTimeInMillis(WidgetSim.roamNext(h10 + 30 * 60000L, tz, 60));
                boolean a6 = n.get(java.util.Calendar.MINUTE) == 0 && n.get(java.util.Calendar.SECOND) == 0 && n.get(java.util.Calendar.HOUR_OF_DAY) == 11;
                n.setTimeInMillis(WidgetSim.roamNext(h10, tz, 60)); boolean a7 = n.get(java.util.Calendar.HOUR_OF_DAY) == 11 && n.get(java.util.Calendar.MINUTE) == 0;
                java.util.Calendar s30 = java.util.Calendar.getInstance(tz); s30.setTimeInMillis(WidgetSim.roamPeriodStart(h10 + 41 * 60000L, tz, 30)); boolean a8 = s30.get(java.util.Calendar.MINUTE) == 30 && s30.get(java.util.Calendar.HOUR_OF_DAY) == 10;
                if (!(a1 && a2 && a3 && a4 && a5 && a6 && a7 && a8)) { okAll = false; why += zn + ":" + a1 + a2 + a3 + a4 + a5 + a6 + a7 + a8 + " "; }
            }
            ok(okAll, "알람 시각: 지역 시각 기준 정시 칸의 시작·다음 칸 계산이 맞다(서울·인도·뉴욕·로드하우·UTC) " + why);
        }
        // 자고 있던 동물: 걸어 들어가는 장면 없이 곧장 집에서 자는 모습을 만들 수 있고, 신호(wakeAll)를 받으면 마리마다 무작위로 깨어 나온다
        for (int sz = 0; sz < 2; sz++) {
            WidgetGeo gs = sz == 0 ? WidgetGeo.of(false, 230f, 90f) : WidgetGeo.of(true, 170f, 210f); String tag3 = sz == 0 ? "가로" : "세로";
            boolean asleep = true, sqOk = true, wakeOk = true, upOk = true; java.util.Set<Integer> delays = new java.util.HashSet<Integer>();
            for (int trial = 0; trial < 40; trial++) {
                WidgetSim sl = new WidgetSim(gs, 900 + trial, WidgetSim.pickSet(77 + trial, null));
                sl.asleepNow();
                if (!sl.allInBed() || sl.houses.size() != 3) asleep = false;
                for (WidgetSim.House h : sl.houses) if (h.a != 1f) asleep = false;
                for (WidgetSim.Ch c : sl.cs) { boolean hid = WidgetSim.hides(c.home.kind); if (c.zz != 1f || (hid ? c.alpha != 0f : (c.alpha != 1f || c.sq < 0.2f || c.off <= 0f))) sqOk = false; }
                sl.wakeAll(20f);
                float[] first = new float[sl.cs.size()]; java.util.Arrays.fill(first, -1f); float t = 0f;
                while (t < 40f && !sl.allUp()) { sl.step(0.1f); t += 0.1f; for (int k = 0; k < first.length; k++) if (first[k] < 0f && sl.cs.get(k).st == WidgetSim.REST) first[k] = t; }
                if (!sl.allUp()) upOk = false;
                for (float f : first) { if (f < 0f || f > 22f) wakeOk = false; delays.add(Math.round(f)); }
            }
            ok(asleep && sqOk, tag3 + ": asleepNow: 곧장 모두 집에서 자고 있다(zzz 진하게, 안 보이는 건 안 보임)");
            ok(wakeOk && upOk && delays.size() >= 12, tag3 + ": wakeAll(20): 마리마다 0~20초 사이 무작위로 깨어 나오고 집이 사라진다(깨는 시각 " + delays.size() + "가지)");
        }
        // 화면을 켤 때마다 캐릭터 셋이 바뀐다: 매번 직전과 다른 구성, 서로 다른 3마리, 6마리 모두 골고루 등장
        { String[] cur = WidgetSim.pickSet(1, null); boolean always = true, distinct = true; java.util.Set<String> seenIds = new java.util.HashSet<String>();
          for (int i = 0; i < 300; i++) { String[] nx = WidgetSim.pickSet(1000 + i * 31L, cur); if (WidgetSim.sameSet(nx, cur)) always = false; if (nx.length != 3 || nx[0].equals(nx[1]) || nx[0].equals(nx[2]) || nx[1].equals(nx[2])) distinct = false; for (String x : nx) seenIds.add(x); cur = nx; }
          ok(always, "화면을 켤 때마다 직전과 다른 캐릭터 구성이 나온다(300번)"); ok(distinct && seenIds.size() == WidgetSim.ORDER.length, "서로 다른 3마리, 6마리 모두 골고루 나온다(" + seenIds.size() + "종)"); }
        // 같은 시드 → 같은 결과(결정성)
        WidgetGeo g = WidgetGeo.of(false, 290f, 120f);
        WidgetSim a = new WidgetSim(g, 42, new String[] { "dolsom", "lovel" }), b = new WidgetSim(g, 42, new String[] { "dolsom", "lovel" });
        for (int i = 0; i < 2000; i++) { a.step(0.07f); b.step(0.07f); }
        ok(a.cs.get(0).x == b.cs.get(0).x && a.cs.get(1).st == b.cs.get(1).st && a.poops.size() == b.poops.size(), "같은 시드는 같은 움직임");
        // 그리기 명령: 시뮬이 그림 명령을 만든다(예외 없음, 시트 칸 0~15)
        final int[] cells = { 0 }; final boolean[] badFrame = { false };
        WidgetArt.Surface cnt = new WidgetArt.Surface() {
            public void save() {} public void restore() {} public void translate(float x, float y) {} public void rotate(float d) {} public void scale(float x, float y) {}
            public void cell(String id, int f, float l, float t, float r, float bb, float al) { cells[0]++; if (f < 0 || f > 15) badFrame[0] = true; }
            public void ellipse(float a1, float a2, float a3, float a4, int c) {} public void circle(float a1, float a2, float a3, int c) {} public void poly(float[] xy, int c) {} public void polyGrad(float[] xy, float y0, float y1, int c0, int c1) {}
        };
        for (int i = 0; i < 500; i++) { a.step(0.1f); WidgetArt.draw(a, cnt, i % 2 == 0); }
        ok(cells[0] == 500 * 2 && !badFrame[0], "그림 명령: 프레임마다 캐릭터 수만큼 칸을 그리고 칸 번호가 0~15");
        ok(WidgetSim.roamMs(2) == 120000L && WidgetSim.roamMs(6) == 360000L && WidgetSim.roamMs(10) == 600000L && WidgetSim.roamMs(1) == 360000L && WidgetSim.roamMs(11) == 360000L && WidgetSim.roamMs(0) == 360000L && WidgetSim.roamMs(-5) == 360000L && WidgetSim.ROAM_LEN_MS == 360000L, "돌아다니는 시간: 2~10분은 그대로, 범위 밖·이상한 값은 기본 6분");
        System.out.println(fails == 0 ? "ALL OK" : (fails + " FAIL"));
    }

    static void render(String[] a) throws Exception {
        File dir = new File(a[1]); boolean v = a[3].equals("v"); float W = Float.parseFloat(a[4]), H = Float.parseFloat(a[5]);
        long seed = Long.parseLong(a[6]); float secs = Float.parseFloat(a[7]); String mood = a[8]; boolean dark = a[9].equals("dark");
        String[] ids = a.length > 10 ? a[10].split(",") : new String[] { "dolsom", "lovel", "sul" };
        Map<String, BufferedImage> sheets = new HashMap<String, BufferedImage>();
        for (String id : ALL) { File f = new File(dir, id + ".png"); if (f.exists()) sheets.put(id, ImageIO.read(f)); File f2 = new File(dir, id + "_sleep.png"); if (f2.exists()) sheets.put(id + "_sleep", ImageIO.read(f2)); }
        WidgetGeo g = WidgetGeo.of(v, W, H);
        WidgetSim s = new WidgetSim(g, seed, ids);
        boolean commute = !mood.equals("normal") && !mood.equals("sleep") && !mood.equals("beddingMid");
        int bl = System.getProperty("bubLines") != null ? Integer.parseInt(System.getProperty("bubLines")) : 2;
        float t = 0; while (t < secs) { s.step(0.05f); t += 0.05f; if (commute && Math.abs(t - 2f) < 0.026f) { g.setCommute(true, bl); s.setMode(WidgetSim.COMMUTE, mood); } }
        if (mood.equals("sleep")) { s.bed(true); for (int i = 0; i < 700 && !s.allInBed(); i++) s.step(0.05f); for (int i = 0; i < 30; i++) s.step(0.05f); }
        if (mood.equals("beddingMid")) { s.bed(true); for (int i = 0; i < 25; i++) s.step(0.05f); }
        int S = 4; BufferedImage im = new BufferedImage((int) (W * S), (int) (H * S), BufferedImage.TYPE_INT_ARGB);
        Graphics2D gr = im.createGraphics(); gr.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON); gr.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        gr.setColor(dark ? new Color(0x111114) : new Color(0xF4F4F6)); gr.fillRoundRect(0, 0, (int) (W * S), (int) (H * S), 22 * S / 2, 22 * S / 2);
        // 시계 숫자 상자(실제론 시스템 TextClock 이 그린다 — 여기선 같은 상자를 글자로 흉내)
        gr.setColor(dark ? Color.WHITE : new Color(0x111114));
        gr.setFont(new Font("SansSerif", Font.BOLD, Math.round(g.textDp * 0.98f * S)));
        FontMetrics fm = gr.getFontMetrics();
        if (!v) { String tm = "08:30"; gr.drawString(tm, (g.clkL + (g.clkW - fm.stringWidth(tm) / (float) S) / 2f) * S, (g.clkB()) * S); }
        else { String h1 = "08", m1 = "30"; gr.drawString(h1, (g.clkL + (g.clkW - fm.stringWidth(h1) / (float) S) / 2f) * S, (g.clkT + g.lineH) * S); gr.drawString(m1, (g.clkL + (g.clkW - fm.stringWidth(m1) / (float) S) / 2f) * S, (g.clkB()) * S); }
        gr.setColor(new Color(255, 0, 0, 90)); gr.setStroke(new BasicStroke(1)); gr.drawRect((int) (g.clkL * S), (int) (g.clkT * S), (int) (g.clkW * S), (int) (g.clkH * S));
        if (commute && s.mode == WidgetSim.COMMUTE) {
            gr.setColor(dark ? new Color(0x2A2A30) : Color.WHITE); gr.fillRoundRect((int) (g.bubL * S), (int) (g.bubT * S), (int) (g.bubW * S), (int) (g.bubH * S), 24, 24);
            gr.setColor(dark ? Color.WHITE : Color.BLACK); gr.setFont(new Font("SansSerif", Font.BOLD, Math.round(g.bubTs * S)));
            for (int li = 0; li < g.bubLines; li++) gr.drawString("오늘도 수고 " + (li + 1), (g.bubL + g.bubPad) * S, (g.bubT + g.bubPad + g.bubTs * (1.0f + 1.3f * li)) * S);
            gr.setFont(new Font("SansSerif", Font.BOLD, Math.round(g.btnTs * S)));
            gr.setColor(dark ? Color.WHITE : Color.BLACK); gr.fillRoundRect((int) (g.btnL * S), (int) (g.btnT * S), (int) (g.btnW * S), (int) (g.btnH * S), 40, 40);
            gr.setColor(dark ? Color.BLACK : Color.WHITE); gr.drawString("퇴근하기", (g.btnL + (g.btnW - gr.getFontMetrics().stringWidth("퇴근하기") / (float) S) / 2f) * S, (g.btnT + g.btnH * 0.5f + g.btnTs * 0.35f) * S);
        }
        WidgetArt.draw(s, new AwtSurface(gr, sheets, S), dark);
        gr.dispose();
        ImageIO.write(im, "png", new File(a[2]));
        StringBuilder sb = new StringBuilder("states:");
        for (WidgetSim.Ch c : s.cs) sb.append(' ').append(c.id).append('=').append(WidgetSim.ST_NAME[c.st]).append('@').append(Math.round(c.x)).append(',').append(Math.round(c.y));
        System.out.println(sb);
    }

    /**
     * 위젯 고르는 화면에 보일 미리보기 그림(시계 화면 + 캐릭터) 한 장. 실제 위젯은 배경이 투명하지만 미리보기는 카드 위에 놓이므로 옅은 바탕을 깐다.
     *   java WidgetJvmTest preview <sheetsDir> <out.png> <h|v> <W> <H> <dark|light> <HH:mm>
     * 캐릭터 셋·모습은 '한 마리는 시계 위, 한 마리는 매달림, 한 마리는 걷는' 장면이 나오는 시드를 찾아 쓴다.
     */
    static void preview(String[] a) throws Exception {
        File dir = new File(a[1]); boolean v = a[3].equals("v"); float W = Float.parseFloat(a[4]), H = Float.parseFloat(a[5]); boolean dark = a[6].equals("dark"); String tm = a[7];
        Map<String, BufferedImage> sheets = new HashMap<String, BufferedImage>();
        for (String id : ALL) { File f = new File(dir, id + ".png"); if (f.exists()) sheets.put(id, ImageIO.read(f)); }
        WidgetGeo g = WidgetGeo.of(v, W, H);
        WidgetSim s = null; String[] ids = { "dolsom", "lovel", "sul" };
        for (long seed = 1; seed < 400 && s == null; seed++) {
            WidgetSim t = new WidgetSim(g, seed, ids);
            for (int i = 0; i < 1200 && s == null; i++) {
                t.step(0.05f);
                boolean top = false, hang = false, ground = false;
                for (WidgetSim.Ch c : t.cs) { if (c.st == WidgetSim.TOP_REST || c.st == WidgetSim.TOP_WALK) top = true; else if (c.st == WidgetSim.HANG) hang = true; else if (c.zone == 0) ground = true; }
                if (top && hang && ground) s = t;
            }
        }
        if (s == null) s = new WidgetSim(g, 1, ids);
        int S = 3; BufferedImage im = new BufferedImage((int) (W * S), (int) (H * S), BufferedImage.TYPE_INT_ARGB);
        Graphics2D gr = im.createGraphics(); gr.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON); gr.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON); gr.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        Color c1 = dark ? new Color(0x4A5470) : new Color(0xF6E9E4), c2 = dark ? new Color(0x20263A) : new Color(0xE8DAD8);
        gr.setPaint(new GradientPaint(0, 0, c1, 0, H * S, c2)); gr.fillRoundRect(0, 0, (int) (W * S), (int) (H * S), 26 * S, 26 * S);
        gr.setColor(dark ? Color.WHITE : new Color(0x111114));
        gr.setFont(new Font("SansSerif", Font.BOLD, Math.round(g.textDp * 0.98f * S)));
        FontMetrics fm = gr.getFontMetrics();
        { String ref = v ? "00" : tm; float wd = fm.stringWidth(ref) / (float) S, hd = fm.getAscent() * 0.72f / S;   // 글꼴이 달라도 시계 상자(폭·높이)에 맞춘다
          float k = Math.min(g.clkW / wd, (v ? g.lineH : g.clkH) / hd); gr.setFont(gr.getFont().deriveFont(gr.getFont().getSize2D() * Math.min(1f, k))); fm = gr.getFontMetrics(); }
        if (!v) gr.drawString(tm, (g.clkL + (g.clkW - fm.stringWidth(tm) / (float) S) / 2f) * S, g.clkB() * S);
        else { String h1 = tm.substring(0, 2), m1 = tm.substring(3, 5); gr.drawString(h1, (g.clkL + (g.clkW - fm.stringWidth(h1) / (float) S) / 2f) * S, (g.clkT + g.lineH) * S); gr.drawString(m1, (g.clkL + (g.clkW - fm.stringWidth(m1) / (float) S) / 2f) * S, g.clkB() * S); }
        WidgetArt.draw(s, new AwtSurface(gr, sheets, S), dark);
        gr.dispose();
        ImageIO.write(im, "png", new File(a[2]));
    }

    public static void main(String[] a) throws Exception {
        if (a.length > 0 && a[0].equals("check")) check();
        else if (a.length > 0 && a[0].equals("render")) render(a);
        else if (a.length > 0 && a[0].equals("preview")) preview(a);
        else System.out.println("usage: check | render ...");
        if (fails > 0) System.exit(1);
    }
}
