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
    static void draw(Canvas cv, TileLoader tl, TileMapCore.View vw, List<TileMapCore.Pin> pins, float dpr, int focus, boolean label, long nowMs) { draw(cv, tl, vw, pins, dpr, focus, label, nowMs, null); }

    /** path = 걷는 길 [la0,lo0,la1,lo1…](없으면 null) — 타일 위 · 핀 아래에 웹 _foodDrawRoute 처럼(주황 점선 + 방향 화살표) 그린다. */
    static void draw(Canvas cv, TileLoader tl, TileMapCore.View vw, List<TileMapCore.Pin> pins, float dpr, int focus, boolean label, long nowMs, double[] path) {
        P.setStyle(Paint.Style.FILL); P.setColor(C_BG);
        cv.drawRect(0, 0, vw.w, vw.h, P);
        for (int[] t : vw.tiles()) {
            Bitmap b = tl.peek(t[0], t[1], t[2]);
            if (b == null) continue;
            R.set(t[3], t[4], t[3] + t[5], t[4] + t[5]);
            cv.drawBitmap(b, null, R, P);
        }
        if (path != null && path.length >= 4) drawPath(cv, vw, path, dpr);
        drawPins(cv, vw, pins, dpr, focus, label, nowMs);
        drawAttribution(cv, vw.w, vw.h, dpr, "© OpenStreetMap");
    }

    static final int C_ROUTE = 0xFFF07830, C_FROM = 0xFF2B7CFF, C_TO = 0xFFE8482E;      // 웹 경로 #f07830 · 출발 #2b7cff · 도착 #e8482e
    private static android.graphics.DashPathEffect dash; private static float dashDpr;
    private static final android.graphics.Path PT = new android.graphics.Path();
    /** 웹 _foodDrawRoute: 두께 4 · 점선 2,9 · 둥근 끝 · 진행 방향 화살표(45m 간격, 최대 8개, 첫 화살표는 반 칸 뒤). */
    static void drawPath(Canvas cv, TileMapCore.View vw, double[] path, float dpr) {
        int n = path.length / 2;
        float[] xs = new float[n], ys = new float[n];
        PT.rewind();
        for (int i = 0; i < n; i++) {
            double[] sc = vw.toScreen(path[i * 2], path[i * 2 + 1]);
            xs[i] = (float) sc[0]; ys[i] = (float) sc[1];
            if (i == 0) PT.moveTo(xs[i], ys[i]); else PT.lineTo(xs[i], ys[i]);
        }
        P.setStyle(Paint.Style.STROKE); P.setColor(C_ROUTE); P.setAlpha(242); P.setStrokeWidth(4f * dpr);
        P.setStrokeCap(Paint.Cap.ROUND); P.setStrokeJoin(Paint.Join.ROUND);
        if (dash == null || dashDpr != dpr) { dash = new android.graphics.DashPathEffect(new float[] { 2f * dpr, 9f * dpr }, 0f); dashDpr = dpr; }
        P.setPathEffect(dash);
        cv.drawPath(PT, P);
        P.setPathEffect(null); P.setStrokeCap(Paint.Cap.BUTT); P.setStrokeJoin(Paint.Join.MITER); P.setAlpha(255);
        double total = 0; double[] seg = new double[Math.max(0, n - 1)];
        for (int i = 0; i < n - 1; i++) {
            double dy = (path[i * 2 + 2] - path[i * 2]) * 111320.0, dx = (path[i * 2 + 3] - path[i * 2 + 1]) * 111320.0 * Math.cos(Math.toRadians(path[i * 2]));
            seg[i] = Math.sqrt(dx * dx + dy * dy); total += seg[i];
        }
        if (total < 12) return;
        double step = Math.max(45.0, total / 8.0), acc = 0, nextAt = step * 0.5; int made = 0;
        for (int i = 0; i < n - 1 && made < 8; i++) {
            if (seg[i] <= 0) continue;
            while (acc + seg[i] >= nextAt && made < 8) {
                float t = (float) ((nextAt - acc) / seg[i]);
                drawArrow(cv, xs[i] + (xs[i + 1] - xs[i]) * t, ys[i] + (ys[i + 1] - ys[i]) * t, (float) Math.toDegrees(Math.atan2(xs[i + 1] - xs[i], -(ys[i + 1] - ys[i]))), dpr);
                nextAt += step; made++;
            }
            acc += seg[i];
        }
    }
    private static void drawArrow(Canvas cv, float x, float y, float deg, float dpr) {          // 웹 SVG 11x13 화살표(주황 채움 · 흰 테두리 1)
        cv.save(); cv.translate(x, y); cv.rotate(deg); cv.scale(dpr, dpr);
        PT.rewind(); PT.moveTo(0f, -6.5f); PT.lineTo(5.5f, 6.5f); PT.lineTo(0f, 3.1f); PT.lineTo(-5.5f, 6.5f); PT.close();
        P.setStyle(Paint.Style.FILL); P.setColor(C_ROUTE); cv.drawPath(PT, P);
        P.setStyle(Paint.Style.STROKE); P.setStrokeWidth(1f); P.setStrokeJoin(Paint.Join.ROUND); P.setColor(C_WHITE); cv.drawPath(PT, P);
        P.setStrokeJoin(Paint.Join.MITER); P.setStyle(Paint.Style.FILL);
        cv.restore();
    }
    /** 웹 _foodEndMarker: 색 알약 글(흰 굵은 11px) + 아래 점(흰 테두리 2) — 점 맨 아래가 좌표. */
    private static void drawEnd(Canvas cv, float x, float y, float dpr, String label, int color) {
        float dr = 6.5f * dpr;
        P.setStyle(Paint.Style.FILL); P.setColor(0x4D000000); cv.drawCircle(x, y - dr + 1.2f * dpr, dr + 1f * dpr, P);
        P.setColor(C_WHITE); cv.drawCircle(x, y - dr, dr, P);
        P.setColor(color); cv.drawCircle(x, y - dr, dr - 2f * dpr, P);
        P.setTextSize(11f * dpr); P.setTypeface(ScreenView.face(true)); P.setTextAlign(Paint.Align.LEFT);
        float tw = P.measureText(label), px = 8f * dpr, ph = 17f * dpr, bottom = y - 15f * dpr;
        R.set(x - tw / 2f - px, bottom - ph, x + tw / 2f + px, bottom);
        P.setColor(0x4D000000); R.offset(0f, 1f * dpr); cv.drawRoundRect(R, 10f * dpr, 10f * dpr, P); R.offset(0f, -1f * dpr);
        P.setColor(color); cv.drawRoundRect(R, 10f * dpr, 10f * dpr, P);
        P.setColor(C_WHITE);
        Paint.FontMetrics fm = P.getFontMetrics();
        cv.drawText(label, x - tw / 2f, (R.top + R.bottom) / 2f - (fm.ascent + fm.descent) / 2f, P);
        P.setTypeface(ScreenView.face(false));
    }

    /** 핀 · 이름표만 그린다(벡터 지도 위 투명 덮개도 같은 그림을 쓴다 — 핀 모양은 한 곳). */
    static void drawPins(Canvas cv, TileMapCore.View vw, List<TileMapCore.Pin> pins, float dpr, int focus, boolean label, long nowMs) {
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
                if (isMe) drawMe(cv, (float) s[0], (float) s[1], dpr, nowMs);
                else if ("a".equals(p.k) || "b".equals(p.k)) drawEnd(cv, (float) s[0], (float) s[1], dpr, p.n.length() > 0 ? p.n : ("a".equals(p.k) ? "출발" : "도착"), "a".equals(p.k) ? C_FROM : C_TO);
                else drawPin(cv, (float) s[0], (float) s[1], dpr, p.n, isF);
            }
        }
        if (label && focus >= 0 && focus < pins.size() && pins.get(focus).name.length() > 0) {
            double[] s = vw.toScreen(pins.get(focus).la, pins.get(focus).lo);
            drawLabel(cv, (float) s[0], (float) s[1] - 22f * dpr, dpr, pins.get(focus).name, vw.w);
        }
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
            P.setStyle(Paint.Style.FILL); P.setColor(C_WHITE); P.setTextAlign(Paint.Align.CENTER); P.setTypeface(ScreenView.face(true));
            P.setTextSize((n.length() > 2 ? 10f : 12f) * dpr);
            Paint.FontMetrics fm = P.getFontMetrics();
            cv.drawText(n, x, y - (fm.ascent + fm.descent) / 2f, P);
        }
        P.setTextAlign(Paint.Align.LEFT); P.setTypeface(ScreenView.face(false));
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
        P.setTextSize(12f * dpr); P.setTypeface(ScreenView.face(true)); P.setTextAlign(Paint.Align.LEFT);
        float tw = P.measureText(text), padX = 9f * dpr, h = 24f * dpr;
        float l = Math.max(4f * dpr, Math.min(vw - tw - 2 * padX - 4f * dpr, x - tw / 2f - padX));
        R.set(l, y - h, l + tw + 2 * padX, y);
        P.setStyle(Paint.Style.FILL); P.setColor(0xE6FFFFFF);
        cv.drawRoundRect(R, 8f * dpr, 8f * dpr, P);
        P.setColor(0xFF1A2533);
        Paint.FontMetrics fm = P.getFontMetrics();
        cv.drawText(text, l + padX, (R.top + R.bottom) / 2f - (fm.ascent + fm.descent) / 2f, P);
        P.setTypeface(ScreenView.face(false));
    }
    static void drawAttribution(Canvas cv, int w, int h, float dpr, String t) {
        P.setTextSize(9f * dpr); P.setTypeface(ScreenView.face(false)); P.setTextAlign(Paint.Align.LEFT);
        float tw = P.measureText(t), pad = 4f * dpr;
        R.set(w - tw - 2 * pad, h - 14f * dpr, w, h);
        P.setStyle(Paint.Style.FILL); P.setColor(0xB3FFFFFF);
        cv.drawRect(R, P);
        P.setColor(0xFF444444);
        Paint.FontMetrics fm = P.getFontMetrics();
        cv.drawText(t, w - tw - pad, (R.top + R.bottom) / 2f - (fm.ascent + fm.descent) / 2f, P);
    }
}
