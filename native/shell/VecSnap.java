package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import org.maplibre.android.MapLibre;
import org.maplibre.android.camera.CameraPosition;
import org.maplibre.android.geometry.LatLng;
import org.maplibre.android.maps.Style;
import org.maplibre.android.snapshotter.MapSnapshot;
import org.maplibre.android.snapshotter.MapSnapshotter;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 움직이지 않는 지도(맛집 · 장소 등록 · 큰 지도)의 바탕 그림 — 정류장 지도와 같은 벡터 지도(OpenFreeMap Liberty · MapLibre)를 한 장 그림으로 받아 둔다.
 * 어디를 어느 배율로 볼지는 엔진이 준 핀으로 ScreenView 가 이미 정한 TileMapCore.View(가운데 · 배율 · 크기) 그대로이고, 여기서는 그 자리의 그림만 받아 깐다(계산을 새로 하지 않는다).
 * 손으로 옮기거나 확대하는 동안은 받아 둔 그림을 그만큼 옮기고 늘려 그리고, 손을 떼고 잠시 뒤 새 그림을 받는다. 받아 둔 그림은 보이는 자리보다 넓게(가장자리 여백) 받아 옮겨도 빈 자리가 거의 안 생긴다.
 * 벡터 지도를 못 받으면(오프라인 · 서버 문제) 잠시 동안 예전 OSM 타일 그림으로 대신한다(TileMapArt).
 * 배율: MapLibre 는 512dp 타일이라 화면 픽셀 배율 = MapLibre 배율 + 1 + log2(밀도). 그림은 dp 크기 × 밀도 배(=화면 픽셀)로 받는다.
 */
final class VecSnap {
    private static final long DEBOUNCE_MS = 220L, WAIT_MS = 15000L, FAIL_HOLD_MS = 20000L;
    private static final int MAX_KEEP = 3;
    private static VecSnap inst;

    static synchronized VecSnap get(Context c) {
        if (inst == null) inst = new VecSnap(c.getApplicationContext());
        return inst;
    }

    private static final class Snap { Bitmap bmp; double la, lo, z; }
    private static final class Req { String key; double la, lo, z; int pw, ph; float dpr; }

    private final Context app;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Paint P = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final RectF R = new RectF();
    private final LinkedHashMap<String, Snap> snaps = new LinkedHashMap<String, Snap>(8, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Snap> e) { return size() > MAX_KEEP; }
    };
    private Req want, flying;
    private boolean busy, againAfter;
    private long failedAt = -1L;
    private MapSnapshotter snapper;
    private int token;

    private VecSnap(Context app) { this.app = app; }

    /** 벡터 바탕을 못 받는 중이면 true — 이때만 OSM 타일 그림으로 대신한다. */
    boolean useRaster() { return failedAt >= 0L && SystemClock.uptimeMillis() - failedAt < FAIL_HOLD_MS; }

    /** (0,0)~(vw.w, vw.h) 에 벡터 바탕을 그린다. 받아 둔 그림이 있으면 true. 그리는 도중 불러도 되고(받기는 다음 틈에), 주 스레드에서 부른다. */
    boolean draw(Canvas cv, TileMapCore.View vw, float dpr) {
        String key = vw.w + "x" + vw.h;
        request(key, vw, dpr);
        Snap s = snaps.get(key);
        if (s == null || s.bmp == null) return false;
        double sc = Math.pow(2.0, vw.zoom - s.z);
        double[] c = vw.toScreen(s.la, s.lo);
        float bw = (float) (s.bmp.getWidth() * sc), bh = (float) (s.bmp.getHeight() * sc);
        R.set((float) c[0] - bw / 2f, (float) c[1] - bh / 2f, (float) c[0] + bw / 2f, (float) c[1] + bh / 2f);
        cv.drawBitmap(s.bmp, null, R, P);
        return true;
    }

    // ── 받기 ──
    private void request(String key, TileMapCore.View vw, float dpr) {
        if (useRaster()) return;
        Snap s = snaps.get(key);
        boolean same = s != null && Math.abs(s.z - vw.zoom) < 0.01 && Math.abs(TileMapCore.xOf(s.lo, vw.zoom) - TileMapCore.xOf(vw.clo, vw.zoom)) < 1.0 && Math.abs(TileMapCore.yOf(s.la, vw.zoom) - TileMapCore.yOf(vw.cla, vw.zoom)) < 1.0;
        if (same) { want = null; return; }
        Req r = want;
        boolean moved = r == null || !key.equals(r.key) || Math.abs(r.la - vw.cla) > 1e-9 || Math.abs(r.lo - vw.clo) > 1e-9 || Math.abs(r.z - vw.zoom) > 1e-6;
        if (!moved) return;                                                          // 이미 이 모습으로 받기를 걸어 두었다
        r = new Req(); r.key = key; r.la = vw.cla; r.lo = vw.clo; r.z = vw.zoom; r.pw = vw.w; r.ph = vw.h; r.dpr = dpr;
        want = r;
        h.removeCallbacks(fire);
        h.postDelayed(fire, s == null ? 0L : DEBOUNCE_MS);                           // 처음은 곧바로 · 손으로 움직이는 중이면 멈춘 뒤에
    }
    private final Runnable fire = new Runnable() { @Override public void run() {
        if (want == null) return;
        if (busy) { againAfter = true; return; }
        shoot(want);
    } };

    private void shoot(final Req r) {
        busy = true; flying = r;
        final int my = ++token;
        try {
            MapLibre.getInstance(app);
            double pad = (double) r.pw * r.ph * 1.96 > 5.0e6 ? 1.0 : 1.4;                // 큰 화면은 여백 없이(메모리)
            int wDp = Math.max(1, (int) Math.round(r.pw / (double) r.dpr * pad)), hDp = Math.max(1, (int) Math.round(r.ph / (double) r.dpr * pad));
            double kz = 1.0 + Math.log(Math.max(0.5f, r.dpr)) / Math.log(2.0);
            CameraPosition cam = new CameraPosition.Builder().target(new LatLng(r.la, r.lo)).zoom(Math.max(0.0, r.z - kz)).build();
            MapSnapshotter.Options o = new MapSnapshotter.Options(wDp, hDp).withPixelRatio(r.dpr).withStyleBuilder(new Style.Builder().fromUri(VecMap.STYLE)).withCameraPosition(cam).withLogo(false);
            final MapSnapshotter sn = new MapSnapshotter(app, o);
            snapper = sn;
            h.postDelayed(new Runnable() { @Override public void run() { if (token == my && busy) { try { sn.cancel(); } catch (Throwable ignored) { } finish(my, null); } } }, WAIT_MS);
            sn.start(new MapSnapshotter.SnapshotReadyCallback() {
                @Override public void onSnapshotReady(MapSnapshot snapshot) { Bitmap b = null; try { b = snapshot.getBitmap(); } catch (Throwable ignored) { } finish(my, b); }
            }, new MapSnapshotter.ErrorHandler() {
                @Override public void onError(String message) { finish(my, null); }
            });
        } catch (Throwable t) { finish(my, null); }
    }

    private void finish(int my, Bitmap b) {
        if (my != token || !busy) return;
        busy = false;
        Req r = flying; flying = null; snapper = null;
        if (b != null && r != null) {
            Snap s = new Snap(); s.bmp = b; s.la = r.la; s.lo = r.lo; s.z = r.z;
            snaps.put(r.key, s);
            failedAt = -1L;
            if (want == r) want = null;
        } else {
            failedAt = SystemClock.uptimeMillis();
            want = null;                                                             // 잠시 뒤 다시 그릴 때 처음부터 다시 받는다
        }
        TileLoader.get(app).ping();                                                  // 그리는 쪽에 다시 그리라고 알린다(받은 그림을 깔고 · 못 받았으면 타일 그림으로)
        if (againAfter) { againAfter = false; if (want != null && !useRaster()) h.postDelayed(fire, 0L); }
    }
}
