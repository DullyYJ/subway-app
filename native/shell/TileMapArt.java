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

    static final int C_STOP = 0xFF0066FF, C_FOCUS = 0xFFE8482E, C_ME = 0xFFFF9F0A, C_WHITE = 0xFFFFFFFF, C_BG = 0xFFE8EEF4;       // 웹 .bus-map-pin(#0066FF) · .on(#e8482e) · .bus-me-dot(#ff9f0a)
    private static final Paint P = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private static final RectF R = new RectF();

    /**
     * cv 는 (0,0)~(vw.w, vw.h) 픽셀 영역에 그린다. focus 는 강조할 핀 번호(없으면 -1) — 그 핀은 이름표를 단다.
     */
    static void draw(Canvas cv, TileLoader tl, TileMapCore.View vw, List<TileMapCore.Pin> pins, float dpr, int focus) { draw(cv, tl, vw, pins, dpr, focus, true, 0L); }

    /** label = 고른 핀에 이름표를 달까 · nowMs > 0 이면 내 위치 점 뒤로 퍼지는 고리(웹 busMePulse 1.6초)를 그린다. */
    static void draw(Canvas cv, TileLoader tl, TileMapCore.View vw, List<TileMapCore.Pin> pins, float dpr, int focus, boolean label, long nowMs) {
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
                if (isMe) drawMe(cv, (float) s[0], (float) s[1], dpr, nowMs); else drawPin(cv, (float) s[0], (float) s[1], dpr, p.n, isF);
            }
        }
        if (label && focus >= 0 && focus < pins.size() && pins.get(focus).name.length() > 0) {
            double[] s = vw.toScreen(pins.get(focus).la, pins.get(focus).lo);
            drawLabel(cv, (float) s[0], (float) s[1] - 22f * dpr, dpr, pins.get(focus).name, vw.w);
        }
        drawAttribution(cv, vw.w, vw.h, dpr);
    }

    private static void drawPin(Canvas cv, float x, float y, float dpr, String n, boolean focus) {
        float r = (focus ? 16.25f : 13f) * dpr;                     // 웹 26px 핀 · 고르면 1.25배
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
    private static void drawMe(Canvas cv, float x, float y, float dpr, long nowMs) {
        P.setStyle(Paint.Style.FILL);
        if (nowMs > 0L) {                                                      // 웹: 점 뒤에서 1배 → 2.8배로 퍼지며 사라지는 같은 색 원(.55 → 0)
            float f = (nowMs % 1600L) / 1600f, e = 1f - (1f - f) * (1f - f);
            P.setColor((((int) (255f * 0.55f * (1f - e))) << 24) | (C_ME & 0x00FFFFFF));
            cv.drawCircle(x, y, 7.5f * dpr * (1f + 1.8f * e), P);
        }
        P.setColor(0x4D000000); cv.drawCircle(x, y + 1.2f * dpr, 8.7f * dpr, P);
        P.setColor(C_WHITE); cv.drawCircle(x, y, 7.5f * dpr, P);               // 15px 점 + 2px 흰 테두리
        P.setColor(C_ME); cv.drawCircle(x, y, 5.5f * dpr, P);
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
