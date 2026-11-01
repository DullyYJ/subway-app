package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.AccelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.SecureRandom;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 길동무 키즈 연동(부모 쪽) — 2026-11. 자녀와 연결된 부모에게만 켜지는 '키즈 감시 화면'과 설정 줄.
 *  · 무엇을 보일지 · 어떻게 말할지 · 도착했는지는 모두 키즈 서버 엔진이 정한다. 이 클래스는 엔진이 준 화면을 ScreenView 에 꽂고, 눌림을 그대로 엔진에 보내기만 한다.
 *  · 연결 전에는 아무것도 하지 않는다: 통신 0 · 화면 0 · 홈 버튼을 3초 눌러도 변화 없음. (설정 맨 위의 '길동무 키즈 연결' 한 줄만 있다)
 *  · 실시간: 키즈 화면이 떠 있는 동안에만 엔진에 긴 대기(/p/wait)를 걸어 둔다 — 자녀가 무언가 하면 엔진이 곧바로 새 화면을 내려 준다. 화면을 닫으면 통신도 멈춘다.
 *  · 받은 화면은 뒤 스레드에서 읽고 검증까지 마쳐 두므로 주 스레드는 꽂기만 한다. 마지막 화면은 저장해 두었다가 다시 열 때 바로 보여 주고 뒤에서 새로 받는다(SWR).
 */
public final class KidsHub {
    static final String BASE = "https://gildongmu-kids.phg0643.workers.dev";
    private static final String K_ID = "kid.id", K_SEC = "kid.sec", K_REG = "kid.reg", K_NODES = "kid.nodes", K_START = "kid.start", K_HUB = "kid.hub", K_CID = "kid.cid";
    private static final long HOLD_MS = 3000L;
    private static final Pattern CODE = Pattern.compile("[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}");
    /** 연결 전에 설정 맨 위에 보이는 한 줄(연결하면 엔진이 준 줄들로 바뀐다). */
    private static final String UNLINKED_ROW = "[{\"t\":\"panel\",\"pad\":[16,12,16,0],\"ip\":[16,6,16,6],\"fill\":\"card\",\"line\":\"border\",\"r\":14,\"kids\":[{\"t\":\"navrow\",\"title\":\"길동무 키즈 연결\",\"sub\":\"자녀 폰의 QR이나 시크릿 키로 연결해요\",\"act\":{\"a\":\"call\",\"v\":\"kl.open\"},\"size\":14,\"top\":true}]}]";

    private final Activity act;
    private final ShellCore.Store store;
    private final float dpr;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final FrameLayout layer;
    private final ScreenView hubV, noteV;
    private final View[] slide;
    private final Runnable settingsChanged;
    private final ExecutorService io = Executors.newCachedThreadPool(new ThreadFactory() {
        @Override public Thread newThread(Runnable r) { Thread t = new Thread(r, "kids-hub"); t.setDaemon(true); return t; }
    });

    private volatile boolean linked, alive = true;
    private volatile String cid = "";
    private volatile int epoch = 0;
    private volatile HttpURLConnection waitConn;
    private volatile String qt = "c";
    private boolean open, paused;
    private long lastRefresh = 0L;
    private String lastHubJson = "";
    // 떠 있는 팝업(장소 · 대화 · 미션 · 응원문구 · 연결)
    private Dialog sheetD;
    private ScreenView sheetV;
    private String sheetKind = "", sheetJson = "";
    private boolean sheetQuiet;
    // 홈 버튼 3초 꾹
    private boolean holdArmed, holdFired;
    private float hx, hy;
    private View holdTabs;
    private final Runnable holdRun = new Runnable() {
        @Override public void run() {
            if (!holdArmed) return;
            holdFired = true; holdArmed = false;
            buzz(act, 35L);
            try {                                                         // 눌려 있던 탭 칸은 '취소'로 놓아 준다(홈 탭이 눌린 것으로 처리되지 않게)
                if (holdTabs != null) { long t = SystemClock.uptimeMillis(); MotionEvent c = MotionEvent.obtain(t, t, MotionEvent.ACTION_CANCEL, hx, hy, 0); holdTabs.onTouchEvent(c); c.recycle(); }
            } catch (Throwable ignored) { }
            toggle();
        }
    };

    public KidsHub(Activity a, ShellCore.Store st, float dpr, FrameLayout wrap, View[] slide, Runnable settingsChanged) {
        this.act = a; this.store = st; this.dpr = dpr; this.slide = slide; this.settingsChanged = settingsChanged;
        cid = st.get(K_CID, "");
        String nodes = st.get(K_NODES, "");
        linked = nodes.length() > 2;
        ScreenCore.settingsExtra = extraJson();
        layer = new FrameLayout(a);
        layer.setClickable(true);
        layer.setVisibility(View.GONE);
        hubV = new ScreenView(a);
        hubV.setDpr(dpr);
        hubV.setPalette(ShellCore.palette(ShellCore.theme(st)));
        hubV.setListener(new Host(null));
        layer.addView(hubV, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        noteV = new ScreenView(a);                                           // 짧은 안내 한 줄(아래 토스트 대신 위에 잠깐 뜨는 알약) — 글은 엔진이 준 것
        noteV.setDpr(dpr);
        noteV.setPalette(ShellCore.palette(ShellCore.theme(st)));
        noteV.setVisibility(View.GONE);
        noteV.setListener(new ScreenView.Listener() {
            @Override public void onAction(ScreenCore.Act a) { }
            @Override public void onSet(ScreenCore.Act a, boolean on) { }
            @Override public void onSearch(ScreenCore.Act a, String q) { }
            @Override public void onInputFocus(boolean on) { }
            @Override public void onFirstDraw() { }
            @Override public void onText(String key, String value, String kind) { }
            @Override public void onContentH(final float dp) {
                main.post(new Runnable() { @Override public void run() {
                    ViewGroup.LayoutParams lp = noteV.getLayoutParams();
                    int hh = Math.max(1, Math.round(dp * KidsHub.this.dpr));
                    if (lp != null && lp.height != hh) { lp.height = hh; noteV.setLayoutParams(lp); }
                } });
            }
        });
        FrameLayout.LayoutParams nlp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(60f * dpr), Gravity.TOP);
        nlp.topMargin = Math.round(8f * dpr);
        layer.addView(noteV, nlp);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        lp.bottomMargin = Math.round(56f * dpr);
        wrap.addView(layer, lp);
    }

    // ───────── 상태 ─────────
    public boolean linked() { return linked; }
    public boolean isOpen() { return open; }
    /** 앱을 켤 때 키즈 화면으로 시작할지 — 연결되어 있고 설정이 켜졌을 때만. */
    public boolean wantStart() { return linked && "1".equals(store.get(K_START, "0")); }

    private String extraJson() {
        if (!linked) return UNLINKED_ROW;
        String n = store.get(K_NODES, "");
        return n.length() > 2 ? n : UNLINKED_ROW;
    }

    /** 상태 표시줄 · 내비게이션 막대 자리를 비운다(탭 막대 위까지만 덮는다). */
    public void insets(int l, int t, int r, int b) {
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) layer.getLayoutParams();
        lp.setMargins(l, t, r, b + Math.round(56f * dpr));
        layer.setLayoutParams(lp);
    }

    public void setPalette(int[] pal) {
        hubV.setPalette(pal);
        noteV.setPalette(pal);
        if (sheetV != null) sheetV.setPalette(pal);
    }

    public void resume() { paused = false; if (open) { startLoop(loopView()); } refreshLink(false); }
    public void pause() { paused = true; stopLoop(); }
    public void destroy() { alive = false; stopLoop(); closeSheet(true); }

    // ───────── 홈 버튼 3초 꾹 ─────────
    /** 하단 탭 막대의 터치를 먼저 본다. 3초 꾹을 눌렀으면 true(그 뒤 손가락 움직임은 탭으로 치지 않는다). 연결 전에는 항상 false. */
    public boolean tabsTouch(MotionEvent e, View tabs) {
        int a = e.getActionMasked();
        if (a == MotionEvent.ACTION_DOWN) {
            holdFired = false; holdArmed = false; main.removeCallbacks(holdRun);
            if (linked) {
                float w = tabs.getWidth(), x = e.getX();
                if (w > 0f && x >= w * 2f / 5f && x < w * 3f / 5f) {            // 다섯 칸 가운데(홈)
                    hx = e.getX(); hy = e.getY(); holdTabs = tabs; holdArmed = true;
                    main.postDelayed(holdRun, HOLD_MS);
                }
            }
            return false;
        }
        if (a == MotionEvent.ACTION_MOVE) {
            if (holdArmed && (Math.abs(e.getX() - hx) > 14f * dpr || Math.abs(e.getY() - hy) > 14f * dpr)) { holdArmed = false; main.removeCallbacks(holdRun); }
            return holdFired;
        }
        if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) {
            boolean was = holdFired;
            holdArmed = false; holdFired = false; main.removeCallbacks(holdRun);
            if (!was && a == MotionEvent.ACTION_UP && open) closeNow();        // 다른 탭을 짧게 누르면 키즈 화면은 바로 내려간다
            return was;
        }
        return holdFired;
    }

    public boolean onBack() {
        if (sheetD != null && sheetD.isShowing()) { closeSheet(false); return true; }
        if (open) { close(true); return true; }
        return false;
    }

    public void toggle() {
        if (!linked) return;                                                   // 연결 안 된 사람은 아무 변화 없음
        if (open) close(true); else open(true);
    }

    // ───────── 키즈 화면 열고 닫기(오른쪽에서 왼쪽으로 · 돌아갈 땐 왼쪽에서 오른쪽으로 넘어간다) ─────────
    public void open(boolean anim) {
        if (!linked || open) return;
        open = true;
        layer.setVisibility(View.VISIBLE);
        layer.bringToFront();
        showSaved();
        fetchHub();
        if (!paused) startLoop("hub");
        float w = width();
        if (anim) {
            layer.setTranslationX(w);
            layer.animate().translationX(0f).setDuration(300L).setInterpolator(new DecelerateInterpolator(1.6f)).start();
            for (final View v : slide) if (v != null) v.animate().translationX(-w * 0.25f).setDuration(300L).setInterpolator(new DecelerateInterpolator(1.6f)).withEndAction(new Runnable() { @Override public void run() { v.setTranslationX(0f); } }).start();
        } else layer.setTranslationX(0f);
    }

    public void close(boolean anim) {
        if (!open) return;
        open = false;
        closeSheet(true);
        stopLoop();
        float w = width();
        if (anim) {
            layer.animate().translationX(w).setDuration(260L).setInterpolator(new AccelerateInterpolator(1.3f)).withEndAction(new Runnable() { @Override public void run() { if (!open) layer.setVisibility(View.GONE); layer.setTranslationX(0f); } }).start();
            for (final View v : slide) if (v != null) { v.setTranslationX(-w * 0.25f); v.animate().translationX(0f).setDuration(260L).setInterpolator(new DecelerateInterpolator(1.4f)).start(); }
        } else { layer.animate().cancel(); layer.setVisibility(View.GONE); layer.setTranslationX(0f); }
    }

    private void closeNow() { close(false); }

    private float width() {
        int w = layer.getWidth();
        if (w <= 0) { DisplayMetrics dm = act.getResources().getDisplayMetrics(); w = dm.widthPixels; }
        return w;
    }

    // ───────── 설정 줄 ─────────
    /** 설정 화면에서 눌린 것 가운데 키즈 것(kl.* · kh.* · 시작 화면 스위치)을 가져간다. */
    public boolean settingsAct(ScreenCore.Act a, boolean on) {
        if (a == null) return false;
        if ("set".equals(a.a) && "kidsHome".equals(a.key)) { setStart(on); return true; }
        if ("call".equals(a.a) && a.v != null && (a.v.startsWith("kl.") || a.v.startsWith("kh."))) { send(a.v, a.id, a.t, null, null); return true; }
        return false;
    }

    private void setStart(final boolean on) {
        store.put(K_START, on ? "1" : "0");
        send("kl.start", "", on ? "1" : "0", null, null);
    }

    // ───────── 연결 상태 새로 받기(앱을 켤 때 · 연결·해제 뒤) ─────────
    public void refreshLink(boolean force) {
        long now = SystemClock.elapsedRealtime();
        if (store.get(K_ID, "").length() == 0) return;                          // 한 번도 연결을 시도한 적 없으면 통신하지 않는다
        if (!force && now - lastRefresh < 20000L) return;
        lastRefresh = now;
        io.execute(new Runnable() { @Override public void run() {
            String r = call("GET", "/p/setrow", null, 10000);
            if (r == null) return;
            try {
                JSONObject o = new JSONObject(r);
                if (!o.optBoolean("ok", false)) return;
                JSONArray nodes = o.optJSONArray("nodes");
                boolean nl = nodes != null && nodes.length() > 0;
                String nj = nl ? nodes.toString() : "";
                boolean changed = nl != linked || !nj.equals(store.get(K_NODES, "")) || o.optInt("start", 0) != ("1".equals(store.get(K_START, "0")) ? 1 : 0);
                store.put(K_NODES, nj);
                store.put(K_START, o.optInt("start", 0) == 1 ? "1" : "0");
                linked = nl;
                ScreenCore.settingsExtra = extraJson();
                if (!changed) return;
                main.post(new Runnable() { @Override public void run() {
                    if (!linked && open) close(true);
                    if (settingsChanged != null) settingsChanged.run();
                } });
            } catch (Throwable ignored) { }
        } });
    }

    // ───────── 화면 받기 ─────────
    private void showSaved() {
        final String c = store.get(K_HUB, "");
        if (c.length() == 0 || lastHubJson.length() > 0) return;
        io.execute(new Runnable() { @Override public void run() {
            try { final ScreenCore.Screen sc = ScreenCore.load(c); main.post(new Runnable() { @Override public void run() { if (open && lastHubJson.length() == 0) { hubV.setScreen(sc, false); } } }); } catch (Throwable ignored) { }
        } });
    }

    private void fetchHub() {
        final int my = epoch;
        io.execute(new Runnable() { @Override public void run() {
            String r = call("GET", "/p/screen?v=hub&cid=" + enc(cid), null, 10000);
            take("hub", r, my, false);
        } });
    }

    /** 화면 받은 것을 읽고(뒤 스레드) 맞는 칸에 꽂는다(주 스레드). 끝났으면 false(연결이 없어졌을 때). */
    private boolean take(final String view, String r, final int my, boolean fromWait) {
        if (r == null) return true;
        try {
            JSONObject o = new JSONObject(r);
            if (!o.optBoolean("ok", false)) return true;
            if (o.has("cid") && o.optString("cid", "").length() > 0 && !o.optString("cid").equals(cid)) { cid = o.optString("cid"); store.put(K_CID, cid); }
            if (o.optBoolean("gone", false) || (o.has("linked") && o.optInt("linked", 1) == 0)) {
                refreshLink(true);
                return false;
            }
            JSONObject s = o.optJSONObject("screen");
            if (s == null) return true;
            final String js = s.toString();
            final ScreenCore.Screen sc = ScreenCore.load(js);
            main.post(new Runnable() { @Override public void run() { putScreen(view, sc, js, my); } });
        } catch (Throwable ignored) { }
        return true;
    }

    private void putScreen(String view, ScreenCore.Screen sc, String js, int my) {
        if (my != epoch && !"hub".equals(view)) return;
        if ("hub".equals(view)) {
            if (!open || js.equals(lastHubJson)) return;
            lastHubJson = js;
            hubV.setScreen(sc, true);
            if (js.length() < 150000) store.put(K_HUB, js);
        } else if (sheetD != null && sheetD.isShowing() && sheetKind.equals(view)) {
            if (js.equals(sheetJson)) return;
            sheetJson = js;
            sheetV.setScreen(sc, true);
        }
    }

    // ───────── 실시간: 보고 있는 화면에 긴 대기를 건다 ─────────
    private String loopView() { return sheetD != null && sheetD.isShowing() && ("chat".equals(sheetKind) || "quest".equals(sheetKind)) ? sheetKind : "hub"; }

    private void stopLoop() {
        epoch++;
        HttpURLConnection c = waitConn;
        if (c != null) { final HttpURLConnection cc = c; io.execute(new Runnable() { @Override public void run() { try { cc.disconnect(); } catch (Throwable ignored) { } } }); }
    }

    private void startLoop(final String view) {
        stopLoop();
        final int my = epoch;
        io.execute(new Runnable() { @Override public void run() {
            long since = -1L; int fails = 0;
            while (alive && my == epoch) {
                String path = "/p/wait?v=" + view + "&cid=" + enc(cid) + "&since=" + since + ("quest".equals(view) ? "&qt=" + qt : "");
                String r = call("GET", path, null, 22000, true);
                if (!alive || my != epoch) return;
                if (r == null) { fails++; nap(Math.min(500L * fails, 4000L)); continue; }
                fails = 0;
                try {
                    JSONObject o = new JSONObject(r);
                    if (!o.optBoolean("ok", false)) { nap(1500L); continue; }
                    since = o.optLong("rev", since);
                } catch (Throwable e) { nap(1500L); continue; }
                if (!take(view, r, my, true)) return;
            }
        } });
    }

    private static void nap(long ms) { try { Thread.sleep(ms); } catch (InterruptedException ignored) { } }

    // ───────── 눌림 보내기(엔진이 새 화면을 돌려준다) ─────────
    private void send(final String v, final String id, final String t, final Map<String, String> f, final ScreenView src) {
        final String sk = sheetKind;
        io.execute(new Runnable() { @Override public void run() {
            try {
                if (!ensureReg()) { note("연결하지 못했어요. 잠시 뒤에 다시 해 보세요"); return; }
                JSONObject b = new JSONObject();
                b.put("v", v == null ? "" : v);
                if (id != null && id.length() > 0) b.put("id", id);
                if (t != null && t.length() > 0) b.put("t", t);
                b.put("cid", cid);
                if (f != null) { JSONObject fo = new JSONObject(); for (Map.Entry<String, String> e : f.entrySet()) fo.put(e.getKey(), e.getValue() == null ? "" : e.getValue()); b.put("f", fo); }
                String r = call("POST", "/p/act", b.toString(), 12000);
                if (r == null) { note("보내지 못했어요. 연결을 확인해 주세요"); return; }
                final JSONObject o = new JSONObject(r);
                if (!o.optBoolean("ok", false)) { note(o.optString("err", "처리하지 못했어요")); return; }
                final JSONObject s = o.optJSONObject("screen");
                final String js = s == null ? "" : s.toString();
                final ScreenCore.Screen sc = js.length() == 0 ? null : ScreenCore.load(js);
                final String notice = o.optString("notice", ""), clear = o.optString("clear", ""), kind = o.optString("sheet", "");
                final boolean close = o.optBoolean("close", false), hub = o.optInt("hub", 0) == 1;
                if (o.optString("cid", "").length() > 0 && !o.optString("cid").equals(cid)) { cid = o.optString("cid"); store.put(K_CID, cid); }
                if (v != null && v.startsWith("kl.") && !"kl.open".equals(v) && !"kl.close".equals(v) && !"kl.scan".equals(v)) refreshLink(true);
                main.post(new Runnable() { @Override public void run() {
                    if (notice.length() > 0 && sheetD == null) note(notice);          // 팝업 안의 안내는 엔진이 팝업 화면 안에 넣어 준다
                    if (sc != null) {
                        if ("kids".equals(sc.id)) { if (open && !js.equals(lastHubJson)) { lastHubJson = js; hubV.setScreen(sc, true); } }
                        else showSheet(kind.length() > 0 ? kind : kindOf(sc.id), sc, js);
                    }
                    if (clear.length() > 0 && sheetV != null) sheetV.setField(clear, "");
                    if (close) { closeSheet(true); }
                    if (hub && open) fetchHub();
                } });
            } catch (Throwable e) { note("처리하지 못했어요"); }
        } });
    }

    private static String kindOf(String id) {
        if ("kidchat".equals(id)) return "chat";
        if ("kidquest".equals(id)) return "quest";
        if ("kidplace".equals(id)) return "place";
        if ("kidcheer".equals(id)) return "cheer";
        return "link";
    }

    private final Runnable noteHide = new Runnable() { @Override public void run() { noteV.setVisibility(View.GONE); } };
    /** 키즈 화면 위에 짧은 안내를 3초 띄운다(팝업이 떠 있으면 팝업 화면이 직접 보여 주므로 띄우지 않는다). */
    private void note(final String m) {
        if (!alive || m == null || m.length() == 0) return;
        io.execute(new Runnable() { @Override public void run() {
            try {
                JSONObject t = new JSONObject();
                t.put("t", "text"); t.put("s", m); t.put("size", 13); t.put("bold", true); t.put("color", "text"); t.put("align", "center");
                JSONObject p = new JSONObject();
                p.put("t", "panel"); p.put("pad", new JSONArray("[12,0,12,0]")); p.put("ip", new JSONArray("[14,10,14,10]")); p.put("fill", "card"); p.put("line", "gold"); p.put("r", 18); p.put("kids", new JSONArray().put(t));
                JSONObject o = new JSONObject();
                o.put("ok", true); o.put("v", 1); o.put("screen", "note"); o.put("cover", "tab"); o.put("head", new JSONArray()); o.put("body", new JSONArray().put(p));
                final ScreenCore.Screen sc = ScreenCore.load(o.toString());
                main.post(new Runnable() { @Override public void run() {
                    if (!open || sheetD != null) return;
                    noteV.setScreen(sc, false);
                    noteV.setVisibility(View.VISIBLE);
                    noteV.bringToFront();
                    main.removeCallbacks(noteHide);
                    main.postDelayed(noteHide, 3000L);
                } });
            } catch (Throwable ignored) { }
        } });
    }

    // ───────── 팝업(장소 등록 · 가족 대화 · 미션 · 응원문구 · 연결 관리) ─────────
    private void showSheet(final String kind, ScreenCore.Screen sc, String js) {
        if (sheetD != null && sheetD.isShowing() && sheetKind.equals(kind)) { sheetJson = js; sheetV.setScreen(sc, true); return; }
        closeSheet(true);
        final ScreenCore.Dlg dg = sc.dlg != null ? sc.dlg : new ScreenCore.Dlg();
        final int[] pal = ShellCore.palette(ShellCore.theme(store));
        final ScreenView v = new ScreenView(act);
        v.setDpr(dpr); v.setPalette(pal);
        final DisplayMetrics dm = act.getResources().getDisplayMetrics();
        final float sw = dm.widthPixels / dpr, sh = dm.heightPixels / dpr;
        final float maxW = Math.max(120f, Math.min(dg.w, sw - 2f * dg.mx));
        final Dialog d = new Dialog(act, android.R.style.Theme_Material_Light_Dialog_NoActionBar);
        final Window w = d.getWindow();
        v.setListener(new Host(v) {
            @Override public void onContentH(final float dp) {
                main.post(new Runnable() { @Override public void run() {
                    try {
                        if (sheetV != v || dp <= 0f) return;
                        float ww = dg.fit && v.fitWidthDp() > 0f ? Math.min(maxW, v.fitWidthDp()) : maxW, hh = Math.min(dp, sh * dg.maxh);
                        WindowManager.LayoutParams lp = w.getAttributes();
                        lp.width = Math.round(ww * dpr); lp.height = Math.round(hh * dpr);
                        lp.gravity = Gravity.CENTER; lp.y = 0;
                        w.setAttributes(lp);
                    } catch (Throwable ignored) { }
                } });
            }
        });
        FrameLayout box = new FrameLayout(act);
        GradientDrawable g = new GradientDrawable();
        g.setColor(pal[ScreenView.R_CARD]); g.setCornerRadius(dg.r * dpr);
        box.setBackground(g);
        box.setClipToOutline(true);
        box.addView(v, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        d.setContentView(box);
        d.setCancelable(true); d.setCanceledOnTouchOutside(true);
        w.setLayout(Math.round(maxW * dpr), Math.round(100f * dpr));
        w.setBackgroundDrawable(new ColorDrawable(0x00000000));
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        w.setDimAmount(Math.max(0.2f, dg.dim));
        sheetD = d; sheetV = v; sheetKind = kind; sheetJson = js; sheetQuiet = false;
        final String kd = kind;
        d.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() {
            @Override public void onDismiss(android.content.DialogInterface di) {
                if (sheetD != d) return;
                boolean quiet = sheetQuiet;
                sheetD = null; sheetV = null; sheetKind = ""; sheetJson = "";
                if ("place".equals(kd) && !quiet) send("kpl.cancel", "", "", null, null);      // 밖을 눌러 닫으면 쓰던 장소 초안은 버린다
                if (open && !paused && !quiet) startLoop("hub");
            }
        });
        v.setScreen(sc, false);
        try { d.show(); } catch (Throwable e) { sheetD = null; sheetV = null; sheetKind = ""; return; }
        if ("chat".equals(kind) || "quest".equals(kind)) { if (!paused) startLoop(kind); }
    }

    private void closeSheet(boolean quiet) {
        Dialog d = sheetD;
        if (d == null) return;
        sheetQuiet = quiet;
        try { d.dismiss(); } catch (Throwable ignored) { }
        sheetD = null; sheetV = null; sheetKind = ""; sheetJson = "";
        if (open && !paused && !quiet) startLoop("hub");
    }

    // ───────── 화면 안의 눌림(키즈 화면 · 팝업 공통) ─────────
    private class Host implements ScreenView.Listener {
        private final ScreenView self;
        Host(ScreenView self) { this.self = self; }
        private ScreenView me() { return self != null ? self : hubV; }
        @Override public void onAction(ScreenCore.Act a) {
            if (a == null || !"call".equals(a.a) || a.v == null || a.v.length() == 0) return;
            if ("kl.close".equals(a.v)) { closeSheet(false); return; }
            if ("kl.scan".equals(a.v)) { scan(me()); return; }
            if ("kq.tab".equals(a.v)) qt = "p".equals(a.t) ? "p" : "c";
            send(a.v, a.id, a.t, me().fields(), me());
        }
        @Override public void onSet(ScreenCore.Act a, boolean on) { }
        @Override public void onSearch(ScreenCore.Act a, String q) { }
        @Override public void onInputFocus(boolean on) { }
        @Override public void onFirstDraw() { }
        @Override public void onText(String key, String value, String kind) { }
        @Override public void onContentH(float dp) { }
    }

    // ───────── QR 찍기(Google Play 서비스의 코드 스캐너 — 카메라 권한이 따로 필요 없다) ─────────
    private void scan(final ScreenView from) {
        try {
            com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions opts = new com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(com.google.mlkit.vision.barcode.common.Barcode.FORMAT_QR_CODE).build();
            com.google.mlkit.vision.codescanner.GmsBarcodeScanning.getClient(act, opts).startScan()
                    .addOnSuccessListener(new com.google.android.gms.tasks.OnSuccessListener<com.google.mlkit.vision.barcode.common.Barcode>() {
                        @Override public void onSuccess(com.google.mlkit.vision.barcode.common.Barcode bc) {
                            String raw = bc == null ? "" : bc.getRawValue();
                            String code = codeOf(raw);
                            if (code.length() == 0) { note("길동무 키즈의 QR이 아니에요"); return; }
                            send("kl.join", "", code, from.fields(), from);
                        }
                    })
                    .addOnFailureListener(new com.google.android.gms.tasks.OnFailureListener() {
                        @Override public void onFailure(Exception e) { note("QR을 읽지 못했어요. 시크릿 키를 직접 넣어 주세요"); }
                    });
        } catch (Throwable t) {
            note("QR 읽기를 열지 못했어요. 시크릿 키를 직접 넣어 주세요");
        }
    }

    /** QR 글(gildongmu-kids://pair?c=…&k=XXXXX-XXXXX) 또는 키 글자에서 시크릿 키만 뽑는다. */
    static String codeOf(String raw) {
        if (raw == null) return "";
        Matcher m = CODE.matcher(raw.toUpperCase());
        return m.find() ? m.group() : "";
    }

    // ───────── 통신(모두 뒤 스레드) ─────────
    private boolean ensureReg() {
        String id = store.get(K_ID, ""), sec = store.get(K_SEC, "");
        if (id.length() == 0 || sec.length() == 0) {
            SecureRandom sr = new SecureRandom();
            byte[] b = new byte[16];
            sr.nextBytes(b);
            StringBuilder sb = new StringBuilder();
            for (byte x : b) sb.append(String.format("%02x", x & 0xff));
            sec = sb.toString();
            id = "p" + java.util.UUID.randomUUID().toString().replace("-", "");
            store.put(K_ID, id); store.put(K_SEC, sec); store.put(K_REG, "0");
        }
        if ("1".equals(store.get(K_REG, "0"))) return true;
        try {
            JSONObject o = new JSONObject();
            o.put("id", id); o.put("sec", sec); o.put("role", "p");
            String r = rawCall("POST", "/reg", o.toString(), null, null, 10000, false);
            if (r != null && new JSONObject(r).optBoolean("ok", false)) { store.put(K_REG, "1"); return true; }
        } catch (Throwable ignored) { }
        return false;
    }

    private String call(String method, String path, String body, int readMs) { return call(method, path, body, readMs, false); }

    private String call(String method, String path, String body, int readMs, boolean isWait) {
        String id = store.get(K_ID, ""), sec = store.get(K_SEC, "");
        if (id.length() == 0) return null;
        return rawCall(method, path, body, id, sec, readMs, isWait);
    }

    private String rawCall(String method, String path, String body, String id, String sec, int readMs, boolean isWait) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(BASE + path).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(readMs);
            c.setRequestMethod(method);
            c.setInstanceFollowRedirects(false);
            if (id != null && id.length() > 0) { c.setRequestProperty("x-id", id); c.setRequestProperty("x-sec", sec); }
            if (isWait) waitConn = c;
            if (body != null) {
                byte[] b = body.getBytes("UTF-8");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                c.setFixedLengthStreamingMode(b.length);
                OutputStream os = c.getOutputStream();
                try { os.write(b); } finally { os.close(); }
            }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in == null) return null;
            try {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 600000) return null; }
                return bo.toString("UTF-8");
            } finally { in.close(); }
        } catch (Throwable e) {
            return null;
        } finally {
            if (isWait && waitConn == c) waitConn = null;
            if (c != null) { try { c.disconnect(); } catch (Throwable ignored) { } }
        }
    }

    private static String enc(String s) {
        try { return URLEncoder.encode(s == null ? "" : s, "UTF-8"); } catch (Throwable e) { return ""; }
    }

    static void buzz(Context c, long ms) {
        try {
            Vibrator vb = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
            if (vb != null) vb.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        } catch (Throwable ignored) { }
    }
}
