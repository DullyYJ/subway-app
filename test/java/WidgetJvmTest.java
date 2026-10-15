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
        public void poly(float[] xy, int argb) { argb(argb); Path2D.Float p = new Path2D.Float(); p.moveTo(xy[0], xy[1]); for (int i = 2; i < xy.length; i += 2) p.lineTo(xy[i], xy[i + 1]); p.closePath(); g.fill(p); }
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
            ok(gc.textDp < g.textDp && gc.clkW < g.clkW, tag + ": 출퇴근 장면에서는 시계가 줄어든다(" + g.textDp + "→" + gc.textDp + ")");
            ok(gc.bubL >= 0 && gc.bubL + gc.bubW <= gc.W + 0.01f && gc.btnL >= 0 && gc.btnL + gc.btnW <= gc.W + 0.01f && gc.btnT + gc.btnH <= gc.H && gc.bubT + gc.bubH <= gc.btnT + 0.01f, tag + ": (출퇴근) 말풍선·버튼이 위젯 안에서 겹치지 않음");
            ok(gc.bubH >= 28f && gc.bubW >= 60f, tag + ": (출퇴근) 말풍선이 글을 담을 만큼 크다(" + gc.bubW + "x" + gc.bubH + ")");
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
                ok(g.clkW < clkW0, tag + ": 출퇴근 장면에서는 시계가 줄어든다(" + clkW0 + "→" + g.clkW + ")");
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
            public void ellipse(float a1, float a2, float a3, float a4, int c) {} public void circle(float a1, float a2, float a3, int c) {} public void poly(float[] xy, int c) {}
        };
        for (int i = 0; i < 500; i++) { a.step(0.1f); WidgetArt.draw(a, cnt, i % 2 == 0); }
        ok(cells[0] == 500 * 2 && !badFrame[0], "그림 명령: 프레임마다 캐릭터 수만큼 칸을 그리고 칸 번호가 0~15");
        System.out.println(fails == 0 ? "ALL OK" : (fails + " FAIL"));
    }

    static void render(String[] a) throws Exception {
        File dir = new File(a[1]); boolean v = a[3].equals("v"); float W = Float.parseFloat(a[4]), H = Float.parseFloat(a[5]);
        long seed = Long.parseLong(a[6]); float secs = Float.parseFloat(a[7]); String mood = a[8]; boolean dark = a[9].equals("dark");
        String[] ids = a.length > 10 ? a[10].split(",") : new String[] { "dolsom", "lovel", "sul" };
        Map<String, BufferedImage> sheets = new HashMap<String, BufferedImage>();
        for (String id : ALL) { File f = new File(dir, id + ".png"); if (f.exists()) sheets.put(id, ImageIO.read(f)); }
        WidgetGeo g = WidgetGeo.of(v, W, H);
        WidgetSim s = new WidgetSim(g, seed, ids);
        boolean commute = !mood.equals("normal");
        float t = 0; while (t < secs) { s.step(0.05f); t += 0.05f; if (commute && Math.abs(t - 2f) < 0.026f) { g.setCommute(true); s.setMode(WidgetSim.COMMUTE, mood); } }
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
            gr.setColor(dark ? Color.WHITE : Color.BLACK); gr.setFont(new Font("SansSerif", Font.PLAIN, 11 * S)); gr.drawString("bubble", (g.bubL + 6) * S, (g.bubT + 16) * S);
            gr.setColor(dark ? Color.WHITE : Color.BLACK); gr.fillRoundRect((int) (g.btnL * S), (int) (g.btnT * S), (int) (g.btnW * S), (int) (g.btnH * S), 40, 40);
            gr.setColor(dark ? Color.BLACK : Color.WHITE); gr.drawString("button", (g.btnL + 8) * S, (g.btnT + g.btnH * 0.65f) * S);
        }
        WidgetArt.draw(s, new AwtSurface(gr, sheets, S), dark);
        gr.dispose();
        ImageIO.write(im, "png", new File(a[2]));
        StringBuilder sb = new StringBuilder("states:");
        for (WidgetSim.Ch c : s.cs) sb.append(' ').append(c.id).append('=').append(WidgetSim.ST_NAME[c.st]).append('@').append(Math.round(c.x)).append(',').append(Math.round(c.y));
        System.out.println(sb);
    }

    public static void main(String[] a) throws Exception {
        if (a.length > 0 && a[0].equals("check")) check();
        else if (a.length > 0 && a[0].equals("render")) render(a);
        else System.out.println("usage: check | render ...");
        if (fails > 0) System.exit(1);
    }
}
