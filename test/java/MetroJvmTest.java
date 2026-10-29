package com.dullyyj.subway;

import java.awt.*;
import java.awt.geom.AffineTransform;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileInputStream;
import java.util.ArrayDeque;
import javax.imageio.ImageIO;

/**
 * 네이티브 노선도의 "안드로이드와 상관없는" 부분을 JVM 에서 돌려 보는 시험 도구.
 * (MetroMapData · MetroCamera · MetroRenderer 는 android.* 를 안 쓰므로 그대로 컴파일·실행된다)
 *   java MetroJvmTest check  <bin>                         → 구조·카메라·터치 판정 자체 점검(줄마다 ok/FAIL)
 *   java MetroJvmTest render <bin> <png> <filter> <scale> <ox> <oy> <w> <h> <lod 0|1> [highlightLabelName]
 *   java MetroJvmTest find   <bin> <name>...               → 라벨 순번(문서 순서) 출력
 *   java MetroJvmTest hit    <bin> <filter> <tol> <x> <y>...  → 점마다 눌린 라벨 순번
 */
public class MetroJvmTest {
    static int fails = 0;
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (!c) fails++; }

    // ───── AWT 로 그리는 Sink (안드로이드의 CanvasSink 와 같은 일을 한다) ─────
    static class AwtSink implements MetroRenderer.Sink {
        final MetroMapData d; final Graphics2D g; final AffineTransform base; final int w, h;
        final Path2D[][] cache; final ArrayDeque<Shape> clips = new ArrayDeque<>();
        AwtSink(MetroMapData d, Graphics2D g, int w, int h) {
            this.d = d; this.g = g; this.w = w; this.h = h; this.base = g.getTransform(); cache = new Path2D[d.shCmd.length][2];
        }
        Path2D path(int si, boolean eo) {
            int v = eo ? 1 : 0;
            if (cache[si][v] != null) return cache[si][v];
            Path2D.Float p = new Path2D.Float(eo ? Path2D.WIND_EVEN_ODD : Path2D.WIND_NON_ZERO);
            byte[] cmd = d.shCmd[si]; float[] c = d.shCoord[si]; int k = 0; boolean open = false;
            for (byte cm : cmd) {
                if (cm == 0) { p.moveTo(c[k], c[k + 1]); k += 2; open = true; }
                else if (cm == 1) { p.lineTo(c[k], c[k + 1]); k += 2; }
                else if (cm == 2) { p.curveTo(c[k], c[k + 1], c[k + 2], c[k + 3], c[k + 4], c[k + 5]); k += 6; }
                else if (open) p.closePath();
            }
            return cache[si][v] = p;
        }
        public void clear(int argb) {
            AffineTransform t = g.getTransform(); g.setTransform(new AffineTransform());
            g.setColor(new Color(argb, true)); g.fillRect(0, 0, w, h); g.setTransform(t);
        }
        public void pushClip(int shape) { clips.push(g.getClip() == null ? new Rectangle(-1 << 20, -1 << 20, 1 << 21, 1 << 21) : g.getClip()); g.clip(path(shape, false)); }
        public void popClip() { g.setClip(clips.pop()); }
        public void fill(int shape, float x, float y, float[] m, int argb, boolean eo) {
            AffineTransform t = g.getTransform();
            if (m != null) g.transform(new AffineTransform(m[0], m[1], m[2], m[3], m[4], m[5]));
            g.translate(x, y); g.setColor(new Color(argb, true)); g.fill(path(shape, eo)); g.setTransform(t);
        }
        public void stroke(int shape, float[] m, int argb, float width, float[] dash, boolean round) {
            AffineTransform t = g.getTransform();
            if (m != null) g.transform(new AffineTransform(m[0], m[1], m[2], m[3], m[4], m[5]));
            g.setStroke(new BasicStroke(width, round ? BasicStroke.CAP_ROUND : BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 4f, dash.length > 0 ? dash : null, 0f));
            g.setColor(new Color(argb, true)); g.draw(path(shape, false)); g.setTransform(t);
        }
    }

    static MetroMapData load(String p) throws Exception { try (FileInputStream in = new FileInputStream(p)) { return MetroMapData.parse(in); } }

    static int labelOrdinal(MetroMapData d, int op) { for (int i = 0; i < d.labelOps.length; i++) if (d.labelOps[i] == op) return i; return -1; }

    public static void main(String[] a) throws Exception {
        String mode = a[0];
        MetroMapData d = load(a[1]);
        if (mode.equals("render")) {
            String png = a[2]; String filter = a[3]; float scale = Float.parseFloat(a[4]), ox = Float.parseFloat(a[5]), oy = Float.parseFloat(a[6]);
            int w = Integer.parseInt(a[7]), h = Integer.parseInt(a[8]); boolean lod = a[9].equals("1");
            int hl = a.length > 10 ? d.findLabel(a[10]) : -1;
            BufferedImage im = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = im.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
            g.scale(scale, scale); g.translate(-ox, -oy);
            int n = MetroRenderer.render(d, new AwtSink(d, g, w, h), d.filterIndex(filter), lod, ox, oy, ox + w / scale, oy + h / scale, hl, 0xFFFF2D55, null);
            ImageIO.write(im, "png", new File(png));
            System.out.println("drawn " + n);
            return;
        }
        if (mode.equals("find")) {
            for (int i = 2; i < a.length; i++) { int op = d.findLabel(a[i]); System.out.println(a[i] + "\t" + (op < 0 ? -1 : labelOrdinal(d, op))); }
            return;
        }
        if (mode.equals("hit")) {
            int f = d.filterIndex(a[2]); float tol = Float.parseFloat(a[3]);
            for (int i = 4; i + 1 < a.length; i += 2) { int op = d.hitLabel(Float.parseFloat(a[i]), Float.parseFloat(a[i + 1]), tol, f); System.out.println(op < 0 ? -1 : labelOrdinal(d, op)); }
            return;
        }
        // ───── check ─────
        ok(d.nOp == 2942, "op 2942개 (" + d.nOp + ")");
        ok(d.labelOps.length == 655, "라벨 655개 (" + d.labelOps.length + ")");
        ok(d.filterName.length == 25 && d.filterName[0].equals("ALL"), "필터 25개, 첫째 ALL");
        ok(d.clipShape.length == 87, "클립 87개");
        ok(Math.abs(d.svgW - 2551.18f) < 0.01f, "svgW");
        ok(d.bg == 0xFFFFFFFF, "배경 흰색");
        int si = d.findLabel("서울역");
        ok(si >= 0 && d.labelName(si).equals("서울역") && "서울".equals(d.labelAlt(si)), "서울역 라벨 + 별칭 서울");
        ok(d.findLabel("서울 역") == si, "공백 무시");
        ok(d.findLabel("") == -1 && d.findLabel("없는역이름xyz") == -1, "없는 이름은 -1");
        int ci = d.findLabel("총신대입구");
        ok(ci >= 0 && "이수".equals(d.labelAlt(ci)), "총신대입구 별칭 이수");
        // 모든 라벨: 자기 중심을 누르면 중심을 덮는 라벨이 나오고, 대부분은 자기 자신
        int self = 0, wrongBox = 0;
        for (int op : d.labelOps) {
            int h = d.hitLabel(d.labelCx(op), d.labelCy(op), 0f, 0);
            if (h == op) self++;
            if (h < 0 || !(Math.abs(d.labelCx(op) - d.labelCx(h)) <= d.labelW(h) / 2f + 1e-3f && Math.abs(d.labelCy(op) - d.labelCy(h)) <= d.labelH(h) / 2f + 1e-3f)) wrongBox++;
        }
        ok(self >= 640 && wrongBox == 0, "라벨 중심 누르기: 자기 자신 " + self + "/655, 상자 밖 결과 " + wrongBox);
        ok(d.hitLabel(-50f, -50f, 5f, 0) == -1, "빈 곳은 -1");
        // 손가락 여유: 상자 밖 4단위 → tol 0 이면 못 찾고 tol 6 이면 찾는다
        {
            int op = si; float x = d.lbTb[4 * op] - 4f, y = d.labelCy(op);
            int h0 = d.hitLabel(x, y, 0f, 0), h6 = d.hitLabel(x, y, 6f, 0);
            ok(h6 >= 0 && (h0 == -1 || h0 != op), "손가락 여유(tol)로 근처 라벨을 잡는다");
        }
        // 필터: 2호선에서 숨겨진 라벨은 못 누른다
        {
            int f2 = d.filterIndex("2호선"); int hidden = -1, shown = -1;
            for (int op : d.labelOps) { if (d.filterState[f2][op] == 0 && hidden < 0) hidden = op; if ((d.filterState[f2][op] & 255) == 255 && shown < 0) shown = op; }
            ok(hidden >= 0 && shown >= 0, "2호선 필터에 숨김·보임 라벨이 있다");
            int hh = d.hitLabel(d.labelCx(hidden), d.labelCy(hidden), 0f, f2);
            ok(hh != hidden, "숨겨진 라벨은 누를 수 없다");
            ok(d.hitLabel(d.labelCx(shown), d.labelCy(shown), 0f, f2) >= 0, "보이는 라벨은 누를 수 있다");
        }
        ok(d.filterIndex("모르는호선") == 0 && d.filterIndex(null) == 0, "모르는 필터 이름은 ALL");
        // 렌더러 규칙
        ok(MetroRenderer.withState(0xFF112233, 255) == 0xFF112233 && MetroRenderer.withState(0xFF112233, 0) == 0x00112233 && ((MetroRenderer.withState(0xFF112233, 128) >>> 24) == 128), "불투명도 곱");
        {
            final int[] clip = {0, 0, 0};
            MetroRenderer.Sink cs = new MetroRenderer.Sink() {
                public void clear(int c) {} public void pushClip(int s) { clip[0]++; clip[2]++; } public void popClip() { clip[1]++; clip[2]--; }
                public void fill(int s, float x, float y, float[] m, int c, boolean e) { } public void stroke(int s, float[] m, int c, float w, float[] ds, boolean r) { }
            };
            int n = MetroRenderer.render(d, cs, 0, false, 0, 0, d.svgW, d.svgH, -1, 0, null);
            ok(n > 2500 && clip[0] == clip[1] && clip[2] == 0, "전체 그리기 op " + n + ", 클립 push/pop 짝 " + clip[0] + "/" + clip[1]);
            int n2 = MetroRenderer.render(d, cs, 0, false, 1000, 1000, 1100, 1100, -1, 0, null);
            ok(n2 > 0 && n2 < n / 4, "화면 밖은 건너뛴다 (" + n2 + " < " + n + ")");
            final int[] cnt = {0};
            int n3 = MetroRenderer.render(d, cs, 0, false, 0, 0, d.svgW, d.svgH, -1, 0, () -> ++cnt[0] > 3);
            ok(n3 == -1 && clip[2] == 0, "취소하면 -1 이고 클립 짝이 맞는다");
            final int[] fills = {0, 0};
            MetroRenderer.Sink fs = new MetroRenderer.Sink() {
                public void clear(int c) {} public void pushClip(int s) {} public void popClip() {}
                public void fill(int s, float x, float y, float[] m, int c, boolean e) { fills[0]++; } public void stroke(int s, float[] m, int c, float w, float[] ds, boolean r) { }
            };
            MetroRenderer.render(d, fs, 0, false, 0, 0, d.svgW, d.svgH, -1, 0, null);
            int all = fills[0]; fills[0] = 0;
            MetroRenderer.render(d, fs, 0, true, 0, 0, d.svgW, d.svgH, -1, 0, null);
            ok(fills[0] < all, "lod 면 영문 글자를 건너뛴다 (" + fills[0] + " < " + all + ")");
        }
        // 카메라
        {
            MetroCamera c = new MetroCamera(2551.18f, 2551.18f);
            c.setView(1080f, 1800f, 20f * 2.75f);
            ok(Math.abs(c.minScale - 1800f / 2551.18f) < 1e-6f, "최소 배율 = 화면높이/지도높이");
            c.fit();
            ok(c.scale == c.minScale && c.ty == 0f && c.tx <= 0f && c.tx >= 1080f - 2551.18f * c.scale - 1e-3f, "fit: 세로 꽉 참, 가로는 범위 안");
            ok(Math.abs(c.screenX(1280f) - 540f) < 1e-2f || c.tx == 1080f - 2551.18f * c.scale || c.tx == 0f, "fit: 서울역 부근이 가운데(또는 끝에 붙음)");
            float x0 = c.svgX(500f), y0 = c.svgY(700f);
            c.zoomAbout(500f, 700f, c.scale * 3f);
            ok(Math.abs(c.screenX(x0) - 500f) < 0.2f && Math.abs(c.screenY(y0) - 700f) < 0.2f, "확대해도 손가락 아래 지점이 그대로");
            c.zoomAbout(500f, 700f, 1e6f);
            ok(c.scale == c.maxScale, "최대 배율 제한");
            c.zoomAbout(500f, 700f, 1e-6f);
            ok(c.scale == c.minScale, "최소 배율 제한");
            c.zoomAbout(540f, 900f, c.minScale * 4f);
            c.panBy(1e6f, 1e6f);
            ok(c.tx == 0f && c.ty == 0f, "지도 왼쪽·위 끝 너머로 안 밀린다");
            c.panBy(-1e7f, -1e7f);
            ok(Math.abs(c.tx - (1080f - c.svgW * c.scale)) < 1e-2f && Math.abs(c.ty - (1800f - c.svgH * c.scale)) < 1e-2f, "지도 오른쪽·아래 끝 너머로 안 밀린다");
            c.place(1280f, 1090f, 540f, 900f);
            ok(Math.abs(c.screenX(1280f) - 540f) < 0.1f || c.tx == 0f || c.tx == 1080f - c.svgW * c.scale, "place: 한 점을 화면 한 곳에");
            MetroCamera w = new MetroCamera(2551.18f, 2551.18f); w.setView(4000f, 1800f, 55f); w.fit();
            ok(Math.abs(w.tx - (4000f - 2551.18f * w.scale) / 2f) < 1e-2f, "화면이 지도보다 넓으면 가운데 놓는다");
            c.setView(1080f, 900f, 55f);
            ok(c.scale >= c.minScale && c.tx <= 0f, "화면 높이가 줄면 범위를 다시 맞춘다");
        }
        // 가장자리 밀기(노선도 → 버스 탭)
        {
            MetroCamera c = new MetroCamera(2551.18f, 2551.18f);
            c.setView(1080f, 1800f, 55f); c.fit(); c.tx = 0f;
            ok(c.panByLeftoverX(-30f, 0f) == 0f && c.tx == -30f, "움직일 수 있으면 남는 양 0");
            ok(c.panByLeftoverX(50f, 0f) == 20f && c.tx == 0f, "왼쪽 끝에서 오른쪽으로 더 밀면 못 간 양이 남는다(" + c.tx + ")");
            ok(c.panByLeftoverX(40f, 0f) == 40f, "끝에 붙은 채 더 밀면 전부 남는다");
            c.tx = c.viewW - c.svgW * c.scale;
            ok(c.panByLeftoverX(-25f, 3f) == -25f, "오른쪽 끝에서 왼쪽으로 더 밀면 음수로 남는다");
            ok(MetroCamera.edgeSwipe(80f, 0f, 72f) == 1 && MetroCamera.edgeSwipe(-80f, 10f, 72f) == -1, "문턱을 넘으면 손가락이 간 쪽 방향");
            ok(MetroCamera.edgeSwipe(60f, 0f, 72f) == 0, "문턱 미만이면 넘기지 않는다");
            ok(MetroCamera.edgeSwipe(100f, 90f, 72f) == 0, "세로로 더 많이 움직였으면 넘기지 않는다");
            MetroCamera w = new MetroCamera(2551.18f, 2551.18f); w.setView(4000f, 1800f, 55f); w.fit();
            ok(w.panByLeftoverX(90f, 0f) == 90f, "지도가 화면보다 좁으면 어느 쪽이든 전부 남는다(바로 넘길 수 있다)");
        }
        System.out.println(fails == 0 ? "ALL OK" : ("FAILS " + fails));
        System.exit(fails == 0 ? 0 : 1);
    }
}
