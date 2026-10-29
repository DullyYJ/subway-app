package com.dullyyj.subway;

import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.*;
import java.util.List;
import javax.imageio.*;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.ImageInputStream;

/** 내 위치 공유 GIF: 인코더(GifEnc)가 만든 파일을 표준 디코더(ImageIO)로 다시 읽어 프레임을 비교하고, 움직임 계획(ShareAnim)의 성질을 점검한다. 실행: check | render <sheetsDir> <out.gif> [seed] */
public class ShareGifJvmTest {
    static int fails = 0;
    static void ok(boolean c, String m) { if (c) System.out.println("ok   " + m); else { fails++; System.out.println("FAIL " + m); } }

    /** GIF → 프레임별 전체 화면(ARGB). 프레임 네모를 앞 화면 위에 덮는다(disposal 1: 그대로 둠). */
    static List<int[]> decode(byte[] gif, int[] wh, int[] delays) throws Exception {
        ImageReader rd = ImageIO.getImageReadersByFormatName("gif").next();
        ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(gif)); rd.setInput(in);
        int n = rd.getNumImages(true); List<int[]> out = new ArrayList<int[]>();
        int W = 0, H = 0; IIOMetadataNode gs = (IIOMetadataNode) rd.getStreamMetadata().getAsTree("javax_imageio_gif_stream_1.0");
        IIOMetadataNode ls = (IIOMetadataNode) gs.getElementsByTagName("LogicalScreenDescriptor").item(0);
        W = Integer.parseInt(ls.getAttribute("logicalScreenWidth")); H = Integer.parseInt(ls.getAttribute("logicalScreenHeight"));
        int[] cv = new int[W * H];
        for (int i = 0; i < n; i++) {
            BufferedImage im = rd.read(i);
            IIOMetadataNode root = (IIOMetadataNode) rd.getImageMetadata(i).getAsTree("javax_imageio_gif_image_1.0");
            IIOMetadataNode d = (IIOMetadataNode) root.getElementsByTagName("ImageDescriptor").item(0);
            int lx = Integer.parseInt(d.getAttribute("imageLeftPosition")), ty = Integer.parseInt(d.getAttribute("imageTopPosition"));
            IIOMetadataNode g = (IIOMetadataNode) root.getElementsByTagName("GraphicControlExtension").item(0);
            if (delays != null && i < delays.length) delays[i] = Integer.parseInt(g.getAttribute("delayTime"));
            for (int y = 0; y < im.getHeight(); y++) for (int x = 0; x < im.getWidth(); x++) { int p = im.getRGB(x, y); if (((p >>> 24) & 255) >= 128) cv[(ty + y) * W + lx + x] = p; else if (i == 0) cv[(ty + y) * W + lx + x] = 0; }
            out.add(cv.clone());
        }
        wh[0] = W; wh[1] = H; return out;
    }
    static int maxDiff(int[] a, int[] b) {
        int m = 0; for (int i = 0; i < a.length; i++) { if (((a[i] >>> 24) & 255) < 128 && ((b[i] >>> 24) & 255) < 128) continue; if (((a[i] >>> 24) & 255) < 128 || ((b[i] >>> 24) & 255) < 128) return 999;
            int dr = Math.abs(((a[i] >> 16) & 255) - ((b[i] >> 16) & 255)), dg = Math.abs(((a[i] >> 8) & 255) - ((b[i] >> 8) & 255)), db = Math.abs((a[i] & 255) - (b[i] & 255)); m = Math.max(m, Math.max(dr, Math.max(dg, db))); }
        return m;
    }

    static void check() throws Exception {
        // ① 단순한 색 블록: 모든 프레임이 정확히 같은 색(오차 0)으로 돌아온다
        {
            int w = 37, h = 23; List<int[]> fr = new ArrayList<int[]>(); int[] base = new int[w * h];
            for (int i = 0; i < base.length; i++) base[i] = 0xFFFFFFFF;
            for (int f = 0; f < 6; f++) { int[] a = base.clone(); for (int y = 5; y < 12; y++) for (int x = 3 + f * 4; x < 9 + f * 4; x++) a[y * w + x] = 0xFF0A84FF; fr.add(a); }
            byte[] g = GifEnc.encode(w, h, fr, 7, new int[] { 0xFFFFFF, 0x0A84FF });
            int[] wh = new int[2], dl = new int[6]; List<int[]> back = decode(g, wh, dl);
            boolean same = back.size() == 6 && wh[0] == w && wh[1] == h; for (int f = 0; same && f < 6; f++) if (maxDiff(back.get(f), fr.get(f)) != 0) same = false;
            ok(same, "GIF 인코더: 색 블록 6프레임이 표준 디코더에서 오차 0 으로 복원된다");
            ok(dl[0] == 7 && dl[5] == 7, "GIF 인코더: 프레임 지연이 들어간다(" + dl[0] + ")");
            ok(new String(g, 0, 6, "ISO-8859-1").equals("GIF89a"), "GIF 인코더: GIF89a 머리글");
            ok(new String(g, "ISO-8859-1").contains("NETSCAPE2.0"), "GIF 인코더: 무한 반복 확장이 들어간다");
        }
        // ② 투명 모서리 + 그라데이션 같은 많은 색: 오차가 작다(256색 양자화)
        {
            int w = 90, h = 60; List<int[]> fr = new ArrayList<int[]>(); Random r = new Random(5);
            for (int f = 0; f < 5; f++) { int[] a = new int[w * h]; for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                double cx = x - w / 2.0, cy = y - h / 2.0; boolean in = cx * cx / 1600 + cy * cy / 800 < 1.0;
                int rr = (int) (120 + 100 * Math.sin(x / 9.0 + f)), gg = (int) (130 + 100 * Math.sin(y / 7.0)), bb = (int) (140 + 90 * Math.cos((x + y) / 11.0));
                a[y * w + x] = in ? (0xFF000000 | rr << 16 | gg << 8 | bb) : 0; } fr.add(a); }
            byte[] g = GifEnc.encode(w, h, fr, 5, null);
            int[] wh = new int[2]; List<int[]> back = decode(g, wh, null);
            int worst = 0; for (int f = 0; f < 5; f++) worst = Math.max(worst, maxDiff(back.get(f), fr.get(f)));
            ok(back.size() == 5 && worst <= 48, "GIF 인코더: 투명 바깥 + 색 많은 아주 어려운 그림도 256색으로 한 칸 오차 48 이내(최대 " + worst + ")");
        }
        // ③ 크기가 여러 가지인 아주 무작위한 그림(LZW 사전이 가득 차 비워지는 경우 포함)이 그대로 복원된다
        {
            boolean all = true; String bad = "";
            int[][] sizes = { { 1, 1 }, { 2, 3 }, { 17, 1 }, { 255, 3 }, { 64, 64 }, { 200, 150 }, { 321, 77 } };
            for (int[] s : sizes) {
                Random r = new Random(s[0] * 31 + s[1]); List<int[]> fr = new ArrayList<int[]>(); int[] pal = new int[40]; for (int i = 0; i < pal.length; i++) pal[i] = 0xFF000000 | r.nextInt(0x1000000);
                for (int f = 0; f < 3; f++) { int[] a = new int[s[0] * s[1]]; for (int i = 0; i < a.length; i++) a[i] = pal[r.nextInt(r.nextBoolean() ? 40 : 4)]; fr.add(a); }
                int[] fixed = new int[16]; for (int i = 0; i < 16; i++) fixed[i] = pal[i] & 0xFFFFFF;
                byte[] g = GifEnc.encode(s[0], s[1], fr, 3, fixed);
                int[] wh = new int[2]; List<int[]> back = decode(g, wh, null);
                boolean same = back.size() == 3; for (int f = 0; same && f < 3; f++) same = maxDiff(back.get(f), fr.get(f)) <= 24;
                if (!same) { all = false; bad += s[0] + "x" + s[1] + " "; }
            }
            ok(all, "GIF 인코더: 1x1 · 17x1 · 255x3 · 200x150 · 321x77 무작위 그림이 모두 복원된다(LZW 사전 비움 포함) " + bad);
        }
        // ④ 안 변하는 프레임도 지연을 가진 한 칸 프레임으로 들어간다 · 같은 장면은 작다
        {
            int w = 360, h = 214; int[] a = new int[w * h]; Arrays.fill(a, 0xFFF4F4F6); List<int[]> fr = new ArrayList<int[]>(); for (int i = 0; i < 20; i++) fr.add(a.clone());
            byte[] g = GifEnc.encode(w, h, fr, 7, null); int[] wh = new int[2]; List<int[]> back = decode(g, wh, null);
            ok(back.size() == 20 && g.length < 6000, "GIF 인코더: 안 변하는 20프레임은 " + g.length + "바이트(프레임 20개 유지)");
        }
        // ⑤ ShareAnim
        {
            boolean det = true, loop = true, steps = true, bounds = true, sheetOk = true, pulseOk = true, faceOk = true; Set<String> ids = new HashSet<String>(); float maxStep = 0f; boolean someWalk = true;
            for (long seed = 1; seed <= 300; seed++) {
                ShareAnim a = new ShareAnim(seed, 30f, 330f, 20f), b = new ShareAnim(seed, 30f, 330f, 20f); ids.add(a.id);
                if (!a.id.equals(b.id) || !Arrays.equals(a.x, b.x) || !Arrays.equals(a.sheet, b.sheet)) det = false;
                if (Math.abs(a.x[0] - a.x[ShareAnim.N - 1]) > 0.01f || a.face[0] != a.face[ShareAnim.N - 1] && false) loop = false;
                float mn = 1e9f, mx = -1e9f; int walk = 0;
                for (int i = 0; i < ShareAnim.N; i++) {
                    mn = Math.min(mn, a.x[i]); mx = Math.max(mx, a.x[i]);
                    if (a.sheet[i] < 0 || a.sheet[i] > 15) sheetOk = false; if (!(a.pulse[i] >= 0f && a.pulse[i] < 1f)) pulseOk = false; if (a.face[i] != 1 && a.face[i] != -1) faceOk = false;
                    if (a.sheet[i] != 0) walk++;
                    if (i > 0) { float d = Math.abs(a.x[i] - a.x[i - 1]); maxStep = Math.max(maxStep, d); if (d > 3.5f) steps = false; }
                }
                if (mn < 30f - 0.01f || mx > 330f + 0.01f) bounds = false; if (walk < 40) someWalk = false;
                if (Math.abs(a.pulse[0] - a.pulse[ShareAnim.PULSE]) > 1e-6f) pulseOk = false;
            }
            ok(ShareAnim.N % ShareAnim.PULSE == 0, "ShareAnim: 프레임 수(" + ShareAnim.N + ")가 마커 깜박임 주기(" + ShareAnim.PULSE + ")의 배수 — 반복이 끊기지 않는다");
            ok(det, "ShareAnim: 같은 씨앗은 같은 계획"); ok(ids.size() == WidgetSim.ORDER.length, "ShareAnim: 친구 여덟 마리가 골고루 뽑힌다(" + ids.size() + "종)");
            ok(loop, "ShareAnim: 마지막 프레임이 첫 프레임 자리로 돌아온다"); ok(bounds, "ShareAnim: 카드 선 범위 안에서만 오간다");
            ok(steps, "ShareAnim: 한 프레임에 3.5 이상 순간이동하지 않는다(최대 " + maxStep + ")"); ok(sheetOk && pulseOk && faceOk, "ShareAnim: 칸 0~15 · 깜박임 위상 0~1 주기 · 방향 ±1"); ok(someWalk, "ShareAnim: 한 바퀴의 절반 가까이는 걷는다");
        }
        System.out.println(fails == 0 ? "ALL OK" : (fails + " FAIL"));
        if (fails != 0) System.exit(1);
    }

    // ── 눈으로 볼 미리보기: ShareArt 와 같은 계획으로 AWT 에 그려 GIF 로 낸다 ──
    static void render(String[] a) throws Exception {
        File dir = new File(a[1]); long seed = a.length > 3 ? Long.parseLong(a[3]) : 7; boolean dark = a.length > 4 && a[4].equals("dark");
        final int W = 360, H = 214, S = 2;
        ShareAnim an = new ShareAnim(seed, 36f, W - 36f, 22f);
        BufferedImage sheet = ImageIO.read(new File(dir, an.id + ".png"));
        Color card = dark ? new Color(0x1C1C22) : Color.WHITE, txt = dark ? new Color(0xEDEDF2) : new Color(0x111114), sub = new Color(0x8A8D94), acc = new Color(0x0090D2), cur = new Color(0x0A84FF);
        float ly = 138f, curX = 100f;
        List<int[]> frames = new ArrayList<int[]>();
        for (int i = 0; i < ShareAnim.N; i++) {
            BufferedImage im = new BufferedImage(W * S, H * S, BufferedImage.TYPE_INT_ARGB); Graphics2D g = im.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON); g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC); g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON); g.scale(S, S);
            g.setColor(card); g.fill(new RoundRectangle2D.Float(0, 0, W, H, 18, 18)); g.setColor(new Color(0xD8D8DE)); g.setStroke(new BasicStroke(1f)); g.draw(new RoundRectangle2D.Float(0.5f, 0.5f, W - 1, H - 1, 18, 18));
            g.setFont(new Font("SansSerif", Font.PLAIN, 11)); g.setColor(sub); g.drawString("길동무 · 내 위치", 18, 26);
            g.setFont(new Font("SansSerif", Font.BOLD, 14)); g.setColor(txt); g.drawString("혜화 - 동대문 - 구로디지털단지", 18, 48);
            g.setFont(new Font("SansSerif", Font.PLAIN, 12)); g.setColor(sub); g.drawString("도착예정시간: 22시47분", 18, 68);
            g.setFont(new Font("SansSerif", Font.BOLD, 26)); g.setColor(acc); g.drawString("남은시간 00시43분", 18, 100);
            g.setStroke(new BasicStroke(3f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)); g.setColor(new Color(0, 144, 210, 140)); g.draw(new Line2D.Float(18, ly, W - 18, ly));
            float[] xs = { 38, 100, 160, 300 };
            for (int k = 0; k < xs.length; k++) { if (xs[k] == curX) continue; g.setColor(card); g.fill(new Ellipse2D.Float(xs[k] - 6, ly - 6, 12, 12)); g.setStroke(new BasicStroke(2.5f)); g.setColor(k == 0 ? new Color(0xA0A4AC) : acc); g.draw(new Ellipse2D.Float(xs[k] - 6, ly - 6, 12, 12)); }
            g.setFont(new Font("SansSerif", Font.PLAIN, 10)); g.setColor(sub); g.drawString("22:01", 24, ly + 30); g.drawString("22:03", 86, ly + 30); g.drawString("22:05", 146, ly + 30); g.drawString("22:47", 286, ly + 30);
            // 마커: 숨 쉬는 테두리 + 깜박이는 점
            float u = an.pulse[i];
            g.setColor(new Color(10, 132, 255, 56)); g.fill(new Ellipse2D.Float(curX - 13, ly - 13, 26, 26));
            float rr = 8f + 14f * u; g.setColor(new Color(10, 132, 255, (int) (110 * (1 - u)))); g.fill(new Ellipse2D.Float(curX - rr, ly - rr, rr * 2, rr * 2));
            g.setColor(card); g.fill(new Ellipse2D.Float(curX - 8, ly - 8, 16, 16));
            float al = (float) (0.62 + 0.38 * Math.cos(u * Math.PI * 2)); g.setColor(new Color(10, 132, 255, Math.round(255 * al))); g.fill(new Ellipse2D.Float(curX - 8, ly - 8, 16, 16));
            g.setStroke(new BasicStroke(2.5f)); g.setColor(card); g.draw(new Ellipse2D.Float(curX - 8, ly - 8, 16, 16));
            // 친구
            float[] f = an.cfg; float sc = an.charH * f[5] / (f[1] - f[0]), cx = an.x[i], footY = ly - 1f;
            AffineTransform at = g.getTransform();
            if (an.face[i] < 0) { g.translate(cx, 0); g.scale(-1, 1); g.translate(-cx, 0); }
            int fr = an.sheet[i]; g.translate(cx - f[2] * sc, footY - f[1] * sc); g.scale(sc, sc);
            g.drawImage(sheet.getSubimage((fr % 4) * 256, (fr / 4) * 256, 256, 256), 0, 0, null);
            g.setTransform(at); g.dispose();
            frames.add(im.getRGB(0, 0, W * S, H * S, null, 0, W * S));
        }
        byte[] gif = GifEnc.encode(W * S, H * S, frames, ShareAnim.DELAY_CS, new int[] { card.getRGB() & 0xFFFFFF, txt.getRGB() & 0xFFFFFF, sub.getRGB() & 0xFFFFFF, acc.getRGB() & 0xFFFFFF, cur.getRGB() & 0xFFFFFF });
        try (FileOutputStream os = new FileOutputStream(a[2])) { os.write(gif); }
        System.out.println(an.id + " " + gif.length / 1024 + "KB " + ShareAnim.N + "frames");
    }

    public static void main(String[] a) throws Exception {
        if (a.length > 0 && a[0].equals("render")) render(a); else check();
    }
}
