package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;

/** 내 위치 공유 그림(360x214 의 2배): 글과 칸 고르기는 ShareCore(엔진 값), 여기는 그리기만. pal = ShellCore.palette(테마). */
final class ShareArt {
    private ShareArt() { }

    static final int W = 360, H = 214; static final float S = 2f;

    static Bitmap draw(ShareCore.Share d, int[] pal) { return draw(d, pal, null); }

    /** mk 가 있으면 GIF 바탕: 내 위치 마커(테두리·점)는 그리지 않고 그 자리(mk[0]=x, mk[1]=선 높이)만 알려 준다 — 프레임마다 마커를 따로 그린다. */
    static Bitmap draw(ShareCore.Share d, int[] pal, float[] mk) {
        final int card = pal[1], border = pal[2], text = pal[3], sub = pal[4], acc = 0xFF0090D2, cur = 0xFF0A84FF;
        Bitmap bmp = Bitmap.createBitmap((int) (W * S), (int) (H * S), Bitmap.Config.ARGB_8888);
        Canvas g = new Canvas(bmp); g.scale(S, S);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL); p.setColor(card);
        g.drawRoundRect(new RectF(0, 0, W, H), 18, 18, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(border);
        g.drawRoundRect(new RectF(0.5f, 0.5f, W - 0.5f, H - 0.5f), 18, 18, p);
        p.setStyle(Paint.Style.FILL);
        text(g, p, d.lbT, 18, 26, 11, false, sub, Paint.Align.LEFT, W - 36);
        text(g, p, d.from + " - " + d.cur + " - " + d.to, 18, 48, 14, true, text, Paint.Align.LEFT, W - 36);
        text(g, p, d.lbA + d.arr, 18, 68, 12, false, sub, Paint.Align.LEFT, W - 36);
        text(g, p, d.lbR + d.rem, 18, 100, 26, true, acc, Paint.Align.LEFT, W - 36);
        int[] slots = ShareCore.slots(d.names.size(), d.hit);
        float x0 = 18, x1 = W - 18, ly = 138, step = slots.length > 1 ? (x1 - x0 - 40) / (slots.length - 1) : 0f;
        p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeWidth(3f); p.setColor(acc); p.setAlpha(140);
        g.drawLine(x0, ly, x1, ly, p); p.setAlpha(255); p.setStyle(Paint.Style.FILL);
        for (int k = 0; k < slots.length; k++) {
            float x = slots.length > 1 ? x0 + 20 + step * k : (x0 + x1) / 2f;
            if (slots[k] < 0) {
                p.setColor(card); g.drawRect(x - 17, ly - 9, x + 17, ly + 9, p);
                text(g, p, "··· " + (-slots[k]), x, ly + 4, 11, true, sub, Paint.Align.CENTER, 40);
                continue;
            }
            int i = slots[k];
            boolean passed = i < d.hit, isCur = i == d.hit;
            if (isCur && mk != null) {
                mk[0] = x; mk[1] = ly;
            } else if (isCur) {
                p.setColor(cur); p.setAlpha(56); g.drawCircle(x, ly, 13, p); p.setAlpha(255);
                p.setColor(cur); g.drawCircle(x, ly, 8, p);
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2.5f); p.setColor(card); g.drawCircle(x, ly, 8, p); p.setStyle(Paint.Style.FILL);
            } else {
                p.setColor(card); g.drawCircle(x, ly, 6, p);
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2.5f); p.setColor(passed ? sub : acc); p.setAlpha(passed ? 153 : 255); g.drawCircle(x, ly, 6, p); p.setAlpha(255); p.setStyle(Paint.Style.FILL);
            }
            boolean gapNb = (k > 0 && slots[k - 1] < 0) || (k < slots.length - 1 && slots[k + 1] < 0);
            float maxW = Math.max(40f, Math.min(2f * (W - 6 - x), Math.min(2f * (x - 6), step * (gapNb ? 1.75f : 1.05f))));
            text(g, p, d.names.get(i), x, ly - 22, 11, isCur, isCur ? cur : text, Paint.Align.CENTER, maxW, passed ? 140 : 255);
            text(g, p, d.times.get(i), x, ly + 30, 10, false, sub, Paint.Align.CENTER, 60, passed ? 140 : 255);
        }
        text(g, p, ShareCore.footer(d), 18, H - 18, 10, false, sub, Paint.Align.LEFT, W - 36);
        return bmp;
    }

    /**
     * 움직이는 공유 그림(GIF): 카드 그림 위에서 내 위치 마커가 숨 쉬듯 깜박이고, 길동무 친구 한 마리(무작위)가 노선선 위를 오간다.
     * 움직임 계획은 ShareAnim, 파일 만들기는 GifEnc(둘 다 순수 자바 · JVM 시험) — 여기는 프레임을 그려 넘기기만 한다.
     */
    static byte[] gif(android.content.Context ctx, ShareCore.Share d, int[] pal, long seed) throws java.io.IOException {
        final int card = pal[1], border = pal[2], text = pal[3], sub = pal[4], acc = 0xFF0090D2, cur = 0xFF0A84FF;
        float[] mk = new float[2];
        Bitmap base = draw(d, pal, mk);
        if (mk[0] == 0f) throw new java.io.IOException("marker");
        ShareAnim an = new ShareAnim(seed, 36f, W - 36f, 22f);
        Bitmap sheet;
        java.io.InputStream in = ctx.getAssets().open("chars3d/" + an.id + ".webp");
        try { sheet = android.graphics.BitmapFactory.decodeStream(in); } finally { in.close(); }
        if (sheet == null) throw new java.io.IOException("sheet");
        int pw = base.getWidth(), ph = base.getHeight();
        java.util.List<int[]> frames = new java.util.ArrayList<int[]>();
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        android.graphics.Rect src = new android.graphics.Rect(); RectF dst = new RectF();
        float[] f = an.cfg, sc = { an.charH * f[5] / (f[1] - f[0]) };
        for (int i = 0; i < ShareAnim.N; i++) {
            Bitmap fb = base.copy(Bitmap.Config.ARGB_8888, true);
            Canvas g = new Canvas(fb); g.scale(S, S);
            float u = an.pulse[i], x = mk[0], y = mk[1];
            p.setStyle(Paint.Style.FILL); p.setColor(cur); p.setAlpha(56); g.drawCircle(x, y, 13, p);                       // 가만히 있는 연한 테두리
            float rr = 8f + 14f * u; p.setAlpha((int) (110f * (1f - u))); g.drawCircle(x, y, rr, p);                      // 퍼져 나가는 물결
            p.setColor(card); p.setAlpha(255); g.drawCircle(x, y, 8, p);
            p.setColor(cur); p.setAlpha(Math.round(255f * (0.62f + 0.38f * (float) Math.cos(u * 2f * Math.PI)))); g.drawCircle(x, y, 8, p);   // 깜박이는 점
            p.setAlpha(255); p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2.5f); p.setColor(card); g.drawCircle(x, y, 8, p); p.setStyle(Paint.Style.FILL);
            // 친구: 걷는 시트(256px 칸 4×4)의 한 칸 — 발이 선 위에 닿는다
            float cx = an.x[i], footY = y - 1f, k = sc[0];
            g.save();
            if (an.face[i] < 0) { g.translate(cx, 0f); g.scale(-1f, 1f); g.translate(-cx, 0f); }
            int fr = an.sheet[i];
            src.set((fr % 4) * 256, (fr / 4) * 256, (fr % 4) * 256 + 256, (fr / 4) * 256 + 256);
            float left = cx - f[2] * k, top = footY - f[1] * k; dst.set(left, top, left + 256f * k, top + 256f * k);
            g.drawBitmap(sheet, src, dst, p);
            g.restore();
            int[] px = new int[pw * ph]; fb.getPixels(px, 0, pw, 0, 0, pw, ph); fb.recycle();
            frames.add(px);
        }
        sheet.recycle(); base.recycle();
        return GifEnc.encode(pw, ph, frames, ShareAnim.DELAY_CS, new int[] { card & 0xFFFFFF, border & 0xFFFFFF, text & 0xFFFFFF, sub & 0xFFFFFF, acc & 0xFFFFFF, cur & 0xFFFFFF });
    }

    private static void text(Canvas g, Paint p, String s, float x, float y, float px, boolean bold, int color, Paint.Align al, float maxW) { text(g, p, s, x, y, px, bold, color, al, maxW, 255); }
    private static void text(Canvas g, Paint p, String s, float x, float y, float px, boolean bold, int color, Paint.Align al, float maxW, int alpha) {
        p.setStyle(Paint.Style.FILL); p.setTypeface(Typeface.create(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL));
        p.setTextSize(px); p.setColor(color); p.setAlpha(alpha); p.setTextAlign(al);
        String t = s == null ? "" : s;
        if (p.measureText(t) > maxW) { while (t.length() > 1 && p.measureText(t + "…") > maxW) t = t.substring(0, t.length() - 1); t = t + "…"; }
        g.drawText(t, x, y, p);
        p.setAlpha(255);
    }
}
