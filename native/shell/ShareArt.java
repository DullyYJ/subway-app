package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;

/** 내 위치 공유 그림(360x214 의 2배): 글과 칸 고르기는 ShareCore(엔진 값), 여기는 그리기만. pal = ShellCore.palette(테마). */
final class ShareArt {
    private ShareArt() { }

    static Bitmap draw(ShareCore.Share d, int[] pal) {
        final int W = 360, H = 214; final float S = 2f;
        final int card = pal[1], border = pal[2], text = pal[3], sub = pal[4], acc = 0xFF0090D2, cur = 0xFF0A84FF;
        Bitmap bmp = Bitmap.createBitmap((int) (W * S), (int) (H * S), Bitmap.Config.ARGB_8888);
        Canvas g = new Canvas(bmp); g.scale(S, S);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL); p.setColor(card);
        g.drawRoundRect(new RectF(0, 0, W, H), 18, 18, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(border);
        g.drawRoundRect(new RectF(0.5f, 0.5f, W - 0.5f, H - 0.5f), 18, 18, p);
        p.setStyle(Paint.Style.FILL);
        text(g, p, "길동무 · 내 위치", 18, 26, 11, false, sub, Paint.Align.LEFT, W - 36);
        text(g, p, d.from + " - " + d.cur + " - " + d.to, 18, 48, 14, true, text, Paint.Align.LEFT, W - 36);
        text(g, p, "도착예정시간: " + d.arr, 18, 68, 12, false, sub, Paint.Align.LEFT, W - 36);
        text(g, p, "남은시간 " + d.rem, 18, 100, 26, true, acc, Paint.Align.LEFT, W - 36);
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
            if (isCur) {
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
