package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

import java.util.List;

/** 크게 보는 타일 지도(안드로이드 계층): 끌어서 옮기고, 두 손가락으로 확대·축소, 핀을 누르면 이름표. 오른쪽 위 [닫기]. */
final class TileMapView extends View {
    interface Listener { void onClose(); void onPin(int index); }

    private final TileLoader tl;
    private final float dpr;
    private final List<TileMapCore.Pin> pins;
    private TileMapCore.View vw;
    private int focus;
    private Listener listener;
    private final ScaleGestureDetector sg;
    private final Runnable tick = new Runnable() { @Override public void run() { invalidate(); } };
    private float lastX, lastY, downX, downY;
    private long downT;
    private boolean moved, scaling;
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF closeR = new RectF();

    TileMapView(Context c, List<TileMapCore.Pin> pins, int focus, float dpr) {
        super(c);
        this.tl = TileLoader.get(c); this.dpr = dpr; this.pins = pins; this.focus = focus;
        sg = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector d) {
                if (vw != null) { vw.zoomBy(Math.log(d.getScaleFactor()) / Math.log(2.0), d.getFocusX(), d.getFocusY()); invalidate(); }
                return true;
            }
        });
    }
    void setListener(Listener l) { listener = l; }

    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); tl.watch(tick); }
    @Override protected void onDetachedFromWindow() { tl.unwatch(tick); super.onDetachedFromWindow(); }

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        super.onSizeChanged(w, h, ow, oh);
        if (w <= 0 || h <= 0) return;
        TileMapCore.View old = vw;
        vw = new TileMapCore.View(w, h);
        if (old != null) { vw.cla = old.cla; vw.clo = old.clo; vw.zoom = old.zoom; }
        else if (focus >= 0 && focus < pins.size()) { vw.cla = pins.get(focus).la; vw.clo = pins.get(focus).lo; vw.zoom = 16.5; }
        else vw.fit(pins, Math.round(60 * dpr), 3, 17);
    }

    @Override protected void onDraw(Canvas cv) {
        if (vw == null) return;
        TileMapArt.draw(cv, tl, vw, pins, dpr, focus);
        float bw = 64f * dpr, bh = 34f * dpr, m = 12f * dpr;
        closeR.set(getWidth() - bw - m, m, getWidth() - m, m + bh);
        p.setStyle(Paint.Style.FILL); p.setColor(0xF2FFFFFF);
        cv.drawRoundRect(closeR, 10f * dpr, 10f * dpr, p);
        p.setColor(0xFF1A2533); p.setTextAlign(Paint.Align.CENTER); p.setTypeface(Typeface.DEFAULT_BOLD); p.setTextSize(14f * dpr);
        Paint.FontMetrics fm = p.getFontMetrics();
        cv.drawText("닫기", closeR.centerX(), closeR.centerY() - (fm.ascent + fm.descent) / 2f, p);
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
        if (vw == null) return true;
        sg.onTouchEvent(e);
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                lastX = downX = e.getX(); lastY = downY = e.getY(); downT = System.currentTimeMillis(); moved = false; scaling = false;
                return true;
            case MotionEvent.ACTION_POINTER_DOWN: scaling = true; moved = true; return true;
            case MotionEvent.ACTION_MOVE: {
                if (sg.isInProgress() || e.getPointerCount() > 1) { scaling = true; lastX = e.getX(); lastY = e.getY(); return true; }
                if (scaling) { lastX = e.getX(); lastY = e.getY(); scaling = false; return true; }          // 두 손가락 뒤 한 손가락이 남을 때 튀지 않게
                float dx = e.getX() - lastX, dy = e.getY() - lastY;
                if (!moved && Math.abs(e.getX() - downX) < 8f * dpr && Math.abs(e.getY() - downY) < 8f * dpr) return true;
                moved = true; vw.pan(dx, dy); lastX = e.getX(); lastY = e.getY(); invalidate();
                return true;
            }
            case MotionEvent.ACTION_UP:
                if (!moved && System.currentTimeMillis() - downT < 500) tap(e.getX(), e.getY());
                return true;
            default: return true;
        }
    }

    private void tap(float x, float y) {
        if (closeR.contains(x, y)) { if (listener != null) listener.onClose(); return; }
        int best = -1; double bd = 28f * dpr;
        for (int i = 0; i < pins.size(); i++) {
            if ("m".equals(pins.get(i).k)) continue;
            double[] s = vw.toScreen(pins.get(i).la, pins.get(i).lo);
            double d = Math.hypot(s[0] - x, s[1] - y);
            if (d < bd) { bd = d; best = i; }
        }
        if (best >= 0) { focus = best; invalidate(); if (listener != null) listener.onPin(best); }
    }
}
