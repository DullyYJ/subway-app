package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.PathInterpolator;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * 네이티브 노선도 플러그인 — 웹 SVG 노선도(확대·축소 때 렉이 걸리고 깨지던 것)를 대신하는 안드로이드 화면.
 *
 * 2026-10-14 신설 (YJ: "네이티브 지도 화면을 기능을 현재처럼 완벽히 구현할 수 있으면 진행해줘").
 *
 * 역할 분담
 *   · 이 플러그인: WebView 위의 지정한 사각형에 MetroMapView 를 얹고, 앱(JS)이 시키는 일(필터·찾아가기·맞춤)을 전달,
 *                  눌린 역·손가락 닿음·준비 완료·오류를 이벤트로 알린다.
 *   · 앱(JS): 역 팝업(출발/도착, 시간표)·검색창·호선 버튼·"내 위치" — 전부 지금 그대로 웹에서 한다. 지도 그림만 네이티브가 맡는다.
 *   · 계산(경로·시각)은 엔진(워커). 이 플러그인은 계산하지 않는다.
 *
 * 안전장치: 데이터 로드·그리기에 실패하면 error 이벤트/reject 로 알리고, 앱은 곧바로 예전 웹 SVG 노선도로 돌아간다.
 */
@CapacitorPlugin(name = "NativeMap")
public class NativeMapPlugin extends Plugin {

    private static final String ASSET = "public/metro_native.bin";
    private static volatile MetroMapData cached;

    private MetroMapView view;
    private ViewGroup root;
    private float dpr = 1f;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable releaseLater = new Runnable() {
        @Override public void run() { if (view != null && view.getVisibility() != View.VISIBLE) view.releaseBitmaps(); }
    };

    // ───────────── 표시 / 숨김 ─────────────
    /** show({x,y,w,h,dpr}) — CSS px 사각형(WebView 기준). 처음이면 데이터를 읽고 View 를 만든다. */
    @PluginMethod
    public void show(final PluginCall call) {
        final float x = f(call, "x"), y = f(call, "y"), w = f(call, "w"), h = f(call, "h");
        final float d = call.getFloat("dpr", 0f) > 0f ? call.getFloat("dpr", 1f) : getContext().getResources().getDisplayMetrics().density;
        final boolean doFit = call.getBoolean("fit", false);
        final String flt = call.getString("filter", "ALL");
        if (!(w > 1f && h > 1f)) { call.reject("사각형 크기가 없다"); return; }
        if (cached != null) { attach(call, x, y, w, h, d, doFit, flt); return; }
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    InputStream in = getContext().getAssets().open(ASSET);
                    MetroMapData m;
                    try { m = MetroMapData.parse(in); } finally { in.close(); }
                    cached = m;
                } catch (final Throwable t) {
                    ui.post(new Runnable() { @Override public void run() { call.reject("노선도 데이터를 못 읽었다: " + t); } });
                    return;
                }
                ui.post(new Runnable() { @Override public void run() { attach(call, x, y, w, h, d, doFit, flt); } });
            }
        }, "metro-native-load").start();
    }

    private void attach(PluginCall call, float x, float y, float w, float h, float d, boolean doFit, String flt) {
        try {
            Activity act = getActivity();
            if (act == null) { call.reject("화면이 없다"); return; }
            root = (ViewGroup) act.findViewById(android.R.id.content);
            if (root == null) { call.reject("루트 뷰가 없다"); return; }
            dpr = d;
            if (view == null) {
                view = new MetroMapView(getContext(), cached, d);
                view.setListener(new MetroMapView.Listener() {
                    @Override public void onStation(int op, float sx, float sy) {
                        MetroMapData m = view.data();
                        JSObject o = new JSObject();
                        o.put("name", m.labelName(op));
                        String alt = m.labelAlt(op);
                        if (alt != null) o.put("alt", alt);
                        o.put("x", (double) (sx / dpr));
                        o.put("y", (double) (sy / dpr));
                        notifyListeners("station", o);
                    }
                    @Override public void onGestureStart() { notifyListeners("gesture", new JSObject()); }
                    @Override public void onReady() { notifyListeners("ready", new JSObject()); }
                    @Override public void onError(String msg) { notifyListeners("error", new JSObject().put("message", msg)); }
                    @Override public void onCentered(int op) {
                        notifyListeners("centered", new JSObject().put("name", view.data().labelName(op)));
                    }
                });
                root.addView(view, new FrameLayout.LayoutParams(1, 1));
            }
            view.setFilter(flt);                                   // 다시 보일 때도 앱의 현재 호선 필터에 맞춘다
            ui.removeCallbacks(releaseLater);
            layout(x, y, w, h);
            view.setVisibility(View.VISIBLE);
            if (doFit) view.fit();
            call.resolve();
        } catch (Throwable t) {
            call.reject("노선도 화면을 못 만들었다: " + t);
        }
    }

    /**
     * 사각형만 바꾼다(팝업이 뜨면 줄이고, 닫히면 되돌림). 보이는 상태를 바꾸지 않는다.
     * anim(ms) > 0 이고 높이만 바뀌면 시트가 오르내리는 속도에 맞춰 '보이는 아래쪽 끝'을 부드럽게 옮긴다(ease: 3차 베지어 x1,y1,x2,y2).
     *   크기를 프레임마다 바꾸면 비트맵을 매번 다시 그려 끊기므로, 실제 크기는 한 번만 바꾸고 그 사이는 잘라내기(clipBounds)로 보여 준다.
     */
    @PluginMethod
    public void setRect(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                if (view == null) { call.resolve(); return; }
                float w = f(call, "w"), h = f(call, "h");
                if (!(w > 1f && h > 1f)) { call.resolve(); return; }
                if (call.getFloat("dpr", 0f) > 0f) dpr = call.getFloat("dpr", 1f);
                int anim = call.getInt("anim", 0) == null ? 0 : call.getInt("anim", 0);
                if (anim > 0 && view.getVisibility() == View.VISIBLE && animateRect(f(call, "x"), f(call, "y"), w, h, anim,
                        call.getFloat("e1", 0.4f), call.getFloat("e2", 0f), call.getFloat("e3", 0.2f), call.getFloat("e4", 1f))) {
                    call.resolve();
                    return;
                }
                layout(f(call, "x"), f(call, "y"), w, h);
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void hide(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                if (view != null) {
                    cancelRectAnim();
                    clearClip();
                    view.setVisibility(View.GONE);
                    ui.removeCallbacks(releaseLater);
                    ui.postDelayed(releaseLater, 30000L);       // 오래 숨겨 두면 큰 비트맵을 놓아준다
                }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void destroy(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() { removeView(); call.resolve(); }
        });
    }

    private void removeView() {
        if (view != null) {
            try { if (root != null) root.removeView(view); } catch (Throwable t) { /* 이미 빠짐 */ }
            view.destroy();
            view = null;
        }
    }

    // ───────────── 앱이 시키는 일 ─────────────
    @PluginMethod
    public void setFilter(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() { if (view != null) view.setFilter(call.getString("name", "ALL")); call.resolve(); }
        });
    }

    @PluginMethod
    public void fit(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() { if (view != null) view.fit(); call.resolve(); }
        });
    }

    /** centerOn({name, zoom(CSS 배율), flash}) → {found}. 이동이 끝나면 centered 이벤트. */
    @PluginMethod
    public void centerOn(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                boolean found = view != null && view.centerOn(call.getString("name", ""), call.getFloat("zoom", 0f), call.getBoolean("flash", true));
                JSObject o = new JSObject().put("found", found);
                if (found) o.put("name", view.data().labelName(view.data().findLabel(call.getString("name", ""))));
                call.resolve(o);
            }
        });
    }

    @PluginMethod
    public void ensureVisible(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                boolean found = view != null && view.ensureVisible(call.getString("name", ""));
                call.resolve(new JSObject().put("found", found));
            }
        });
    }

    /** setHint({text, bottom(CSS px)}) — 웹의 "역 이름 탭 → 출발/도착 설정" 안내를 지도 위에 그린다 */
    @PluginMethod
    public void setHint(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                if (view != null) view.setHint(call.getString("text", ""), f(call, "bottom") * dpr);
                call.resolve();
            }
        });
    }

    /** 지금 보이는 지도를 작은 JPEG(data URL)로. 웹 모달이 지도 위에 뜰 때 가려진 자리에 깔아 둔다. */
    @PluginMethod
    public void snapshot(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                try {
                    if (view == null) { call.resolve(new JSObject().put("data", "")); return; }
                    Bitmap bm = view.snapshot(Math.max(0.2f, Math.min(1f, call.getFloat("k", 0.5f))));
                    if (bm == null) { call.resolve(new JSObject().put("data", "")); return; }
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    bm.compress(Bitmap.CompressFormat.JPEG, 78, bo);
                    bm.recycle();
                    call.resolve(new JSObject().put("data", "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP)));
                } catch (Throwable t) {
                    call.resolve(new JSObject().put("data", ""));
                }
            }
        });
    }

    /** 상태 확인(시험·진단용): {active, visible} */
    @PluginMethod
    public void status(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                call.resolve(new JSObject().put("active", view != null).put("visible", view != null && view.getVisibility() == View.VISIBLE));
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        removeView();
        super.handleOnDestroy();
    }

    // ───────────── 도우미 ─────────────
    private static float f(PluginCall call, String k) {
        Float v = call.getFloat(k);
        return v == null ? 0f : v;
    }

    private void runUi(final PluginCall call, final Runnable r) {
        Activity act = getActivity();
        if (act == null) { call.reject("화면이 없다"); return; }
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try { r.run(); } catch (Throwable t) { call.reject(String.valueOf(t)); }
            }
        });
    }

    private ValueAnimator rectAnim;
    private int clipBottom = -1;

    private void cancelRectAnim() {
        if (rectAnim != null) { ValueAnimator a = rectAnim; rectAnim = null; try { a.cancel(); } catch (Throwable t) { /* 무시 */ } }
    }

    private void setClipBottom(int b, int width) {
        if (view == null) return;
        clipBottom = b;
        try { view.setClipBounds(new Rect(0, 0, Math.max(1, width), Math.max(1, b))); } catch (Throwable t) { /* 무시 */ }
        view.setVisBottom(b);
    }

    private void clearClip() {
        clipBottom = -1;
        if (view == null) return;
        try { view.setClipBounds(null); } catch (Throwable t) { /* 무시 */ }
        view.setVisBottom(-1f);
    }

    /** CSS px 사각형(WebView 기준) → 루트 뷰 안 픽셀 위치. WebView 가 루트 안에서 어디에 있는지를 더한다. */
    private FrameLayout.LayoutParams lpFor(float x, float y, float w, float h) {
        int offX = 0, offY = 0;
        try {
            View wv = getBridge().getWebView();
            int[] a = new int[2], b = new int[2];
            wv.getLocationInWindow(a);
            root.getLocationInWindow(b);
            offX = a[0] - b[0];
            offY = a[1] - b[1];
        } catch (Throwable t) { /* 못 구하면 0 */ }
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr)));
        lp.leftMargin = offX + Math.round(x * dpr);
        lp.topMargin = offY + Math.round(y * dpr);
        return lp;
    }

    private void layout(float x, float y, float w, float h) {
        if (view == null || root == null) return;
        cancelRectAnim();
        clearClip();
        view.setLayoutParams(lpFor(x, y, w, h));
    }

    /** 높이만 바뀌는 사각형 변경을 애니메이션으로. 할 수 없으면 false(호출한 쪽이 곧바로 바꾼다). */
    private boolean animateRect(float x, float y, float w, float h, int ms, float e1, float e2, float e3, float e4) {
        if (view == null || root == null) return false;
        ViewGroup.LayoutParams cp = view.getLayoutParams();
        if (!(cp instanceof FrameLayout.LayoutParams)) return false;
        final FrameLayout.LayoutParams cur = (FrameLayout.LayoutParams) cp;
        final FrameLayout.LayoutParams tlp = lpFor(x, y, w, h);
        final int fromB = clipBottom >= 0 ? clipBottom : cur.height, toB = tlp.height;
        boolean sameBox = Math.abs(cur.leftMargin - tlp.leftMargin) <= 1 && Math.abs(cur.topMargin - tlp.topMargin) <= 1 && Math.abs(cur.width - tlp.width) <= 1;
        if (!sameBox || fromB == toB || ms < 30) return false;
        cancelRectAnim();
        final int width = tlp.width;
        if (toB > cur.height) {
            // 커지는 쪽: 큰 크기로 먼저 바꾸되 지금 보이는 만큼만 보이게 잘라 두고, 잘라낸 끝을 늘린다
            tlp.leftMargin = cur.leftMargin; tlp.topMargin = cur.topMargin;
            view.setLayoutParams(tlp);
        }
        // 줄어드는 쪽: 크기는 끝에서 바꾼다(그동안 큰 채로 두고 아래쪽만 잘라 올린다)
        setClipBottom(fromB, width);
        final FrameLayout.LayoutParams fin = lpFor(x, y, w, h);
        ValueAnimator va = ValueAnimator.ofInt(fromB, toB);
        va.setDuration(ms);
        try { va.setInterpolator(new PathInterpolator(e1, e2, e3, e4)); } catch (Throwable t) { /* 기본 보간 */ }
        va.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator a) { setClipBottom((Integer) a.getAnimatedValue(), width); }
        });
        va.addListener(new AnimatorListenerAdapter() {
            private boolean cancelled;
            @Override public void onAnimationCancel(Animator a) { cancelled = true; }
            @Override public void onAnimationEnd(Animator a) {
                if (cancelled || rectAnim != a || view == null) return;
                rectAnim = null;
                clearClip();
                view.setLayoutParams(fin);
            }
        });
        rectAnim = va;
        va.start();
        return true;
    }
}
