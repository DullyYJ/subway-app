package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.compose.ui.platform.ComposeView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;

/**
 * 네이티브 장면 플러그인 — 혼잡도 카드의 캐릭터 장면을 웹 캔버스 대신 안드로이드 Compose Canvas 로 그린다.
 *
 * 2026-10-16 신설 (YJ: "프론트엔드와 렌더링 방식을 웹뷰 캔버스에서 안드로이드 순수 네이티브(Kotlin / Jetpack Compose Canvas 및 햅틱)로 완전히 전환").
 *
 * 역할 분담(원칙: 계산은 엔진이, 그림은 앱이)
 *   · 엔진(워커 /scene): 어떤 장면인지(mode·look·cast·traits) 정한다. 바뀌지 않았다.
 *   · 앱(JS): 엔진 답을 받아 이 플러그인에 그대로 넘기고(apply), 장면 칸의 위치(show/setRect)를 알려 준다. 판단은 하지 않는다.
 *   · 이 플러그인 + SceneDriver + SceneCore: 받은 장면을 60~120fps 로 그리고, 캐릭터를 집어 옮기는 손가락과 착륙 진동을 맡는다.
 *   · 안전장치: 읽기·그리기에 실패하면 error 이벤트를 보내고, 앱은 곧바로 예전 웹 캔버스로 돌아간다.
 *
 * 손가락 나누기(스크롤 꼬임 해결) — MainActivity.dispatchTouchEvent 가 route(ev) 를 먼저 부른다.
 *   · 캐릭터 위에서 손가락이 내려오면 장면은 '길게 누르기 대기'를 시작하고, 웹뷰도 손가락을 그대로 받는다(스크롤이 가능하도록).
 *   · 0.38초 안에 10dp 넘게 움직이면 장면은 대기를 풀고 웹뷰가 스크롤한다 — 서로 안 엉킨다.
 *   · 0.38초 동안 가만히 있으면 캐릭터를 집는다: 웹뷰에는 ACTION_CANCEL 을 한 번 보내 스크롤을 끊고, 그 손가락의 MOVE/UP 은 장면만 받는다.
 */
@CapacitorPlugin(name = "SceneNative")
public class SceneNativePlugin extends Plugin implements SceneDriver.Listener {

    /** MainActivity 가 손가락을 먼저 물어볼 수 있게 하는 현재 플러그인. */
    private static volatile SceneNativePlugin current;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private SceneDriver driver;
    private SceneHost host;
    private ComposeView compose;
    private ViewGroup root;
    private float dpr = 1f;
    private boolean shown, composeOn, hotRefresh;
    private Rect clip;                       // 장면 틀 기준 보이는 부분(px). null 이면 전부.
    private final int[] loc = new int[2];
    private static final long STALE_MS = 1500L;

    // 손가락 추적
    private boolean tracking, swallowing;
    private long downTime;

    private final Runnable coolRefresh = new Runnable() { @Override public void run() { setRefresh(false); } };
    /** 숨은 지 3초가 지나도 안 돌아오면 그때서야 Compose 를 거둔다(스크롤을 흔들 때마다 만들고 부수지 않는다). */
    private final Runnable lateDispose = new Runnable() {
        @Override public void run() { if (!shown && compose != null && composeOn) { SceneCompose.hide(compose); composeOn = false; } }
    };

    // ───────────── 표시 / 숨김 ─────────────
    /** show({x,y,w,h,dpr,dark,haptics,clip:{l,t,r,b}}) — CSS px 사각형(WebView 기준). 처음이면 틀과 운전석을 만든다. */
    @PluginMethod
    public void show(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                final float w = f(call, "w"), h = f(call, "h");
                if (!(w > 8f && h > 8f)) { call.reject("사각형 크기가 없다"); return; }
                Activity act = getActivity();
                root = (ViewGroup) act.findViewById(android.R.id.content);
                if (root == null) { call.reject("루트 뷰가 없다"); return; }
                float d = call.getFloat("dpr", 0f) > 0f ? call.getFloat("dpr", 1f) : getContext().getResources().getDisplayMetrics().density;
                dpr = d;
                if (driver == null) {
                    driver = new SceneDriver(getContext(), SceneNativePlugin.this);
                    driver.load();
                }
                driver.setHaptics(call.getBoolean("haptics", true));
                if (host == null) {
                    host = new SceneHost(getContext());
                    compose = SceneCompose.create(getContext());
                    host.addView(compose, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                    root.addView(host, new FrameLayout.LayoutParams(1, 1));
                }
                current = SceneNativePlugin.this;
                ui.removeCallbacks(lateDispose);
                place(call);
                host.setVisibility(View.VISIBLE);
                // 프레임 시계가 죽어 있으면(0.. 1.5초 넘게 한 번도 안 불렸다) 새로 만든다 — 앱이 '멈춤'을 알아채고 다시 켜 달라고 했을 때도 같은 길
                if (composeOn && driver.frameAgeMs() > STALE_MS) { try { SceneCompose.hide(compose); } catch (Throwable t) { /* 무시 */ } composeOn = false; }
                if (!composeOn) { SceneCompose.show(compose, driver); composeOn = true; driver.touchClock(); }
                driver.setPaused(false);
                shown = true;
                call.resolve(new JSObject().put("loaded", driver.isLoaded()));
            }
        });
    }

    /** 사각형·테마만 바꾼다(보이는 상태는 그대로). */
    @PluginMethod
    public void setRect(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                if (host == null || driver == null) { call.resolve(); return; }
                if (!(f(call, "w") > 8f && f(call, "h") > 8f)) { call.resolve(); return; }
                if (call.getFloat("dpr", 0f) > 0f) dpr = call.getFloat("dpr", 1f);
                place(call);
                call.resolve();
            }
        });
    }

    /** 틀의 자리·크기·잘림과 장면 배치(dp·밀도·테마)를 한꺼번에 맞춘다. */
    private void place(PluginCall call) {
        float x = f(call, "x"), y = f(call, "y"), w = f(call, "w"), h = f(call, "h");
        boolean dark = call.getBoolean("dark", false);
        int offX = 0, offY = 0;
        try {
            View wv = getBridge().getWebView();
            int[] a = new int[2], b = new int[2];
            wv.getLocationInWindow(a); root.getLocationInWindow(b);
            offX = a[0] - b[0]; offY = a[1] - b[1];
        } catch (Throwable t) { /* 못 구하면 0 */ }
        int pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(pw, ph);
        lp.leftMargin = offX + Math.round(x * dpr); lp.topMargin = offY + Math.round(y * dpr);
        host.setLayoutParams(lp);
        JSObject c = null;
        try { c = call.getObject("clip"); } catch (Throwable t) { c = null; }
        if (c != null && c.has("l") && c.has("t") && c.has("r") && c.has("b")) {
            Rect r = new Rect(Math.round((float) c.optDouble("l", 0) * dpr), Math.round((float) c.optDouble("t", 0) * dpr),
                    Math.round((float) c.optDouble("r", w) * dpr), Math.round((float) c.optDouble("b", h) * dpr));
            if (r.right <= r.left || r.bottom <= r.top) r.set(0, 0, 1, 1);
            clip = r;
        } else clip = null;
        try { host.setClipBounds(clip); } catch (Throwable t) { /* 무시 */ }
        driver.layout(w, h, dpr, dark);
    }

    /** apply({res}) — 엔진 /scene 답을 그대로 받아 그린다. 반환 {running}: mode 가 없으면 false(그릴 것 없음). */
    @PluginMethod
    public void apply(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                if (driver == null) { call.reject("아직 show 하지 않았다"); return; }
                JSObject res = null;
                try { res = call.getObject("res"); } catch (Throwable t) { res = null; }
                if (res == null) { call.reject("res 가 없다"); return; }
                boolean on = driver.apply(res.toString());
                call.resolve(new JSObject().put("running", on).put("loaded", driver.isLoaded()));
            }
        });
    }

    /** 장면을 멈추고(그릴 것 없음) 숨긴다. */
    @PluginMethod
    public void stop(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() { if (driver != null) driver.stop(); hideNow(); call.resolve(); }
        });
    }

    @PluginMethod
    public void hide(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() { hideNow(); call.resolve(); }
        });
    }

    private void hideNow() {
        endTrack();
        if (host != null) host.setVisibility(View.GONE);
        if (driver != null) driver.setPaused(true);                                                // 움직임·그리기는 바로 쉰다
        shown = false;
        setRefresh(false);
        ui.removeCallbacks(lateDispose); ui.postDelayed(lateDispose, 3000L);                       // 오래 숨어 있을 때만 프레임 시계를 끈다
    }

    @PluginMethod
    public void destroy(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() { teardown(); call.resolve(); }
        });
    }

    private void teardown() {
        hideNow();
        ui.removeCallbacks(lateDispose);
        if (compose != null && composeOn) { try { SceneCompose.hide(compose); } catch (Throwable t) { /* 무시 */ } composeOn = false; }
        try { if (root != null && host != null) root.removeView(host); } catch (Throwable t) { /* 이미 빠짐 */ }
        host = null; compose = null; composeOn = false;
        if (driver != null) { driver.destroy(); driver = null; }
        if (current == this) current = null;
    }

    @PluginMethod
    public void setHaptics(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() { if (driver != null) driver.setHaptics(call.getBoolean("on", true)); call.resolve(); }
        });
    }

    /** 지금 그림을 작은 WebP(data URL)로. 스크롤·팝업 때 웹이 정지 사진으로 깔아 둔다. */
    @PluginMethod
    public void snapshot(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                try {
                    if (driver == null) { call.resolve(new JSObject().put("data", "")); return; }
                    float k = Math.max(0.3f, Math.min(1f, call.getFloat("k", 0.6f)));
                    Bitmap bm = driver.snapshot(k);
                    if (bm == null) { call.resolve(new JSObject().put("data", "")); return; }
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    bm.compress(android.os.Build.VERSION.SDK_INT >= 30 ? Bitmap.CompressFormat.WEBP_LOSSY : Bitmap.CompressFormat.WEBP, 70, bo);
                    bm.recycle();
                    call.resolve(new JSObject().put("data", "data:image/webp;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP)));
                } catch (Throwable t) {
                    call.resolve(new JSObject().put("data", ""));
                }
            }
        });
    }

    /** 상태 확인(시험·진단용): {active, visible, loaded, running, mode} */
    @PluginMethod
    public void status(final PluginCall call) {
        runUi(call, new Runnable() {
            @Override public void run() {
                JSObject o = new JSObject().put("active", host != null).put("visible", shown && host != null && host.getVisibility() == View.VISIBLE).put("loaded", driver != null && driver.isLoaded());
                // age: 프레임 시계(Compose)가 마지막으로 불린 뒤 지난 ms — 보이는 동안 크면 시계가 죽은 것(앱이 보고 다시 켠다). 안 보이면 -1.
                o.put("age", (shown && composeOn && driver != null) ? (int) Math.min(Integer.MAX_VALUE, driver.frameAgeMs()) : -1);
                o.put("running", driver != null && driver.isRunning());
                if (driver != null && driver.mode() != null) o.put("mode", driver.mode());
                call.resolve(o);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        teardown();
        super.handleOnDestroy();
    }

    // ───────────── 손가락 나누기 ─────────────
    /**
     * MainActivity.dispatchTouchEvent 가 가장 먼저 부른다. true 면 장면이 이 손가락을 가져갔다(웹뷰에 주지 않는다).
     * 캐릭터를 아직 안 집었으면 늘 false — 웹뷰가 스크롤·탭을 평소처럼 받는다.
     */
    public static boolean route(MotionEvent ev) {
        SceneNativePlugin p = current;
        if (p == null) return false;
        try { return p.routeImpl(ev); } catch (RuntimeException e) { p.endTrack(); return false; }
    }

    private boolean routeImpl(MotionEvent ev) {
        if (host == null || driver == null || !shown || host.getVisibility() != View.VISIBLE) { if (tracking) endTrack(); return false; }
        int a = ev.getActionMasked();
        if (a == MotionEvent.ACTION_DOWN) {
            endTrack();
            host.getLocationOnScreen(loc);
            float x = ev.getRawX() - loc[0], y = ev.getRawY() - loc[1];
            if (x < 0 || y < 0 || x > host.getWidth() || y > host.getHeight()) return false;
            if (clip != null && !clip.contains(Math.round(x), Math.round(y))) return false;
            tracking = driver.touchDown(x, y);
            if (tracking) { downTime = ev.getDownTime(); setRefresh(true); ui.removeCallbacks(coolRefresh); ui.postDelayed(coolRefresh, 4000L); }
            return false;                                         // 웹뷰도 같이 받는다(캐릭터를 안 집으면 스크롤이어야 하니까)
        }
        if (!tracking) return false;
        switch (a) {
            case MotionEvent.ACTION_MOVE: {
                host.getLocationOnScreen(loc);
                driver.touchMove(ev.getRawX() - loc[0], ev.getRawY() - loc[1]);
                return swallowing || driver.isHeld();
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL: {
                boolean took = swallowing || driver.isHeld();
                driver.touchUp();
                tracking = false; swallowing = false;
                return took;
            }
            default:
                return swallowing;                                  // 둘째 손가락 등: 집은 동안엔 장면이 삼킨다
        }
    }

    private void endTrack() {
        if (tracking && driver != null) { try { driver.touchUp(); } catch (RuntimeException e) { /* 무시 */ } }
        tracking = false; swallowing = false;
    }

    // ───────────── SceneDriver.Listener ─────────────
    @Override public void onReady() { notifyListeners("ready", new JSObject()); }

    @Override public void onError(String message) { notifyListeners("error", new JSObject().put("message", message)); }

    /** 캐릭터를 집었다 → 웹뷰의 진행 중 손가락(스크롤)에 CANCEL 을 한 번 보내 끊는다. 이후 이 손가락은 장면만 받는다. */
    @Override public void onHeld() {
        if (!tracking) return;
        swallowing = true;
        try {
            View wv = getBridge().getWebView();
            long now = SystemClock.uptimeMillis();
            MotionEvent c = MotionEvent.obtain(downTime, now, MotionEvent.ACTION_CANCEL, 0f, 0f, 0);
            wv.dispatchTouchEvent(c);
            c.recycle();
        } catch (Throwable t) { /* 웹뷰가 없으면 할 일 없다 */ }
    }

    /** 잡아 끌거나 착륙 연출 중에만 주사율을 끝까지 쓴다(120Hz 폰). 평소엔 시스템 기본(+ 장면은 60Hz 로 아낀다). */
    @Override public void onHot(final boolean hot) {
        ui.removeCallbacks(coolRefresh);
        if (hot) setRefresh(true); else ui.postDelayed(coolRefresh, 1200L);
    }

    private void setRefresh(boolean on) {
        if (on == hotRefresh) return;
        try {
            Activity act = getActivity(); if (act == null) return;
            WindowManager.LayoutParams lp = act.getWindow().getAttributes();
            float best = 0f;
            if (on && android.os.Build.VERSION.SDK_INT >= 23) {
                android.view.Display.Mode[] modes = act.getWindowManager().getDefaultDisplay().getSupportedModes();
                android.view.Display.Mode cur = act.getWindowManager().getDefaultDisplay().getMode();
                for (android.view.Display.Mode m : modes)
                    if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight() && m.getRefreshRate() > best) best = m.getRefreshRate();
            }
            if (android.os.Build.VERSION.SDK_INT >= 23) { lp.preferredRefreshRate = on ? best : 0f; act.getWindow().setAttributes(lp); }
            hotRefresh = on;
        } catch (Throwable t) { /* 주사율 힌트는 없어도 된다 */ }
    }

    // ───────────── 도우미 ─────────────
    private void runUi(final PluginCall call, final Runnable r) {
        Activity act = getActivity();
        if (act == null) { call.reject("화면이 없다"); return; }
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try { r.run(); } catch (Throwable t) { call.reject(String.valueOf(t)); }
            }
        });
    }
    private static float f(PluginCall call, String k) {
        Float v = call.getFloat(k);
        return v == null ? 0f : v;
    }
}
