package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.graphics.Canvas;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.FrameLayout;

import org.maplibre.android.MapLibre;
import org.maplibre.android.camera.CameraPosition;
import org.maplibre.android.camera.CameraUpdateFactory;
import org.maplibre.android.geometry.LatLng;
import org.maplibre.android.maps.MapLibreMap;
import org.maplibre.android.maps.MapLibreMapOptions;
import org.maplibre.android.maps.MapView;
import org.maplibre.android.maps.OnMapReadyCallback;
import org.maplibre.android.maps.Style;

/**
 * 정류장 지도의 벡터 타일 지도(웹 _addBaseTiles 와 같은 OpenFreeMap Liberty · MapLibre).
 * 화면 글(ScreenView) 위, 지도 자리에 MapView 를 얹고 그 위에 투명 덮개를 얹는다. 핀 · 안내 글 · 확대 단추는 덮개가 ScreenView 의 그림 · 누름 계산을 그대로 써서 그린다
 * (핀 자리는 엔진이 준 좌표를 지도와 같은 가운데 · 배율로 바꾼 값이라 지도가 움직여도 어긋나지 않는다).
 * 스타일을 못 받으면(오프라인 · 서버 문제) 준비되지 않은 채로 남아, 아래 ScreenView 의 OSM 타일 그림이 그대로 보인다(웹의 OSM 대체와 같다).
 * 배율: MapLibre 는 512dp 타일이라 ScreenView(화면 픽셀 · 256 타일) 배율 = MapLibre 배율 + 1 + log2(밀도).
 */
final class VecMap implements ScreenView.VecHost {
    static final String STYLE = "https://tiles.openfreemap.org/styles/liberty";
    private static final long STYLE_WAIT_MS = 12000L, SHOW_DELAY_MS = 450L;

    private final Activity act;
    private final FrameLayout holder;
    private final ScreenView sv;
    private final float dpr;
    private final double kz;                                   // 화면 픽셀 배율 − MapLibre 배율
    private final Handler h = new Handler(Looper.getMainLooper());

    private Box box;
    private MapView mv;
    private MapLibreMap map;
    private Overlay ov;
    private boolean styleOk, ready, failed, started, resumed, destroyed;
    private int rl, rt, rw, rh, appliedL = -1, appliedT = -1, appliedW = -1, appliedH = -1;
    private boolean hasPend; private double pendLa, pendLo, pendZ;
    private boolean applyQueued, createQueued;

    /** 앱을 켠 뒤 한가할 때: 지도 엔진(네이티브 라이브러리 · 싱글턴)을 미리 올려 둔다. 첫 지도 진입에서 이 비용이 사라진다. */
    static void warmUp(android.content.Context c) { try { MapLibre.getInstance(c.getApplicationContext()); } catch (Throwable ignored) { } }

    VecMap(Activity a, FrameLayout holder, ScreenView sv, float dpr) {
        this.act = a; this.holder = holder; this.sv = sv; this.dpr = dpr;
        this.kz = 1.0 + Math.log(Math.max(0.5f, dpr)) / Math.log(2.0);
    }

    /** 지도 위 손가락은 준비된 뒤에만 받는다(준비 전엔 아래 ScreenView 의 타일 지도가 받는다). */
    private final class Box extends FrameLayout {
        Box(android.content.Context c) { super(c); }
        @Override public boolean dispatchTouchEvent(MotionEvent e) {
            if (!ready) return false;
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) getParent().requestDisallowInterceptTouchEvent(true);
            return super.dispatchTouchEvent(e);
        }
    }

    /** 핀 · 안내 · 단추를 그리는 투명 덮개: 핀이나 단추 위에서 시작한 손가락만 받고, 나머지는 아래 지도로 넘긴다. */
    private final class Overlay extends View {
        private float dx, dy; private boolean moved, mine;
        Overlay(android.content.Context c) { super(c); }
        @Override protected void onDraw(Canvas cv) {
            sv.vecDraw(cv);
            if (sv.vecAnim() && isShown()) postInvalidateDelayed(50L);                // 내 위치 점 뒤로 퍼지는 고리
        }
        @Override public boolean onTouchEvent(MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    mine = sv.vecHit(e.getX(), e.getY());
                    if (!mine) return false;
                    dx = e.getX(); dy = e.getY(); moved = false;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (!mine) return false;
                    if (Math.abs(e.getX() - dx) > ViewConfiguration.get(getContext()).getScaledTouchSlop() || Math.abs(e.getY() - dy) > ViewConfiguration.get(getContext()).getScaledTouchSlop()) moved = true;
                    return true;
                case MotionEvent.ACTION_UP:
                    if (mine && !moved) sv.vecTap(e.getX(), e.getY());
                    mine = false;
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    mine = false;
                    return true;
                default:
                    return mine;
            }
        }
    }

    // ── ScreenView.VecHost ──
    @Override public void place(int l, int t, int w, int hh) {
        if (destroyed || failed) return;
        rl = l; rt = t; rw = w; rh = hh;
        if (w > 0 && box == null && !createQueued) { createQueued = true; h.post(new Runnable() { @Override public void run() { if (!destroyed && box == null) create(); applyRect.run(); } }); }      // 그리는 도중이 아니라 다음 박자에 만든다(첫 진입이 끊기지 않게)
        if (box == null || applyQueued) return;
        if (l == appliedL && t == appliedT && w == appliedW && hh == appliedH) return;
        applyQueued = true;
        h.post(applyRect);                                                              // 그리는 도중에 배치를 바꾸지 않는다
    }
    private final Runnable applyRect = new Runnable() { @Override public void run() {
        applyQueued = false;
        if (box == null || destroyed) return;
        appliedL = rl; appliedT = rt; appliedW = rw; appliedH = rh;
        if (rw <= 0 || rh <= 0) { box.setVisibility(View.GONE); return; }
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) box.getLayoutParams();
        if (lp == null) lp = new FrameLayout.LayoutParams(rw, rh);
        lp.width = rw; lp.height = rh; lp.leftMargin = sv.getLeft() + rl; lp.topMargin = sv.getTop() + rt; lp.gravity = android.view.Gravity.TOP | android.view.Gravity.START;
        box.setLayoutParams(lp);
        box.setVisibility(View.VISIBLE);
    } };
    @Override public void setCamera(double la, double lo, double zPx) {
        if (map == null || !styleOk) { hasPend = true; pendLa = la; pendLo = lo; pendZ = zPx; return; }
        try { map.moveCamera(CameraUpdateFactory.newCameraPosition(new CameraPosition.Builder().target(new LatLng(la, lo)).zoom(zPx - kz).build())); } catch (Throwable ignored) { }
    }
    @Override public void goTo(double la, double lo, double zPx) {
        if (map == null) return;
        try { map.animateCamera(CameraUpdateFactory.newLatLngZoom(new LatLng(la, lo), zPx - kz), 260); } catch (Throwable ignored) { }
    }
    @Override public boolean ready() { return ready; }

    // ── 만들기 ──
    private void create() {
        try {
            MapLibre.getInstance(act);
            MapLibreMapOptions opt = MapLibreMapOptions.createFromAttributes(act).textureMode(true);      // 화면 글 위에서 투명 · 겹침이 자연스러운 텍스처 방식
            mv = new MapView(act, opt);
            box = new Box(act);
            box.setAlpha(0.01f);                                                       // 0 이면 안 그려져 타일을 못 받는다
            box.addView(mv, new FrameLayout.LayoutParams(MATCH, MATCH));
            ov = new Overlay(act);
            ov.setVisibility(View.GONE);
            box.addView(ov, new FrameLayout.LayoutParams(MATCH, MATCH));
            box.setVisibility(View.GONE);
            holder.addView(box, new FrameLayout.LayoutParams(1, 1));
            mv.onCreate(null);
            if (started) mv.onStart();
            if (resumed) mv.onResume();
            mv.getMapAsync(new OnMapReadyCallback() {
                @Override public void onMapReady(MapLibreMap m) {
                    map = m;
                    try {
                        m.getUiSettings().setRotateGesturesEnabled(false);
                        m.getUiSettings().setTiltGesturesEnabled(false);
                        m.getUiSettings().setCompassEnabled(false);
                        m.getUiSettings().setLogoEnabled(false);
                        m.getUiSettings().setAttributionEnabled(false);
                        m.setMinZoomPreference(1.0);
                        m.setMaxZoomPreference(18.0);
                        m.addOnCameraMoveListener(new MapLibreMap.OnCameraMoveListener() { @Override public void onCameraMove() { push(); } });
                        m.addOnCameraIdleListener(new MapLibreMap.OnCameraIdleListener() { @Override public void onCameraIdle() { push(); } });
                        m.setStyle(new Style.Builder().fromUri(STYLE), new Style.OnStyleLoaded() {
                            @Override public void onStyleLoaded(Style style) {
                                styleOk = true;
                                if (hasPend) { hasPend = false; setCamera(pendLa, pendLo, pendZ); }
                                h.postDelayed(showIt, SHOW_DELAY_MS);                    // 첫 타일이 그려질 시간을 조금 준다
                            }
                        });
                    } catch (Throwable t) { fail(); }
                }
            });
            h.postDelayed(giveUp, STYLE_WAIT_MS);
        } catch (Throwable t) { fail(); }
    }
    private static final int MATCH = android.view.ViewGroup.LayoutParams.MATCH_PARENT;

    private final Runnable showIt = new Runnable() { @Override public void run() {
        if (destroyed || failed || !styleOk || ready) return;
        ready = true;
        ov.setVisibility(View.VISIBLE);
        box.animate().alpha(1f).setDuration(160L).start();
        push();
        sv.invalidate();
    } };
    private final Runnable giveUp = new Runnable() { @Override public void run() { if (!styleOk) fail(); } };
    private void fail() {
        failed = true; ready = false;
        h.removeCallbacks(showIt);
        try { if (box != null) box.setVisibility(View.GONE); } catch (Throwable ignored) { }
        sv.invalidate();
    }
    private void push() {
        if (map == null || !ready && !styleOk) return;
        try {
            CameraPosition c = map.getCameraPosition();
            LatLng t = c == null ? null : c.target;
            if (t == null) return;
            sv.vecCamera(t.getLatitude(), t.getLongitude(), c.zoom + kz);
            if (ov != null) ov.invalidate();
        } catch (Throwable ignored) { }
    }

    // ── 수명(액티비티를 따라간다) ──
    void onStart() { started = true; if (mv != null) mv.onStart(); }
    void onResume() { resumed = true; if (mv != null) mv.onResume(); }
    void onPause() { resumed = false; if (mv != null) mv.onPause(); }
    void onStop() { started = false; if (mv != null) mv.onStop(); }
    void onLowMemory() { if (mv != null) mv.onLowMemory(); }
    void onDestroy() {
        destroyed = true; ready = false;
        h.removeCallbacksAndMessages(null);
        try { if (mv != null) mv.onDestroy(); } catch (Throwable ignored) { }
    }
}
