package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;

import java.util.List;

/** 타일 지도 그리기(안드로이드 계층): 화면 픽셀 좌표로 타일 · 핀 · 이름표 · 출처 표시를 그린다. 목록 안 작은 지도와 크게 보기가 같이 쓴다. */
final class TileMapArt {
    private TileMapArt() { }

    static final int C_STOP = 0xFF1D9BF0, C_FOCUS = 0xFFF07830, C_ME = 0xFF0A84FF, C_WHITE = 0xFFFFFFFF, C_BG = 0xFFE8EEF4;
    private static final Paint P = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private static final RectF R = new RectF();

    /**
     * cv 는 (0,0)~(vw.w, vw.h) 픽셀 영역에 그린다. focus 는 강조할 핀 번호(없으면 -1) — 그 핀은 이름표를 단다.
     */
    static void draw(Canvas cv, TileLoader tl, TileMapCore.View vw, List<TileMapCore.Pin> pins, float dpr, int focus) {
        P.setStyle(Paint.Style.FILL); P.setColor(C_BG);
        cv.drawRect(0, 0, vw.w, vw.h, P);
        for (int[] t : vw.tiles()) {
            Bitmap b = tl.peek(t[0], t[1], t[2]);
            if (b == null) continue;
            R.set(t[3], t[4], t[3] + t[5], t[4] + t[5]);
            cv.drawBitmap(b, null, R, P);
        }
        // 정류장·장소 → 고른 핀 → 내 위치 순(내 위치가 맨 위)
        for (int pass = 0; pass < 3; pass++) {
            for (int i = 0; i < pins.size(); i++) {
                TileMapCore.Pin p = pins.get(i);
                boolean isMe = "m".equals(p.k), isF = i == focus || "f".equals(p.k);
                if (pass == 0 && (isMe || isF)) continue;
                if (pass == 1 && (isMe || !isF)) continue;
                if (pass == 2 && !isMe) continue;
                double[] s = vw.toScreen(p.la, p.lo);
                if (s[0] < -40 || s[1] < -40 || s[0] > vw.w + 40 || s[1] > vw.h + 40) continue;
                if (isMe) drawMe(cv, (float) s[0], (float) s[1], dpr); else drawPin(cv, (float) s[0], (float) s[1], dpr, p.n, isF);
            }
        }
        if (focus >= 0 && focus < pins.size() && pins.get(focus).name.length() > 0) {
            double[] s = vw.toScreen(pins.get(focus).la, pins.get(focus).lo);
            drawLabel(cv, (float) s[0], (float) s[1] - 22f * dpr, dpr, pins.get(focus).name, vw.w);
        }
        drawAttribution(cv, vw.w, vw.h, dpr);
    }

    private static void drawPin(Canvas cv, float x, float y, float dpr, String n, boolean focus) {
        float r = (focus ? 15f : 12f) * dpr;
        P.setStyle(Paint.Style.FILL); P.setColor(0x33000000);
        cv.drawCircle(x, y + 1.5f * dpr, r + 1f * dpr, P);
        P.setColor(focus ? C_FOCUS : C_STOP);
        cv.drawCircle(x, y, r, P);
        P.setStyle(Paint.Style.STROKE); P.setStrokeWidth(2f * dpr); P.setColor(C_WHITE);
        cv.drawCircle(x, y, r, P);
        if (n != null && n.length() > 0) {
            P.setStyle(Paint.Style.FILL); P.setColor(C_WHITE); P.setTextAlign(Paint.Align.CENTER); P.setTypeface(Typeface.DEFAULT_BOLD);
            P.setTextSize((n.length() > 2 ? 10f : 12f) * dpr);
            Paint.FontMetrics fm = P.getFontMetrics();
            cv.drawText(n, x, y - (fm.ascent + fm.descent) / 2f, P);
        }
        P.setTextAlign(Paint.Align.LEFT); P.setTypeface(Typeface.DEFAULT);
    }
    private static void drawMe(Canvas cv, float x, float y, float dpr) {
        P.setStyle(Paint.Style.FILL); P.setColor(0x330A84FF);
        cv.drawCircle(x, y, 18f * dpr, P);
        P.setColor(C_WHITE); cv.drawCircle(x, y, 8.5f * dpr, P);
        P.setColor(C_ME); cv.drawCircle(x, y, 6.5f * dpr, P);
    }
    private static void drawLabel(Canvas cv, float x, float y, float dpr, String text, int vw) {
        P.setTextSize(12f * dpr); P.setTypeface(Typeface.DEFAULT_BOLD); P.setTextAlign(Paint.Align.LEFT);
        float tw = P.measureText(text), padX = 9f * dpr, h = 24f * dpr;
        float l = Math.max(4f * dpr, Math.min(vw - tw - 2 * padX - 4f * dpr, x - tw / 2f - padX));
        R.set(l, y - h, l + tw + 2 * padX, y);
        P.setStyle(Paint.Style.FILL); P.setColor(0xE6FFFFFF);
        cv.drawRoundRect(R, 8f * dpr, 8f * dpr, P);
        P.setColor(0xFF1A2533);
        Paint.FontMetrics fm = P.getFontMetrics();
        cv.drawText(text, l + padX, (R.top + R.bottom) / 2f - (fm.ascent + fm.descent) / 2f, P);
        P.setTypeface(Typeface.DEFAULT);
    }
    private static void drawAttribution(Canvas cv, int w, int h, float dpr) {
        String t = "© OpenStreetMap";
        P.setTextSize(9f * dpr); P.setTypeface(Typeface.DEFAULT); P.setTextAlign(Paint.Align.LEFT);
        float tw = P.measureText(t), pad = 4f * dpr;
        R.set(w - tw - 2 * pad, h - 14f * dpr, w, h);
        P.setStyle(Paint.Style.FILL); P.setColor(0xB3FFFFFF);
        cv.drawRect(R, P);
        P.setColor(0xFF444444);
        Paint.FontMetrics fm = P.getFontMetrics();
        cv.drawText(t, w - tw - pad, (R.top + R.bottom) / 2f - (fm.ascent + fm.descent) / 2f, P);
    }
}
