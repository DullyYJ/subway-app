package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
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
    private static final String K_ID = "kid.id", K_SEC = "kid.sec", K_REG = "kid.reg", K_NODES = "kid.nodes", K_START = "kid.start", K_HUB = "kid.hub", K_CID = "kid.cid", K_FAM = "kid.fam", K_SC = "kid.sc.", K_MODE = "kid.mode", K_TABX = "kid.tab", K_GD = "kid.gd", K_WEAR = "kid.wear";
    private static final long HOLD_MS = 3000L;
    private static final Pattern CODE = Pattern.compile("[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}");
    /** 연결 전에 설정 맨 위에 보이는 한 줄(연결하면 엔진이 준 줄들로 바뀐다). */
    private static final String UNLINKED_ROW = "[{\"t\":\"panel\",\"pad\":[16,12,16,0],\"ip\":[16,6,16,6],\"fill\":\"card\",\"line\":\"border\",\"r\":14,\"kids\":[{\"t\":\"navrow\",\"title\":\"길동무 키즈 연결\",\"sub\":\"자녀 폰의 QR이나 시크릿 키로 연결해요\",\"act\":{\"a\":\"call\",\"v\":\"kl.open\"},\"size\":14,\"top\":true}]}]";

    /** 연결 전에 '길동무 키즈 연결'을 처음 누를 때 서버(등록 + 화면 요청 두 번의 통신)를 기다리지 않고 바로 띄우는 기본 화면 — 서버 linkSheet(연결된 자녀 없음 · 내 이름 비어 있음)와 같은 모양이고, 서버 답이 오면 그것으로 바뀐다. */
    private static final String LINK_SEED = "{\"ok\":true,\"v\":1,\"screen\":\"kidlink\",\"cover\":\"tab\",\"head\":[],\"body\":[{\"t\":\"text\",\"s\":\"길동무 키즈 연결\",\"size\":15,\"color\":\"text\",\"pad\":[16,14,16,2],\"bold\":true},{\"t\":\"text\",\"s\":\"자녀 폰의 길동무 키즈 설정에서 QR 이나 시크릿 키를 만들어 주세요(10분 동안 쓸 수 있어요).\",\"size\":11,\"color\":\"sub\",\"pad\":[16,0,16,6]},{\"t\":\"panel\",\"pad\":[12,8,12,0],\"ip\":[14,12,14,12],\"fill\":\"card\",\"line\":\"border\",\"r\":14,\"kids\":[{\"t\":\"text\",\"s\":\"내 이름 (자녀에게 보여요)\",\"size\":12,\"color\":\"sub\",\"pad\":[0,0,0,6],\"bold\":true},{\"t\":\"field\",\"key\":\"kpn\",\"hint\":\"예: 엄마 · 아빠\",\"value\":\"\",\"maxlen\":8,\"h\":42},{\"t\":\"row\",\"gap\":8,\"pad\":[0,8,0,0],\"kids\":[{\"t\":\"button\",\"s\":\"이름 저장\",\"act\":{\"a\":\"call\",\"v\":\"kl.pname\"},\"h\":40,\"size\":13,\"bold\":true,\"r\":10,\"fill\":\"gold\",\"tc\":\"#121214\",\"line\":\"gold\"}]}]},{\"t\":\"panel\",\"pad\":[12,8,12,0],\"ip\":[14,12,14,12],\"fill\":\"card\",\"line\":\"border\",\"r\":14,\"kids\":[{\"t\":\"text\",\"s\":\"새 자녀 연결\",\"size\":12,\"color\":\"sub\",\"pad\":[0,0,0,6],\"bold\":true},{\"t\":\"field\",\"key\":\"klc\",\"hint\":\"시크릿 키 입력 (XXXXX-XXXXX)\",\"maxlen\":12,\"h\":42,\"watch\":true},{\"t\":\"field\",\"key\":\"kln\",\"hint\":\"자녀 이름 (선택)\",\"maxlen\":8,\"h\":42},{\"t\":\"row\",\"gap\":8,\"pad\":[0,8,0,0],\"kids\":[{\"t\":\"button\",\"s\":\"QR 찍기\",\"act\":{\"a\":\"call\",\"v\":\"kl.scan\"},\"h\":40,\"size\":13,\"bold\":true,\"r\":10,\"fill\":\"card2\",\"tc\":\"text\",\"line\":\"border\"},{\"t\":\"button\",\"s\":\"키로 연결\",\"act\":{\"a\":\"call\",\"v\":\"kl.join\"},\"h\":40,\"size\":13,\"bold\":true,\"r\":10,\"fill\":\"gold\",\"tc\":\"#121214\",\"line\":\"gold\"}]}]},{\"t\":\"row\",\"gap\":8,\"pad\":[12,12,12,14],\"kids\":[{\"t\":\"button\",\"s\":\"닫기\",\"act\":{\"a\":\"call\",\"v\":\"kl.close\"},\"h\":40,\"size\":13,\"bold\":true,\"r\":10,\"fill\":\"card2\",\"tc\":\"text\",\"line\":\"border\"}]}],\"dlg\":{\"w\":460,\"maxh\":0.9,\"dim\":0.5,\"top\":0.5,\"r\":18,\"mx\":14,\"fit\":false},\"rev\":\"1afbxw9\"}";
    /** s415: 처음(법정대리인 확인 전) 키즈 화면을 열면 서버 답을 기다리지 않고 바로 띄우는 '보호자 확인' 팝업 — 서버 gdScreen('자녀')와 같은 모양(시험이 같은지 확인한다). 서버 답이 오면 그것으로 바뀐다. */
    private static final String GD_SEED = "{\"ok\":true,\"v\":1,\"screen\":\"kidgd\",\"cover\":\"tab\",\"head\":[],\"body\":[{\"t\":\"text\",\"s\":\"보호자 확인\",\"size\":16,\"color\":\"text\",\"pad\":[16,24,16,6],\"bold\":true},{\"t\":\"text\",\"s\":\"자녀의 위치를 보기 전에 아래를 확인해 주세요.\",\"size\":12.5,\"color\":\"sub\",\"pad\":[16,0,16,8]},{\"t\":\"panel\",\"pad\":[12,4,12,0],\"ip\":[14,10,14,10],\"fill\":\"card\",\"line\":\"border\",\"r\":14,\"kids\":[{\"t\":\"text\",\"s\":\"• 저는 이 자녀의 법정대리인(친권자 · 후견인)이에요\",\"size\":13,\"color\":\"text\",\"pad\":[0,4,0,4]},{\"t\":\"text\",\"s\":\"• 자녀는 만 9세 이상이에요\",\"size\":13,\"color\":\"text\",\"pad\":[0,4,0,4]},{\"t\":\"text\",\"s\":\"• 자녀에게 위치를 확인한다는 것을 알리고, 자녀도 동의했어요 (자녀 앱에서 동의해야 위치가 와요)\",\"size\":13,\"color\":\"text\",\"pad\":[0,4,0,4]},{\"t\":\"text\",\"s\":\"• 자녀의 안전을 지키는 데에만 쓰고, 다른 사람의 위치를 몰래 확인하는 데 쓰지 않아요\",\"size\":13,\"color\":\"text\",\"pad\":[0,4,0,4]},{\"t\":\"text\",\"s\":\"• 사실과 다르면 이용이 제한될 수 있고 법적 책임은 제게 있어요\",\"size\":13,\"color\":\"text\",\"pad\":[0,4,0,4]}]},{\"t\":\"text\",\"s\":\"이 확인을 한 시각이 기록돼요. 자세한 내용은 개인정보 처리방침과 위치기반서비스 이용약관에 있어요.\",\"size\":11,\"color\":\"sub\",\"pad\":[16,10,16,6]},{\"t\":\"row\",\"gap\":8,\"pad\":[12,0,12,0],\"kids\":[{\"t\":\"button\",\"s\":\"처리방침 보기\",\"act\":{\"a\":\"open\",\"url\":\"https://gildongmu-kids.phg0643.workers.dev/legal/privacy\"},\"h\":34,\"size\":12,\"bold\":false,\"r\":10},{\"t\":\"button\",\"s\":\"이용약관 보기\",\"act\":{\"a\":\"open\",\"url\":\"https://gildongmu-kids.phg0643.workers.dev/legal/terms\"},\"h\":34,\"size\":12,\"bold\":false,\"r\":10}]},{\"t\":\"row\",\"gap\":8,\"pad\":[12,12,12,16],\"kids\":[{\"t\":\"button\",\"s\":\"모두 확인했어요\",\"act\":{\"a\":\"call\",\"v\":\"kg.ok\"},\"h\":40,\"size\":13,\"bold\":true,\"r\":10,\"fill\":\"gold\",\"tc\":\"#121214\",\"line\":\"gold\"}]}],\"dlg\":{\"w\":460,\"maxh\":0.9,\"dim\":0.5,\"top\":0.5,\"r\":18,\"mx\":14,\"fit\":false},\"rev\":\"4g7k46\"}";
    private final Activity act;
    private final ShellCore.Store store;
    private final float dpr;
    private final Handler main = new Handler(Looper.getMainLooper()) {      // 키즈 화면의 어떤 후속 처리도 앱을 끝내지 않는다: 오류는 오류 로그에만 적는다
        @Override public void dispatchMessage(android.os.Message m) {
            try { super.dispatchMessage(m); } catch (Throwable e) { try { ErrLog.record(KidsHub.this.act, e, false); } catch (Throwable ignored) { } }
        }
    };
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
    private volatile ScreenCore.Screen hubPre; private volatile String hubPreJs = ""; private long lastPre;          // s375: 키즈 화면은 미리 받아 해석까지 마쳐 둔다 — 홈에서 키즈로 넘어올 때 빈 화면이 없게
    /** 키즈 화면이 아닐 때(홈 등) 뒤 스레드에서 키즈 화면을 미리 받아 둔다(저장본 → 서버 최신). 45초에 한 번만. */
    public void preload() {
        if (!linked) return;
        long now = SystemClock.elapsedRealtime();
        if (now - lastPre < 45000L) return;
        lastPre = now;
        io.execute(new Runnable() { @Override public void run() {
            try {
                if (hubPre == null) { String c = store.get(K_HUB, ""); if (c.length() > 0) { hubPre = ScreenCore.load(c); hubPreJs = c; } }
                if (!"1".equals(store.get(K_REG, "0"))) return;
                String r = call("GET", "/p/screen?v=hub&cid=" + enc(cid), null, 10000);
                if (r == null) { lastPre = 0L; return; }
                JSONObject o = new JSONObject(r);
                JSONObject sj = o.optBoolean("ok", false) ? o.optJSONObject("screen") : null;
                if (sj == null) return;
                String js = fixQ(sj.toString());
                if (js.contains("\"screen\":\"kidgd\"")) { store.put(K_GD, "0"); hubPre = null; hubPreJs = ""; return; }          // s415: 보호자 확인 전 — 확인 팝업이 따로 뜬다(허브 화면으로 두지 않는다)
                store.put(K_GD, "1");
                final JSONObject pp0 = o.optJSONObject("pop");
                main.post(new Runnable() { @Override public void run() { syncCallPop(pp0); } });                                          // 앱을 켜 두고 있었는데 푸시를 놓쳤어도 열린 호출은 팝업으로
                if (js.equals(hubPreJs)) return;
                hubPre = ScreenCore.load(js); hubPreJs = js;
                if (js.length() < 150000) store.put(K_HUB, js);
            } catch (Throwable ignored) { lastPre = 0L; }
        } });
    }
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
        MarkerPhoto.init(a.getApplicationContext());                          // 자녀 마커 사진(이 폰에만 저장) 불러오기
        cid = st.get(K_CID, "");
        String nodes = st.get(K_NODES, "");
        linked = nodes.length() > 2;
        FriendWear.I.init(a);                                                 // 자녀가 꾸민 친구들 모습을 홈 장면에 — 폰에 남겨 둔 모습으로 켜자마자 바로(통신을 기다리지 않는다)
        FriendWear.I.apply(linked ? st.get(K_WEAR, "") : "");
        ShellCore.famOn = false;                                              // 커뮤니티의 가족대화 칩은 없앴다(대화는 키즈 화면 · 대화 열기 팝업에서)
        ScreenCore.settingsExtra = extraJson();
        SceneCore.quietAuto = mode();                                         // 키즈 모드에서는 홈 장면의 친구들 활동 진동을 울리지 않는다
        main.postDelayed(new Runnable() { @Override public void run() { if (!open) preload(); } }, 2500L);          // s375: 앱을 켜면 키즈 화면을 미리 받아 둔다
        layer = new FrameLayout(a);
        layer.setClickable(true);
        layer.setVisibility(View.GONE);
        hubV = new ScreenView(a);
        hubV.setDpr(dpr);
        hubV.setPalette(ShellCore.palette(ShellCore.theme(st)));
        hubV.setListener(new Host(null));
        hubV.setSwipeHost(new ScreenView.SwipeHost() {                        // s382: 자녀가 여럿이면 확인 화면을 좌우로 밀어 다음·이전 자녀로 — 어느 자녀로 갈지(kc.<자녀>)는 엔진이 화면의 sw 에 줬고, 앱은 그 행동을 그대로 보낸다(새 화면은 그 자녀의 지도·뭐하니·퀘스트·대화)
            @Override public boolean onSwipe(ScreenView sv, int dir) {
                ScreenCore.Screen cs = sv.currentScreen();
                ScreenCore.Act a = cs == null ? null : (dir == -1 ? cs.swL : cs.swR);
                if (a == null) return true;
                sv.slideNext(dir);
                new Host(sv).onAction(a);
                return true;
            }
            @Override public boolean canSwipe() { ScreenCore.Screen cs = hubV.currentScreen(); return cs != null && (cs.swL != null || cs.swR != null); }
        });
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
    /** 키즈 모드(아래 탭의 가운데 칸이 '키즈'): 연결되어 있고 켜 둔 상태. 다른 탭을 눌러도 · 앱을 껐다 켜도 이어진다. */
    public boolean mode() { return linked && "1".equals(store.get(K_MODE, "0")); }
    /** 탭 막대가 바뀌어야 할 때 불린다(모드 · 열림 · 엔진이 준 탭 모양이 바뀜). 주 스레드에서 부른다. */
    public Runnable tabsChanged;
    private void fireTabs() { SceneCore.quietAuto = mode(); final Runnable r = tabsChanged; if (r != null) main.post(r); }
    private void setMode(boolean on) { if (on == "1".equals(store.get(K_MODE, "0"))) { SceneCore.quietAuto = mode(); return; } store.put(K_MODE, on ? "1" : "0"); fireTabs(); }
    /** 탭 막대 화면에 키즈 모드를 입힌다: 홈 칸의 글자 · 아이콘은 엔진이 준 것(/p/setrow 의 tab), 켜진 칸은 키즈 화면이 떠 있는지로. 이 모드가 아니면 그대로. */
    public String patchTabs(String json) {
        if (!mode() || json == null || json.indexOf("tab.home") < 0) return json;
        try {
            JSONObject root = new JSONObject(json), tab = null;
            String tx = store.get(K_TABX, "");
            if (tx.length() > 2) { try { tab = new JSONObject(tx); } catch (Throwable ignored) { } }
            String[] parts = { "body", "head" };
            for (String part : parts) {
                JSONArray arr = root.optJSONArray(part);
                if (arr == null) continue;
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject n = arr.optJSONObject(i);
                    if (n == null || !"tabbar".equals(n.optString("t"))) continue;
                    JSONArray its = n.optJSONArray("items");
                    if (its == null) continue;
                    for (int k = 0; k < its.length(); k++) {
                        JSONObject it = its.optJSONObject(k);
                        if (it == null) continue;
                        JSONObject ac = it.optJSONObject("act");
                        boolean home = ac != null && "tab.home".equals(ac.optString("v"));
                        if (home) {
                            it.put("label", tab != null && tab.optString("label").length() > 0 ? tab.optString("label") : "키즈");
                            if (tab != null && tab.optString("icon").length() > 0) it.put("icon", tab.optString("icon"));
                            it.put("on", open);
                        } else if (open) it.put("on", false);
                    }
                }
            }
            return root.toString();
        } catch (Throwable e) { return json; }
    }
    /** 탭 막대 캐시 글을 다시 읽게 하는 열쇠(모드 · 열림이 다르면 다른 화면). */
    public String tabKey() { return mode() ? (open ? "K1" : "K0") + store.get(K_TABX, "").hashCode() : ""; }
    /** 앱을 켤 때 키즈 화면으로 시작할지 — 연결되어 있고 설정이 켜졌을 때만. */
    public boolean wantStart() { return linked && ("1".equals(store.get(K_START, "0")) || "1".equals(store.get(K_MODE, "0"))); }

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

    public void resume() { paused = false; KidsPush.hub = this; if (!open) preload(); if (open) { startLoop(loopView()); } if (famV != null) startFam(++famEp); refreshLink(false); }
    public void pause() { paused = true; stopLoop(); famEp++; door.close(); }
    /** s385: 키즈 화면(허브 아래 대화 칸 · 대화방 · 커뮤니티 가족대화)을 지금 실제로 보고 있나 — 알림은 이때만 숨긴다(다른 탭을 보고 있으면 카톡처럼 알림이 온다). */
    public boolean viewing() { return open && !paused; }
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
            if (!was && a == MotionEvent.ACTION_UP && linked) {
                float w = tabs.getWidth(), x = e.getX();
                boolean center = w > 0f && x >= w * 2f / 5f && x < w * 3f / 5f;
                if (center) { if (mode() && !open) open(true); }                  // 키즈 모드에서 '키즈' 칸을 짧게 누르면 키즈 화면으로 돌아온다
                else if (open) closeNow();                                         // 다른 탭을 짧게 누르면 키즈 화면은 내려가지만 키즈 모드(가운데 칸)는 남는다
            }
            return was;
        }
        return holdFired;
    }

    public boolean onBack() {
        if (sheetD != null && sheetD.isShowing()) { closeSheet(false); return true; }
        return false;                                                          // 키즈 화면에서 뒤로 가기는 홈에서처럼 '종료할까요' 로 이어진다(앱을 켜면 다시 키즈 화면)
    }

    /** 가운데 칸 3초 꾹: 키즈 모드를 켜고 끈다(끄면 홈으로 돌아온다). */
    public void toggle() {
        if (!linked) return;                                                   // 연결 안 된 사람은 아무 변화 없음
        if (mode()) { setMode(false); if (open) close(true); else fireTabs(); } else open(true);
    }

    // ───────── 키즈 화면 열고 닫기(오른쪽에서 왼쪽으로 · 돌아갈 땐 왼쪽에서 오른쪽으로 넘어간다) ─────────
    public void open(boolean anim) {
        if (!linked || open) return;
        open = true;
        layer.setVisibility(View.VISIBLE);
        layer.bringToFront();
        float w = width();
        final ScreenCore.Screen pre = hubPre; final String preJs = hubPreJs;
        if (pre != null && !preJs.equals(lastHubJson)) { boolean first = lastHubJson.length() == 0; lastHubJson = preJs; hubV.setScreen(pre, !first); }          // s375: 미리 받아 둔 화면을 슬라이드가 시작되기 전에 먼저 꽂는다(빈 화면 없음)
        if (anim) {                                                           // s370: 빠르게 — 160ms, 아래 화면은 따로 밀지 않는다(그릴 것이 반으로 줄어 탭 전환이 바로 된다)
            layer.setTranslationX(w);
            final boolean[] go = new boolean[1];
            final Runnable start = new Runnable() { @Override public void run() {
                if (go[0]) return; go[0] = true;
                if (open) layer.animate().translationX(0f).setDuration(200L).setInterpolator(new DecelerateInterpolator(1.6f)).start();
            } };
            try {                                                             // s375: 화면이 한 번 배치된 첫 프레임에 밀기 시작 — 오른쪽에서 왼쪽으로 내용이 찬 채 들어온다
                layer.getViewTreeObserver().addOnPreDrawListener(new android.view.ViewTreeObserver.OnPreDrawListener() {
                    @Override public boolean onPreDraw() { layer.getViewTreeObserver().removeOnPreDrawListener(this); start.run(); return true; }
                });
            } catch (Throwable ignored) { }
            main.postDelayed(start, 90L);
        } else { layer.animate().cancel(); layer.setTranslationX(0f); }
        main.post(new Runnable() { @Override public void run() {              // 첫 그림이 끝난 뒤에 나머지(저장, 탭 막대, 저장본 읽기, 미리 받기, 긴 대기)를 한다
            if (!open) return;
            store.put(K_MODE, "1"); fireTabs();
            if (!"1".equals(store.get(K_GD, "0")) && sheetD == null) {                       // s415: 처음 — 보호자 확인 팝업을 통신 없이 바로(서버가 이미 확인된 걸로 답하면 저절로 닫힌다)
                try { showSheet("gd", ScreenCore.load(GD_SEED), GD_SEED); } catch (Throwable ignored) { }
            }
            showSaved();
            if (paused) fetchHub(); else startLoop("hub");
            main.postDelayed(new Runnable() { @Override public void run() { if (open) warm(); } }, 1500L);
        } });
    }

    public void close(boolean anim) {
        if (!open) return;
        open = false;
        lastPre = 0L; main.postDelayed(new Runnable() { @Override public void run() { if (!open) preload(); } }, 800L);          // s375: 나간 뒤에 다음번에 쓸 최신 화면을 미리 받아 둔다
        fireTabs();
        closeSheet(true);
        stopLoop();
        float w = width();
        if (anim) {
            layer.animate().translationX(w).setDuration(140L).setInterpolator(new AccelerateInterpolator(1.3f)).withEndAction(new Runnable() { @Override public void run() { if (!open) layer.setVisibility(View.GONE); layer.setTranslationX(0f); } }).start();
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
        if ("call".equals(a.a) && a.v != null && (a.v.startsWith("kl.") || a.v.startsWith("kh.") || a.v.startsWith("kn."))) { send(a.v, a.id, a.t, null, null); return true; }
        return false;
    }

    private void setStart(final boolean on) {
        store.put(K_START, on ? "1" : "0");
        memScr.remove("kn.open"); memJs.remove("kn.open"); store.put(K_SC + "kn.open", "");          // 길동무 키즈 팝업을 다시 열 때 옛 스위치 모양이 먼저 보이지 않게
        send("kl.start", "", on ? "1" : "0", null, null);
    }

    // ───────── 자녀가 꾸민 모습(홈 장면) ─────────
    /** 엔진이 준 저장 글("고른친구,탭;모자,옷,소지품×8")을 폰에 남기고 장면에 바로 입힌다. 모양이 틀리면 무시. 어느 스레드에서든 부른다. */
    private void gotWear(String w) {
        if (w == null) return;
        if (w.length() > 0 && !FriendWear.valid(w)) return;
        store.put(K_WEAR, w);
        FriendWear.I.apply(w);
    }

    /** 조용한 푸시(k:wear)로 자녀가 방금 바꾼 모습이 왔다 — 보고 있는 자녀의 것만 입힌다. 알림 카드는 없다. */
    public void onWearPush(String pcid, String w) {
        if (!linked || w == null) return;
        if (pcid != null && pcid.length() > 0 && cid.length() > 0 && !pcid.equals(cid)) return;
        gotWear(w);
    }

    // ───────── 연결 상태 새로 받기(앱을 켤 때 · 연결·해제 뒤) ─────────
    public void refreshLink(boolean force) {
        long now = SystemClock.elapsedRealtime();
        if (store.get(K_ID, "").length() == 0) return;                          // 한 번도 연결을 시도한 적 없으면 통신하지 않는다
        if (!force && now - lastRefresh < 20000L) return;
        lastRefresh = now;
        io.execute(new Runnable() { @Override public void run() {
            String r = call("GET", "/p/setrow?kn=1" + (cid.length() > 0 ? "&cid=" + enc(cid) : ""), null, 10000);
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
                JSONObject tj = o.optJSONObject("tab");
                String tjs = tj == null ? "" : tj.toString();
                boolean tabDiff = !tjs.equals(store.get(K_TABX, ""));
                store.put(K_TABX, tjs);
                linked = nl;
                if (!nl) store.put(K_MODE, "0");                                  // 연결이 끊기면 키즈 모드도 끝
                gotWear(nl ? o.optString("w", "") : "");                            // 자녀가 꾸민 모습 — 연결이 없으면 원래 친구들로
                if (tabDiff || !nl) fireTabs();
                ScreenCore.settingsExtra = extraJson();
                if (!nl) hideFamily();
                if (nl) KidsPush.start(act, store);                              // 연결된 부모만: 푸시 토큰을 엔진에 맡긴다
                if (nl && "1".equals(store.get(K_REG, "0"))) { lastPre = 0L; preload(); }                  // s415: 연결하자마자 키즈 화면을 미리 받아 둔다(처음 열 때 기다리지 않게)
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
            final String js = fixQ(s.toString());
            final ScreenCore.Screen sc = ScreenCore.load(js);
            final boolean isHub = "hub".equals(view);
            final JSONObject pp = isHub ? o.optJSONObject("pop") : null;
            main.post(new Runnable() { @Override public void run() { putScreen(view, sc, js, my); if (isHub && !"kidgd".equals(sc.id)) syncCallPop(pp); } });
        } catch (Throwable ignored) { }
        return true;
    }

    private void putScreen(String view, ScreenCore.Screen sc, String js, int my) {
        if (my != epoch && !"hub".equals(view)) return;
        if ("hub".equals(view) && "kidgd".equals(sc.id)) {                                  // s415: 보호자 확인 — 허브 자리가 아니라 가운데 팝업으로
            store.put(K_GD, "0"); hubPre = null; hubPreJs = "";
            if (open && !paused) showSheet("gd", sc, js);
            return;
        }
        if ("hub".equals(view)) {
            store.put(K_GD, "1");
            if (sheetD != null && "gd".equals(sheetKind)) closeSheet(true);                    // 이미 확인된 사람(다시 설치)이면 미리 띄운 확인 팝업을 닫는다
            hubPre = sc; hubPreJs = js;
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

    // s426: 서버 초인종(WebSocket). 서버가 켜 두고 이 가족이 대상일 때만(응답에 ws:1) 연결하고, 평소 요청은 붙들지 않는다(nw=1). 아니면 예전 긴 대기 그대로.
    private volatile boolean wsHint = false;
    private final Door door = new Door();

    /** 서버가 허락했고 아직 연결이 없으면 건다(흩뿌림은 시계로 — 여러 기기가 한꺼번에 다시 걸지 않게). */
    private void wsPrep() {
        if (!wsHint || door.isUp()) return;
        String id = store.get(K_ID, ""), sec = store.get(K_SEC, "");
        if (id.length() > 0 && cid.length() > 0) door.ensure(BASE + "/p/ws?cid=" + enc(cid), id, sec, SystemClock.elapsedRealtime() % 3000L);
    }

    private void stopLoop() {
        epoch++;
        door.wake();
        HttpURLConnection c = waitConn;
        if (c != null) { final HttpURLConnection cc = c; io.execute(new Runnable() { @Override public void run() { try { cc.disconnect(); } catch (Throwable ignored) { } } }); }
    }

    private void startLoop(final String view) {
        stopLoop();
        final int my = epoch;
        io.execute(new Runnable() { @Override public void run() {
            long since = -1L; int fails = 0;
            while (alive && my == epoch) {
                wsPrep();
                boolean bell = wsHint && door.isUp();                         // 초인종이 이어져 있으면 붙들지 않는다(nw=1)
                long seen = door.seq();
                String path = "/p/wait?v=" + view + "&cid=" + enc(cid) + "&since=" + since + ("quest".equals(view) ? "&qt=" + qt : "") + (bell ? "&nw=1" : "");
                String r = call("GET", path, null, bell ? 10000 : 22000, true);
                if (!alive || my != epoch) return;
                if (r == null) { fails++; nap(backoffMs(fails)); continue; }
                fails = 0;
                boolean same = false;
                long wa = 45000L;
                try {
                    JSONObject o = new JSONObject(r);
                    if (!o.optBoolean("ok", false)) { nap(1500L); continue; }
                    since = o.optLong("rev", since);
                    wsHint = o.optInt("ws", 0) == 1;
                    wa = o.optLong("wa", 45000L);
                    same = bell && o.optInt("same", 0) == 1;
                } catch (Throwable e) { nap(1500L); continue; }
                if (same) {                                                    // 바뀐 게 없다 — 울릴 때까지. 허브 화면은 20초마다 한 번 '보는 중' 표시를 갱신해야 해서 그때 깨어난다(그 외 45초)
                    if (wsHint && door.isUp()) { try { door.await(seen, wa); } catch (InterruptedException ie) { return; } }
                    continue;
                }
                if (!take(view, r, my, true)) return;
            }
        } });
    }

    // ───────── 커뮤니티 '가족대화'(웹뷰 · 시트가 아니라 엔진이 그려 주는 화면을 커뮤니티 본문에 바로 끼운다) ─────────
    private volatile ScreenView famV;
    private volatile int famEp = 0;
    private String famJson = "";

    /** 커뮤니티 '가족대화' 칸이 열렸다 — 저장해 둔 마지막 화면을 먼저 보이고, 엔진에서 새로 받은 뒤 긴 대기로 실시간을 건다. */
    public void showFamily(ScreenView v) {
        if (v == null || !linked) return;
        famV = v; famJson = "";
        final int my = ++famEp;
        final String c = store.get(K_FAM, "");
        if (c.length() > 0) io.execute(new Runnable() { @Override public void run() {
            try { final ScreenCore.Screen sc = ScreenCore.load(c); main.post(new Runnable() { @Override public void run() { ScreenView f = famV; if (my == famEp && f != null && famJson.length() == 0) f.setScreen(sc, false); } }); } catch (Throwable ignored) { }
        } });
        startFam(my);
    }
    /** 다른 칸으로 옮기거나 연결이 풀렸다 — 대기를 그만둔다. */
    public void hideFamily() { famV = null; famEp++; }

    private void startFam(final int my) {
        io.execute(new Runnable() { @Override public void run() {
            long since = -1L; int fails = 0;
            boolean first = true;
            while (alive && my == famEp && linked) {
                wsPrep();
                boolean bell = !first && wsHint && door.isUp();
                long seen = door.seq();
                String r = first ? call("GET", "/p/screen?v=fam&cid=" + enc(cid), null, 10000)
                                 : call("GET", "/p/wait?v=fam&cid=" + enc(cid) + "&since=" + since + (bell ? "&nw=1" : ""), null, bell ? 10000 : 22000);
                if (!alive || my != famEp) return;
                if (r == null) { fails++; nap(backoffMs(fails)); continue; }
                fails = 0;
                try {
                    JSONObject o = new JSONObject(r);
                    if (!o.optBoolean("ok", false)) { nap(1500L); continue; }
                    since = o.optLong("rev", since);
                    if (!first) wsHint = o.optInt("ws", 0) == 1;
                    if (bell && o.optInt("same", 0) == 1) {
                        if (wsHint && door.isUp()) { try { door.await(seen, o.optLong("wa", 45000L)); } catch (InterruptedException ie) { return; } }
                        continue;
                    }
                    if (o.optBoolean("gone", false) || (o.has("linked") && o.optInt("linked", 1) == 0)) { refreshLink(true); return; }
                    if (o.has("cid") && o.optString("cid", "").length() > 0 && !o.optString("cid").equals(cid)) { cid = o.optString("cid"); store.put(K_CID, cid); }
                    JSONObject s = o.optJSONObject("screen");
                    if (s != null) putFam(s.toString(), my);
                } catch (Throwable e) { nap(1500L); continue; }
                first = false;
            }
        } });
    }

    private void putFam(final String js, final int my) {
        try {
            final ScreenCore.Screen sc = ScreenCore.load(js);
            main.post(new Runnable() { @Override public void run() {
                ScreenView f = famV;
                if (my != famEp || f == null || js.equals(famJson)) return;
                famJson = js;
                f.setScreen(sc, true);
                if (js.length() < 150000) store.put(K_FAM, js);
            } });
        } catch (Throwable ignored) { }
    }

    /** 가족대화 칸 안의 눌림(보내기 등) — 엔진에 보내고 돌아온 화면을 그 칸에 다시 그린다. */
    public void familyAct(ScreenCore.Act a) {
        ScreenView f = famV;
        if (f == null || a == null || !"call".equals(a.a) || a.v == null || a.v.length() == 0) return;
        send(a.v, a.id, a.t, f.fields(), f);
    }

    // ───────── 팝업 미리 받기(연결 · 미션 · 대화): 눌렀을 때 서버를 기다리지 않게 메모리에 해석까지 마쳐 둔다 ─────────
    private final java.util.concurrent.ConcurrentHashMap<String, ScreenCore.Screen> memScr = new java.util.concurrent.ConcurrentHashMap<String, ScreenCore.Screen>();
    private final java.util.concurrent.ConcurrentHashMap<String, String> memJs = new java.util.concurrent.ConcurrentHashMap<String, String>();
    private long lastWarm = 0L;
    /** 이미 한 번 연결을 시도한(등록된) 기기만, 5분에 한 번 뒤 스레드에서 팝업 화면을 미리 받는다. 처음 쓰는 사람의 서버 등록은 첫 누름 때 한다(설정만 열어 본 사람까지 등록하지 않는다). */
    public void warm() {
        long now = SystemClock.elapsedRealtime();
        if (!alive || !"1".equals(store.get(K_REG, "0")) || now - lastWarm < 300000L) return;
        lastWarm = now;
        final String[] vs = linked ? new String[] { "kl.open", "kq.open", "kq.open:p", "kc.open" } : new String[] { "kl.open" };          // kq.open:p = 미션 팝업의 부모님 미션 쪽
        io.execute(new Runnable() { @Override public void run() {
            try {
                for (String key : vs) {
                    String v = key.indexOf(':') > 0 ? key.substring(0, key.indexOf(':')) : key;
                    JSONObject b = new JSONObject();
                    b.put("v", v);
                    if (key.endsWith(":p")) b.put("t", "p");
                    if (cid.length() > 0) b.put("cid", cid);
                    String r = call("POST", "/p/act", b.toString(), 12000);
                    if (r == null) { lastWarm = 0L; return; }
                    JSONObject o = new JSONObject(r);
                    JSONObject s = o.optJSONObject("screen");
                    if (!o.optBoolean("ok", false) || s == null) continue;
                    String js = fixQ(s.toString());
                    if (js.length() == 0 || js.length() >= 150000) continue;
                    ScreenCore.Screen sc = ScreenCore.load(js);
                    store.put(K_SC + key, js); memScr.put(key, sc); memJs.put(key, js);
                }
            } catch (Throwable ignored) { lastWarm = 0L; }
        } });
    }

    /** 통신이 끊긴 뒤 다시 시도하기까지 기다리는 시간. 처음 두 번은 예전 그대로(0.5초 · 1초), 길게 끊기면 점점 늘려(최대 12초) 서버가 살아났을 때 한꺼번에 몰리지 않게 기기마다 조금씩 흩는다. */
    private static long backoffMs(int fails) {
        if (fails <= 2) return 500L * Math.max(1, fails);
        long base = Math.min(500L << Math.min(fails - 1, 6), 12000L);
        return base - (SystemClock.elapsedRealtime() % (base / 3 + 1));
    }
    private static void nap(long ms) { try { Thread.sleep(ms); } catch (InterruptedException ignored) { } }

    // ───────── 눌림 보내기(엔진이 새 화면을 돌려준다) ─────────
    private void send(final String v, final String id, final String t, final Map<String, String> f, final ScreenView src) {
        final String sk = sheetKind;
        final String ckey = "kq.open".equals(v) && "p".equals(t) ? "kq.open:p" : v;                 // 미션 팝업은 쪽(자녀 · 부모님)마다 따로 기억한다
        if (v != null && sheetD == null && !"kx.open".equals(v) && v.matches("k[a-z]{1,2}\\.open")) {                    // 미리 받아 둔 팝업이 있으면 통신을 기다리지 않고 바로 띄운다(서버 답이 오면 새 것으로 바꾼다)
            ScreenCore.Screen ms = memScr.get(ckey); String mj = memJs.get(ckey);
            if (ms == null && "kl.open".equals(v) && !linked && store.get(K_SC + ckey, "").length() == 0) {          // 처음 · 연결 전: 기본 화면을 바로(통신 없이)
                try { ms = ScreenCore.load(LINK_SEED); mj = LINK_SEED; } catch (Throwable ignored) { }
            }
            if (ms != null && mj != null) {
                try { String mj2 = fixQ(mj); if (!mj2.equals(mj)) { ms = ScreenCore.load(mj2); mj = mj2; } } catch (Throwable ignored) { }          // 미션 팝업은 지금 고른 별 점수를 입혀서
                showSheet(kindOf(ms.id), ms, mj);
            }
        }
        if ("kq.tab".equals(v) && sheetD != null && "quest".equals(sheetKind)) {                    // 미션 팝업 쪽 바꾸기: 기억해 둔 그 쪽을 먼저 바로 보이고, 서버 답이 오면 새 것으로 바꾼다
            String k2 = "p".equals(t) ? "kq.open:p" : "kq.open";
            ScreenCore.Screen ms = memScr.get(k2); String mj = memJs.get(k2);
            if (ms != null && mj != null) { try { String mj2 = fixQ(mj); if (!mj2.equals(mj)) { ms = ScreenCore.load(mj2); mj = mj2; } showSheet("quest", ms, mj); } catch (Throwable ignored) { } }
        }
        final boolean[] applied = new boolean[1];
        io.execute(new Runnable() { @Override public void run() {
            try {
                final boolean opener = v != null && !"kx.open".equals(v) && v.matches("k[a-z]{1,2}\\.open");
                if (opener && sheetD == null) {                                   // 마지막으로 본 팝업을 먼저 바로 띄우고, 서버 답이 오면 새 것으로 바꾼다(기다리는 느낌을 없앤다)
                    String cj = store.get(K_SC + ckey, "");
                    if (cj.length() > 0) {
                        final String cj2 = fixQ(cj);
                        final ScreenCore.Screen cs = ScreenCore.load(cj2);
                        main.post(new Runnable() { @Override public void run() { if (sheetD == null) showSheet(kindOf(cs.id), cs, cj2); } });
                    }
                }
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
                final String js = s == null ? "" : fixQ(s.toString());
                final ScreenCore.Screen sc = js.length() == 0 ? null : ScreenCore.load(js);
                if (opener && js.length() > 0 && js.length() < 150000 && sc != null) { store.put(K_SC + ckey, js); memScr.put(ckey, sc); memJs.put(ckey, js); }
                if (sc != null && "kidquest".equals(sc.id) && js.length() < 150000) { String qk = "p".equals(sc.swK) ? "kq.open:p" : "kq.open"; store.put(K_SC + qk, js); memScr.put(qk, sc); memJs.put(qk, js); }          // 미션 팝업은 어느 쪽 답이든 그 쪽 기억을 새로 고친다
                final String notice = o.optString("notice", ""), clear = o.optString("clear", ""), kind = o.optString("sheet", "");
                final boolean close = o.optBoolean("close", false), hub = o.optInt("hub", 0) == 1;
                final JSONObject popR = o.optJSONObject("pop");
                if (o.optString("cid", "").length() > 0 && !o.optString("cid").equals(cid)) { cid = o.optString("cid"); store.put(K_CID, cid); }
                if (v != null && v.startsWith("kl.") && !"kl.open".equals(v) && !"kl.close".equals(v) && !"kl.scan".equals(v)) refreshLink(true);
                main.post(new Runnable() { @Override public void run() {
                    applied[0] = true;
                    if (v != null && (v.equals("kr.live") || v.matches("kr\\.\\d{1,12}"))) { main.removeCallbacks(noteHide); noteV.setVisibility(View.GONE); }          // 경로가 왔다 — '불러오는 중' 글을 걷는다
                    final boolean wasShown = sheetD != null;
                    if (close && sc != null && "kids".equals(sc.id) && (v == null || !v.endsWith(".cancel"))) closeSheet(true);          // 허브 화면을 새로 그리기 전에 팝업부터 걷는다(허브가 다시 그려지는 동안 팝업이 남아 보이지 않게)
                    if (notice.length() > 0 && sheetD == null) note(notice);          // 팝업 안의 안내는 엔진이 팝업 화면 안에 넣어 준다
                    boolean lateOpen = "kpg.open".equals(v) && sheetD != null && "ev".equals(sheetKind) && regTyped();          // s419: 미리 띄운 등록 팝업에 벌써 글을 쓰고 있으면 늦게 온 열기 답으로 덮어쓰지 않는다
                    if (sc != null && !lateOpen) {
                        if ("kidfam".equals(sc.id)) { putFam(js, famEp); }
                        else if ("kids".equals(sc.id)) { if (open && !js.equals(lastHubJson)) { lastHubJson = js; hubV.setScreen(sc, true); } }
                        else showSheet(kind.length() > 0 ? kind : kindOf(sc.id), sc, js);
                    }
                    ScreenView cv = src != null && (src == famV || src == hubV) ? src : sheetV;   // 가족 대화 칸 · 확인 화면 아래 입력줄은 자기 칸의 글을 비운다
                    if (clear.length() > 0 && cv != null && !"kh.say".equals(v)) cv.setField(clear, "");          // kh.say 는 누른 즉시 비웠다(그 사이 새로 쓴 글을 지우지 않는다)
                    if ("kqx".equals(clear)) qpt = 1;
                    if (close && (v == null || !v.endsWith(".cancel"))) { closeSheet(true); if (wasShown && notice.length() > 0) note(notice); }          // 취소는 이미 닫았다 — 그 사이 새로 연 팝업을 닫지 않게
                    if (hub && open) fetchHub();
                    if (popR != null && "kx.open".equals(v)) showCallPop(popR, true);                  // 허브의 호출 줄을 눌렀다 — 그 호출의 팝업
                } });
            } catch (Throwable e) { note("처리하지 못했어요"); }
            finally { if (!applied[0] && "kpg.find".equals(v)) main.post(new Runnable() { @Override public void run() { regBusy(false); } }); }          // 못 찾고 끝났으면 '찾는 중' 글을 되돌린다
        } });
    }

    /** 지난 경로 · 실시간 전환을 누른 즉시: 서버 답이 오기 전까지 키즈 화면 위에 짧은 안내를 보인다(note 는 3초 뒤 저절로 사라지고, 답이 오면 바로 걷는다). */
    private void routeWait(String m) { if (open) note(m); }

    private static String kindOf(String id) {
        if ("kidchat".equals(id)) return "chat";
        if ("kidgd".equals(id)) return "gd";
        if ("kidcall".equals(id)) return "call";
        if ("kidquest".equals(id)) return "quest";
        if ("kidplace".equals(id)) return "place";
        if ("kidcheer".equals(id) || "kidmenu".equals(id) || "kidmk".equals(id)) return "cheer";          // 길동무 키즈 팝업 · 응원문구 · 마커 변경은 서로 오가도 같은 창에서 글만 바뀐다
        if ("kidev".equals(id) || "kidreg".equals(id) || "kidrt".equals(id) || "kidpls".equals(id)) return "ev";          // 서버가 sheet:"ev" 로 답하는 화면들 — 종류가 다르면 미리 띄운 팝업을 닫았다 다시 열어 화면이 두 번 열렸다
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
    private View sheetBox;
    private boolean sheetBottom;

    // ───────── s415: 자녀의 호출(긴급 · 데리러 와줘 · 안전 도착)은 가운데 팝업 — 키즈 탭 밖에서도 ─────────
    private volatile JSONObject lastPop;      // 가장 최근에 받은 호출 팝업 값(엔진이 준 것: 제목 · 글 · 단추 · 저절로 뜰지)
    private String shownPk = "";              // 이미 띄운 팝업(같은 호출 · 같은 상태는 다시 띄우지 않는다)

    /** 허브 답에 실려 온 호출 팝업 값을 맞춘다: 새 것이면(엔진이 au=1) 띄우고, 열려 있던 호출 팝업이 이제 필요 없어졌으면 닫는다. */
    private void syncCallPop(JSONObject pp) {
        lastPop = pp;
        if (pp == null) { if (sheetD != null && "call".equals(sheetKind)) closeSheet(true); return; }
        if (!showCallPop(pp, false) && sheetD != null && "call".equals(sheetKind) && !pp.optString("pk").equals(shownPk)) closeSheet(true);
    }

    /** 엔진이 정해 준 값(제목 pt · 글 ps · 단추 bt/ka/ci · 저절로 뜰지 au)으로 가운데 팝업을 띄운다. manual = 사람이 눌러 연 것(저절로 뜨는 조건을 보지 않는다). 띄웠으면 true. */
    private boolean showCallPop(JSONObject d, boolean manual) {
        if (d == null || act.isFinishing() || act.isDestroyed()) return false;
        String pk = d.optString("pk", "");
        if (!manual) {
            if (d.optInt("au", 0) != 1 || paused || pk.equals(shownPk)) return false;
            if (sheetD != null && "place".equals(sheetKind) && !"sos".equals(d.optString("k"))) return false;          // 장소를 적는 중에는 긴급이 아니면 끼어들지 않는다
        }
        try {
            String js = callPopJson(d);
            shownPk = pk;
            showSheet("call", ScreenCore.load(js), js);
            return true;
        } catch (Throwable e) { return false; }
    }

    /** 팝업 화면 모양(그리기만 — 글 · 단추 이름 · 누르면 무엇을 보낼지는 엔진이 준 값 그대로). */
    private static String callPopJson(JSONObject d) throws org.json.JSONException {
        JSONObject o = new JSONObject();
        o.put("ok", true); o.put("v", 1); o.put("screen", "kidcall"); o.put("cover", "tab"); o.put("head", new JSONArray());
        JSONArray b = new JSONArray();
        b.put(new JSONObject().put("t", "text").put("s", d.optString("pt")).put("size", 17).put("bold", true).put("color", "orange").put("align", "center").put("pad", new JSONArray("[16,22,16,6]")));
        b.put(new JSONObject().put("t", "text").put("s", d.optString("ps")).put("size", 12.5).put("color", "sub").put("align", "center").put("pad", new JSONArray("[16,0,16,14]")));
        String ka = d.optString("ka", ""), ci = d.optString("ci", "");
        JSONArray kids = new JSONArray();
        JSONObject act1 = new JSONObject().put("a", "call").put("v", ka.length() > 0 ? ka : "kl.close");
        if (ka.length() > 0 && ci.length() > 0) act1.put("t", ci);
        kids.put(new JSONObject().put("t", "button").put("s", d.optString("bt", "확인")).put("act", act1).put("h", 46).put("size", 14).put("bold", true).put("r", 10).put("fill", "gold").put("tc", "#121214").put("line", "gold"));
        if (ka.length() > 0) kids.put(new JSONObject().put("t", "button").put("s", "닫기").put("act", new JSONObject().put("a", "call").put("v", "kl.close")).put("h", 46).put("size", 13).put("bold", true).put("r", 10).put("fill", "card2").put("tc", "text").put("line", "border"));
        b.put(new JSONObject().put("t", "row").put("gap", 8).put("pad", new JSONArray("[12,6,12,16]")).put("kids", kids));
        o.put("body", b);
        o.put("dlg", new JSONObject().put("w", 460).put("maxh", 0.9).put("dim", 0.5).put("top", 0.5).put("r", 18).put("mx", 14).put("fit", false));
        o.put("rev", d.optString("pk"));
        return o.toString();
    }

    /** 푸시(FCM)가 왔다 — 앱이 앞에 있으면(어느 탭이든) 호출은 가운데 팝업으로, 자녀가 취소했으면 떠 있는 팝업을 닫는다. 팝업을 띄웠으면 true. */
    public boolean onCallPush(final Map<String, String> d) {
        if (d == null || !alive) return false;
        final String k = d.get("k");
        if ("callx".equals(k)) { main.post(new Runnable() { @Override public void run() { lastPop = null; if (sheetD != null && "call".equals(sheetKind)) closeSheet(true); } }); return false; }
        if (!"sos".equals(k) && !"pick".equals(k) && !"arr".equals(k)) return false;
        if (paused || d.get("pk") == null) return false;
        final JSONObject o = popFromMap(d);
        main.post(new Runnable() { @Override public void run() { if (!"arr".equals(k)) lastPop = o; showCallPop(o, false); } });
        return true;
    }

    static JSONObject popFromMap(Map<String, String> d) {
        JSONObject o = new JSONObject();
        try {
            String[] ks = {"pk", "ci", "pt", "ps", "bt", "ka", "k"};
            for (String x : ks) o.put(x, d.get(x) == null ? "" : d.get(x));
            int au = 1; try { au = Integer.parseInt(d.get("au")); } catch (Exception ignored) { }
            o.put("au", au);
        } catch (Throwable ignored) { }
        return o;
    }

    /** 알림을 눌러 앱이 열렸다 — 알림에 실린 팝업 값으로 호출 팝업을 바로 띄운다. */
    public void popFromIntent(String json) {
        try { final JSONObject o = new JSONObject(json); main.post(new Runnable() { @Override public void run() { if (!"arr".equals(o.optString("k"))) lastPop = o; showCallPop(o, true); } }); } catch (Throwable ignored) { }
    }

    private void showSheet(final String kind, ScreenCore.Screen sc, String js) {
        if (act.isFinishing() || act.isDestroyed()) return;
        if (sheetD != null && sheetD.isShowing() && sheetKind.equals(kind)) { sheetJson = js; sheetV.setScreen(sc, true); return; }
        closeSheet(true);
        final boolean bottom = "chat".equals(kind);                         // 대화방(s384)은 카톡처럼 전체 화면 — 아래에서 올라오고, 키보드가 올라와도 입력줄이 키보드 바로 위에 남는다. 나머지는 가운데에 같은 넓은 폭으로 뜬다
        final ScreenCore.Dlg dg = sc.dlg != null ? sc.dlg : new ScreenCore.Dlg();
        final int[] pal = ShellCore.palette(ShellCore.theme(store));
        final ScreenView v = new ScreenView(act);
        v.setDpr(dpr); v.setPalette(pal);
        final DisplayMetrics dm = act.getResources().getDisplayMetrics();
        final float sw = dm.widthPixels / dpr, sh = dm.heightPixels / dpr;
        final float maxW = bottom ? sw : Math.max(120f, Math.min(Math.max(dg.w, 460f), sw - 28f));      // 폭은 내용과 상관없이 늘 같게(화면 폭 - 양쪽 14dp, 최대 460dp)
        final Dialog d = new Dialog(act, android.R.style.Theme_Material_Light_Dialog_NoActionBar) {
            @Override public void cancel() { if (bottom) closeSheet(false); else super.cancel(); }
        };
        final Window w = d.getWindow();
        final FrameLayout box = new FrameLayout(act);
        final boolean[] shown = new boolean[1];
        v.setListener(new Host(v) {
            @Override public void onContentH(final float dp) {
                main.post(new Runnable() { @Override public void run() {
                    try {
                        if (sheetV != v || dp <= 0f) return;
                        float hh = bottom ? sh : Math.min(dp, sh * dg.maxh);
                        WindowManager.LayoutParams lp = w.getAttributes();
                        int nw = bottom ? ViewGroup.LayoutParams.MATCH_PARENT : Math.round(maxW * dpr), nh = bottom ? ViewGroup.LayoutParams.MATCH_PARENT : Math.round(hh * dpr);
                        if (shown[0] && lp.width == nw && lp.height == nh) { revealSheet(box, shown, bottom, hh); return; }          // s372: 같은 크기면 창을 다시 손대지 않는다(글을 치는 중 새 화면이 와도 키보드가 닫히지 않게)
                        lp.width = nw; lp.height = nh;
                        lp.gravity = bottom ? Gravity.BOTTOM : Gravity.CENTER; lp.y = 0;
                        w.setAttributes(lp);
                        revealSheet(box, shown, bottom, hh);
                    } catch (Throwable ignored) { }
                } });
            }
        });
        if ("quest".equals(kind)) v.setSwipeHost(new ScreenView.SwipeHost() {                  // 미션 팝업: 좌우로 밀면 자녀 미션 ↔ 부모님 미션(엔진이 화면의 sw 에 어느 쪽으로 가는지 줬다)
            @Override public boolean onSwipe(ScreenView sv, int dir) {
                ScreenCore.Screen cs = sv.currentScreen();
                ScreenCore.Act a = cs == null ? null : (dir == -1 ? cs.swL : cs.swR);
                if (a != null) new Host(sv).onAction(a);
                return true;
            }
            @Override public boolean canSwipe() { ScreenCore.Screen cs = v.currentScreen(); return cs != null && (cs.swL != null || cs.swR != null); }
        });
        GradientDrawable g = new GradientDrawable();
        g.setColor(pal[ScreenView.R_CARD]);
        float rr = dg.r * dpr;
        if (bottom) g.setColor(pal[ScreenView.R_BG]); else g.setCornerRadius(rr);
        box.setBackground(g);
        box.setClipToOutline(true);
        box.setAlpha(0f);                                                  // 높이가 정해지기 전의 어정쩡한 크기는 보이지 않게 두었다가 한 번에 띄운다
        if (bottom) {                                                       // 대화방: 맨 위에 돌아가기 줄 + 아래 대화(남는 높이를 다 쓴다). 상태 표시줄·키보드가 가리는 만큼은 안쪽 여백으로 비운다
            android.widget.LinearLayout col = new android.widget.LinearLayout(act);
            col.setOrientation(android.widget.LinearLayout.VERTICAL);
            android.widget.TextView back = new android.widget.TextView(act);
            back.setText("\u2039  \ub4a4\ub85c"); back.setTextSize(16f); back.setTextColor(pal[ScreenView.R_TEXT]); back.setGravity(Gravity.CENTER_VERTICAL);
            back.setPadding(Math.round(14f * dpr), 0, Math.round(14f * dpr), 0);
            back.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View vw) { closeSheet(false); } });
            col.addView(back, new android.widget.LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, Math.round(48f * dpr)));
            col.addView(v, new android.widget.LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
            box.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            box.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override public android.view.WindowInsets onApplyWindowInsets(View vw, android.view.WindowInsets in) {
                    int t, bt;
                    if (android.os.Build.VERSION.SDK_INT >= 30) { android.graphics.Insets i = in.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.ime()); t = i.top; bt = i.bottom; }
                    else { t = in.getSystemWindowInsetTop(); bt = in.getSystemWindowInsetBottom(); }
                    vw.setPadding(0, t, 0, bt);
                    return in;
                }
            });
        } else box.addView(v, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        d.setContentView(box);
        d.setCancelable(true); d.setCanceledOnTouchOutside(true);
        if (bottom) w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT); else w.setLayout(Math.round(maxW * dpr), Math.round(100f * dpr));
        w.setGravity(bottom ? Gravity.BOTTOM : Gravity.CENTER);
        w.setBackgroundDrawable(new ColorDrawable(0x00000000));
        w.setWindowAnimations(0);
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (!bottom) { w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND); w.setDimAmount(Math.max(0.2f, dg.dim)); }
        sheetD = d; sheetV = v; sheetKind = kind; sheetJson = js; sheetQuiet = false; sheetBox = box; sheetBottom = bottom;
        if ("quest".equals(kind)) qpt = 1;
        final String kd = kind;
        d.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() {
            @Override public void onDismiss(android.content.DialogInterface di) {
                if (sheetD != d) return;
                boolean quiet = sheetQuiet;
                sheetD = null; sheetV = null; sheetKind = ""; sheetJson = ""; sheetBox = null; sheetBottom = false;
                if ("gd".equals(kd) && !quiet && !"1".equals(store.get(K_GD, "0")) && open) { setMode(false); close(true); return; }          // s415: 확인 없이 닫으면 키즈 화면에 들어가지 않는다
                if ("place".equals(kd) && !quiet) send("kpl.cancel", "", "", null, null);      // 밖을 눌러 닫으면 쓰던 장소 초안은 버린다
                if (open && !paused && !quiet) startLoop("hub");
            }
        });
        v.setScreen(sc, false);
        try { d.show(); } catch (Throwable e) { sheetD = null; sheetV = null; sheetKind = ""; sheetBox = null; return; }
        main.postDelayed(new Runnable() { @Override public void run() { revealSheet(box, shown, bottom, 0f); } }, 220L);      // 높이 소식이 늦어도 보이게
        if ("chat".equals(kind) || "quest".equals(kind)) { if (!paused) startLoop(kind); }
    }

    /** 팝업을 처음 보일 때 한 번: 대화는 아래에서 밀려 올라오고, 나머지는 살짝 커지며 떠오른다. */
    private void revealSheet(View box, boolean[] shown, boolean bottom, float hh) {
        if (shown[0]) return;
        shown[0] = true;
        try {
            box.setAlpha(1f);
            if (bottom) {
                box.setTranslationY((hh > 0f ? hh * dpr : box.getHeight() > 0 ? box.getHeight() : 600f * dpr));
                box.animate().translationY(0f).setDuration(240L).setInterpolator(new DecelerateInterpolator(1.8f)).start();
            } else {
                box.setScaleX(0.97f); box.setScaleY(0.97f); box.setAlpha(0f);
                box.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(110L).setInterpolator(new DecelerateInterpolator(1.6f)).start();
            }
        } catch (Throwable ignored) { box.setAlpha(1f); }
    }

    private void closeSheet(boolean quiet) {
        final Dialog d = sheetD;
        if (d == null) return;
        sheetQuiet = quiet;
        final View bx = sheetBox;
        final boolean bt = sheetBottom;
        if ("quest".equals(sheetKind)) qpt = 1;
        if (bt && bx != null && !quiet && d.isShowing()) {               // 아래로 부드럽게 내려간 뒤 닫는다
            sheetD = null; sheetV = null; sheetKind = ""; sheetJson = ""; sheetBox = null; sheetBottom = false;
            if (open && !paused) startLoop("hub");
            try {
                bx.animate().translationY(bx.getHeight() > 0 ? bx.getHeight() : 600f * dpr).setDuration(220L).setInterpolator(new AccelerateInterpolator(1.3f))
                        .withEndAction(new Runnable() { @Override public void run() { try { d.dismiss(); } catch (Throwable ignored) { } } }).start();
            } catch (Throwable e) { try { d.dismiss(); } catch (Throwable ignored) { } }
            return;
        }
        try { d.dismiss(); } catch (Throwable ignored) { }
        sheetD = null; sheetV = null; sheetKind = ""; sheetJson = ""; sheetBox = null; sheetBottom = false;
        if (open && !paused && !quiet) startLoop("hub");
    }

    // ───────── 화면 안의 눌림(키즈 화면 · 팝업 공통) ─────────
    private class Host implements ScreenView.Listener {
        private final ScreenView self;
        Host(ScreenView self) { this.self = self; }
        private ScreenView me() { return self != null ? self : hubV; }
        @Override public void onAction(ScreenCore.Act a) {
            if (a != null && "open".equals(a.a)) {                                      // s430: 처리방침 · 이용약관 보기(서버가 준 https 주소만 연다)
                if (ShellCore.linkOk(a.url)) { try { act.startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(a.url))); } catch (Throwable e) { /* 열 앱이 없으면 그대로 */ } }
                return;
            }
            if (a == null || !"call".equals(a.a) || a.v == null || a.v.length() == 0) return;
            buzz(act, 14L);                                                            // s374(YJ): 키즈 탭에서 버튼을 누를 때마다 짧은 진동
            if ("kl.close".equals(a.v)) { closeSheet(false); return; }
            if ("kg.ok".equals(a.v)) { store.put(K_GD, "1"); closeSheet(false); send(a.v, a.id, a.t, null, null); return; }          // s415: 보호자 확인 — 누르자마자 팝업을 닫고 서버에는 뒤에서 보낸다
            if ("kx.ack".equals(a.v) || "kx.done".equals(a.v)) {                           // s415: 지금 가요 · 확인했어요 · 만났어요 — 서버 답을 기다리지 않고 바로 팝업을 없앤다(서버가 자녀에게 알림을 보낸다)
                lastPop = null; closeSheet(false); send(a.v, a.id, a.t, null, null); return;
            }
            if ("kx.open".equals(a.v)) { JSONObject lp = lastPop; if (lp != null && showCallPop(lp, true)) return; }          // 이미 받아 둔 팝업 값이 있으면 통신 없이 바로
            if ("kpg.cancel".equals(a.v) && sheetD != null) { closeSheet(false); send(a.v, a.id, a.t, null, null); return; }          // 장소 찾기 취소도 서버 답을 기다리지 않고 바로 닫는다(초안 버리기는 뒤에서)
            if (("kpg.find".equals(a.v) || "kpg.pick".equals(a.v) || "kpg.map".equals(a.v) || "kpg.add".equals(a.v)) && sheetD != null && regFast(a)) return;          // s419: 장소 등록 — 누르는 즉시 화면이 반응한다(찾는 중 표시 · 고른 곳으로 지도 이동 · 바로 닫고 뒤에서 등록)
            if (a.v.matches("kr\\.\\d{1,12}") && sheetD != null && "ev".equals(sheetKind)) { closeSheet(true); routeWait("\uacbd\ub85c\ub97c \ubd88\ub7ec\uc624\ub294 \uc911\uc774\uc5d0\uc694\u2026"); send(a.v, a.id, a.t, null, null); return; }          // s411: 지난 경로를 고르면 서버 답을 기다리지 않고 바로 팝업을 닫고 '불러오는 중'을 보인다(옛 모양은 답이 올 때까지 팝업이 남아 느려 보였다)
            if ("kr.live".equals(a.v)) routeWait("\uc2e4\uc2dc\uac04 \uc704\uce58\ub85c \ub3cc\uc544\uac00\ub294 \uc911\u2026");
            if ("kpl.cancel".equals(a.v) && sheetD != null && "place".equals(sheetKind)) { closeSheet(false); return; }          // s374: 취소는 서버 답을 기다리지 않고 바로 닫는다(닫히면서 초안 버리기를 뒤에서 보낸다)
            if (("kpl.t".equals(a.v) || "kpl.d".equals(a.v)) && placeLocal(a)) return;                                       // s374: 시각 · 요일 바꾸기는 통신 없이 그 자리에서 바로 고친다
            if ("kpl.save".equals(a.v) && me() == sheetV && placeSave(a)) return;
            if ("kl.scan".equals(a.v)) { scan(me()); return; }
            if ("km.pick".equals(a.v)) { pickMarker(a.id); return; }                    // 마커 사진: 고르기 · 기본으로는 이 폰 안에서만(서버에 보내지 않는다)
            if ("km.clr".equals(a.v)) { clearMarker(a.id); return; }
            if ("kq.tab".equals(a.v) || "kq.open".equals(a.v)) qt = "p".equals(a.t) ? "p" : "c";
            if ("kq.pt".equals(a.v)) { pickPt(a.t); return; }                          // 길동무포인트는 고르기만 한다(통신 없음) — 저장은 아래 '확인'을 눌러야
            if ("kq.send".equals(a.v)) { send(a.v, a.id, String.valueOf(qpt), me().fields(), me()); return; }
            if ("kh.say".equals(a.v) && me() == hubV) {                              // s370(YJ: 보내면 대화창에 바로 들어가야 한다): 서버 답을 기다리지 않고 내 말풍선을 먼저 그리고 입력칸을 비운다
                Map<String, String> ff = me().fields();
                String tx = ff.get("khc") == null ? "" : ff.get("khc").replaceAll("\\s+", " ").trim();
                if (tx.length() == 0) return;                                          // 빈 글은 보내지 않는다
                if (tx.length() > 100) tx = tx.substring(0, 100);
                optimistic(tx);
                hubV.setField("khc", "");
                java.util.HashMap<String, String> sf = new java.util.HashMap<String, String>(ff); sf.put("khc", tx);
                send(a.v, a.id, a.t, sf, hubV);
                return;
            }
            send(a.v, a.id, a.t, me().fields(), me());
        }
        @Override public void onSet(ScreenCore.Act a, boolean on) { if (a != null && "kidsHome".equals(a.key)) setStart(on); }          // 길동무 키즈 팝업의 '키즈 화면으로 시작' 알약
        @Override public void onSearch(ScreenCore.Act a, String q) { }
        @Override public void onInputFocus(boolean on) { }
        @Override public void onFirstDraw() { }
        @Override public void onText(final String key, final String value, String kind) {
            if (!"klc".equals(key) || !"edit".equals(kind) || value == null) return;             // 시크릿 키 칸: 5자리 뒤에 - 가 저절로 붙는다
            final String f = fmtKey(value, klcPrev);
            klcPrev = f;
            if (!f.equals(value)) { final ScreenView sv = me(); main.post(new Runnable() { @Override public void run() { sv.setField(key, f); } }); }
        }
        @Override public void onContentH(float dp) { }
    }

    // ───────── 마커 변경: 사진 고르기 → 동그라미 자르기 → 지도 자녀 마커 ─────────
    private static final int RQ_PHOTO = 0x4B4D;
    private String markerPend = "";
    private void pickMarker(String cid) {
        String k = MarkerCropCore.key(cid.length() > 0 ? cid : this.cid);
        if (k.length() == 0) { note("자녀를 찾지 못했어요"); return; }
        markerPend = k;
        try {
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.setType("image/" + "*"); i.addCategory(Intent.CATEGORY_OPENABLE);          // 별표를 따로 쓴다(괄호 검사가 슬래시 별표를 주석으로 읽지 않게)
            act.startActivityForResult(Intent.createChooser(i, "마커로 쓸 사진 고르기"), RQ_PHOTO);
        } catch (Throwable t) { note("사진을 고르는 화면을 열지 못했어요"); }
    }
    private void clearMarker(String cid) {
        MarkerPhoto.clear(MarkerCropCore.key(cid.length() > 0 ? cid : this.cid));
        hubV.invalidate();
        note("기본 마커로 되돌렸어요");
    }
    /** ShellActivity.onActivityResult 에서 부른다 — 사진 고르기 결과면 true. */
    public boolean onPick(int rq, int rs, Intent data) {
        if (rq != RQ_PHOTO) return false;
        final String key = markerPend; markerPend = "";
        if (rs != Activity.RESULT_OK || data == null || data.getData() == null || key.length() == 0) return true;
        final Uri u = data.getData();
        io.execute(new Runnable() { @Override public void run() {
            final Bitmap b = MarkerPhoto.decode(act.getContentResolver(), u, 1600);
            main.post(new Runnable() { @Override public void run() {
                if (b == null) { note("사진을 읽지 못했어요"); return; }
                MarkerCropDialog.show(act, b, dpr, new MarkerCropDialog.Done() { @Override public void ok(Bitmap circle) {
                    if (MarkerPhoto.put(key, circle)) { hubV.invalidate(); note("마커를 바꿨어요"); } else note("마커 사진을 저장하지 못했어요");
                } });
            } });
        } });
        return true;
    }

    // ───────── 장소 등록(주소 찾기) 팝업: 눌렀을 때 서버를 기다리지 않고 화면이 먼저 반응한다 ─────────
    private long regAt;
    /** 등록 팝업 화면 마디를 돌며 일을 한다. mode: busy=주소 찾기 단추 글 바꾸기 · pick=지도 · 위치 글 옮기기 · xy=지금 지도 좌표 읽기. 이름 · 주소 칸 값은 늘 지금 입력한 것으로 유지한다. */
    private void regWalk(JSONArray arr, String mode, String label, double[] xy, String kpa, String kpn, String nm) {
        for (int i = 0; arr != null && i < arr.length(); i++) {
            JSONObject n = arr.optJSONObject(i);
            if (n == null) continue;
            String t = n.optString("t");
            try {
                if ("button".equals(t) && "busy".equals(mode)) {
                    JSONObject ac = n.optJSONObject("act");
                    if (ac != null && "kpg.find".equals(ac.optString("v"))) n.put("s", label);
                } else if ("tmap".equals(t)) {
                    JSONArray pts = n.optJSONArray("pts");
                    JSONObject p0 = pts == null ? null : pts.optJSONObject(0);
                    if (p0 != null) {
                        if ("pick".equals(mode)) { p0.put("la", xy[0]); p0.put("lo", xy[1]); p0.put("l", nm.length() > 0 ? nm : "\uc5ec\uae30"); }
                        else if ("xy".equals(mode)) { xy[0] = p0.optDouble("la", Double.NaN); xy[1] = p0.optDouble("lo", Double.NaN); }
                    }
                } else if ("text".equals(t) && "pick".equals(mode) && n.optString("s").startsWith("\uc704\uce58 ")) {
                    String old = n.optString("s"); int dot = old.indexOf(" \u00b7 ");
                    n.put("s", String.format(java.util.Locale.US, "\uc704\uce58 %.4f, %.4f", xy[0], xy[1]) + (dot > 0 ? old.substring(dot) : ""));
                } else if ("field".equals(t)) {
                    String k = n.optString("key");
                    if ("kpa".equals(k) && kpa != null) n.put("value", kpa);
                    if ("kpn".equals(k) && kpn != null) n.put("value", kpn);
                }
            } catch (Exception ignored) { }
            JSONArray ks = n.optJSONArray("kids");
            if (ks != null) regWalk(ks, mode, label, xy, kpa, kpn, nm);
        }
    }

    /** 등록 팝업이 떠 있고, 사용자가 주소나 이름을 벌써 썼는가(늦게 온 열기 답으로 덮어쓰지 않으려고). */
    private boolean regTyped() {
        ScreenView sv = sheetV;
        if (sv == null || sheetJson.indexOf("\"kpg.find\"") < 0) return false;
        Map<String, String> f = sv.fields();
        String a = f.get("kpa"), b = f.get("kpn");
        return (a != null && a.trim().length() > 0) || (b != null && b.trim().length() > 0);
    }

    private boolean regRewrite(String mode, String label, double[] xy, String nm) {
        try {
            ScreenView sv = sheetV;
            if (sv == null || sheetD == null || sheetJson.length() == 0 || sheetJson.indexOf("\"kpg.find\"") < 0) return false;
            Map<String, String> f = sv.fields();
            String kpa = f.get("kpa"), kpn = f.get("kpn");
            if ("pick".equals(mode) && (kpn == null || kpn.trim().length() == 0)) kpn = nm;          // 이름을 아직 안 적었으면 고른 곳 이름을 넣어 준다
            JSONObject o = new JSONObject(sheetJson);
            regWalk(o.optJSONArray("body"), mode, label, xy, kpa, kpn, kpn == null ? "" : kpn.trim());
            String js = o.toString();
            sheetJson = js;
            sv.setScreen(ScreenCore.load(js), true);
            return true;
        } catch (Throwable e) { return false; }
    }

    private void regBusy(boolean on) { regRewrite("busy", on ? "\ucc3e\ub294 \uc911\u2026" : "\uc8fc\uc18c \ucc3e\uae30", new double[2], ""); }

    private boolean regFast(ScreenCore.Act a) {
        try {
            ScreenView sv = sheetV;
            if (sv == null || sheetD == null || sheetJson.indexOf("\"kpg.find\"") < 0) return false;          // 등록 팝업이 아니면 그대로 서버로
            if ("kpg.find".equals(a.v)) {
                long now = SystemClock.uptimeMillis();
                if (now - regAt < 2500L) return true;                                                      // 찾는 중에 또 눌러도 한 번만
                regAt = now;
                Map<String, String> ff = new java.util.HashMap<String, String>(sv.fields());
                regBusy(true);
                send(a.v, a.id, a.t, ff, null);
                return true;
            }
            if ("kpg.pick".equals(a.v) || "kpg.map".equals(a.v)) {          // 결과 줄 · 지도를 눌러 고른 곳: 같은 길(지도 점 · 위치 글을 앱이 고치고 저장만 뒤에서)
                String[] p = a.t == null ? new String[0] : a.t.split("\\|", 3);
                if (p.length < 3) return false;                                                            // 옛 모양이면 서버가 처리
                double la = Double.parseDouble(p[0]), lo = Double.parseDouble(p[1]);
                if (!(Math.abs(la) <= 85) || !(Math.abs(lo) <= 180)) return false;
                Map<String, String> ff = new java.util.HashMap<String, String>(sv.fields());
                if (!regRewrite("pick", "", new double[]{la, lo}, p[2])) return false;
                String cur = ff.get("kpn");
                if (cur == null || cur.trim().length() == 0) ff.put("kpn", p[2]);
                send("kpg.sv", a.id, a.t, ff, null);                                                       // 저장만 뒤에서(화면은 이미 고쳤다)
                return true;
            }
            if ("kpg.add".equals(a.v)) {
                Map<String, String> ff = new java.util.HashMap<String, String>(sv.fields());
                String nm = ff.get("kpn") == null ? "" : ff.get("kpn").replaceAll("\\s+", " ").trim();
                if (nm.length() == 0) return false;                                                        // 이름이 없으면 서버가 안내 글을 넣어 준다
                double[] xy = new double[]{Double.NaN, Double.NaN};
                regWalk(new JSONObject(sheetJson).optJSONArray("body"), "xy", "", xy, null, null, "");
                String t = (Double.isNaN(xy[0]) || Double.isNaN(xy[1])) ? a.t : String.format(java.util.Locale.US, "%.6f,%.6f", xy[0], xy[1]);
                sheetQuiet = true;
                closeSheet(true);
                send(a.v, a.id, t, ff, null);                                                              // 뒤에서 등록 · 끝나면 안내가 뜬다
                return true;
            }
        } catch (Throwable e) { }
        return false;
    }

    // ───────── 장소 등록 팝업: 시각 · 요일은 이 안에서 바로 고치고, 저장할 때 한 번만 서버에 보낸다 ─────────
    private static final Pattern HHMM = Pattern.compile("^\\d\\d:\\d\\d$");
    /** 팝업 화면(JSON 마디 묶음)에서 시각 글 · 요일 단추 · 이름 칸을 찾아 고친다. kind: t=분 더하기 · d=요일 뒤집기 · s=읽기만. 결과는 mask[0]=분(0~1439) · mask[1]=요일 비트. */
    private boolean placeWalk(JSONArray arr, String kind, int arg, int[] out, String name) {
        boolean hit = false;
        for (int i = 0; arr != null && i < arr.length(); i++) {
            JSONObject n = arr.optJSONObject(i);
            if (n == null) continue;
            String t = n.optString("t");
            if ("text".equals(t) && HHMM.matcher(n.optString("s")).matches()) {
                int mins = Integer.parseInt(n.optString("s").substring(0, 2)) * 60 + Integer.parseInt(n.optString("s").substring(3, 5));
                if ("t".equals(kind)) { mins = ((mins + arg) % 1440 + 1440) % 1440; try { n.put("s", String.format(java.util.Locale.US, "%02d:%02d", mins / 60, mins % 60)); } catch (Exception ignored) { } }
                out[0] = mins; hit = true;
            } else if ("button".equals(t)) {
                JSONObject ac = n.optJSONObject("act");
                if (ac != null && "kpl.d".equals(ac.optString("v"))) {
                    int di = 0; try { di = Integer.parseInt(ac.optString("t", "0")); } catch (Exception ignored) { }
                    boolean on = "gold".equals(n.optString("fill"));
                    if ("d".equals(kind) && di == arg) {
                        on = !on;
                        try { n.put("fill", on ? "gold" : "card2"); n.put("tc", on ? "#121214" : "text"); n.put("line", on ? "gold" : "border"); } catch (Exception ignored) { }
                    }
                    if (on && di >= 0 && di < 7) out[1] |= (1 << di);
                    hit = true;
                }
            } else if ("field".equals(t) && "kpn".equals(n.optString("key")) && name != null) {
                try { n.put("value", name); } catch (Exception ignored) { }
            }
            JSONArray ks = n.optJSONArray("kids");
            if (ks != null && placeWalk(ks, kind, arg, out, name)) hit = true;
        }
        return hit;
    }

    private boolean placeLocal(ScreenCore.Act a) {
        try {
            ScreenView sv = sheetV;
            if (sv == null || sheetD == null || !"place".equals(sheetKind) || sheetJson.length() == 0) return false;
            JSONObject o = new JSONObject(sheetJson);
            int arg = 0;
            try { arg = Integer.parseInt(a.t == null ? "0" : a.t); } catch (Exception ignored) { }
            String nm = sv.fields().get("kpn");
            int[] out = new int[2];
            if (!placeWalk(o.optJSONArray("body"), "kpl.t".equals(a.v) ? "t" : "d", arg, out, nm == null ? "" : nm)) return false;
            String js = o.toString();
            sheetJson = js;
            sv.setScreen(ScreenCore.load(js), true);
            return true;
        } catch (Throwable e) { return false; }
    }

    /** 저장: 이름과 요일이 갖춰졌으면 서버 답을 기다리지 않고 바로 닫고 뒤에서 저장한다(안내는 저장이 끝나면 뜬다). 모자라면 서버가 알려 주는 대로 둔다. */
    private boolean placeSave(ScreenCore.Act a) {
        try {
            ScreenView sv = sheetV;
            if (sv == null || sheetD == null || !"place".equals(sheetKind) || sheetJson.length() == 0) return false;
            Map<String, String> ff = new java.util.HashMap<String, String>(sv.fields());
            String nm = ff.get("kpn") == null ? "" : ff.get("kpn").replaceAll("\\s+", " ").trim();
            int[] out = new int[2];
            if (!placeWalk(new JSONObject(sheetJson).optJSONArray("body"), "s", 0, out, null)) return false;
            ff.put("kpm", String.valueOf(out[0])); ff.put("kpd", String.valueOf(out[1]));
            if (nm.length() == 0 || out[1] == 0) { send(a.v, a.id, a.t, ff, sv); return true; }
            sheetQuiet = true;
            closeSheet(true);
            send(a.v, a.id, a.t, ff, null);
            return true;
        } catch (Throwable e) { return false; }
    }

    /** 지금 키즈 화면의 대화 칸 맨 아래(입력줄 바로 위)에 내 말풍선 하나를 먼저 끼워 그린다. 서버 화면이 오면(긴 대기 0.6초 안) 그것으로 바뀐다. */
    private void optimistic(String tx) {
        try {
            if (lastHubJson.length() == 0) return;
            JSONObject o = new JSONObject(lastHubJson);
            JSONArray foot = o.optJSONArray("foot");
            if (foot == null) return;
            for (int i = 0; i < foot.length(); i++) {
                JSONObject pn = foot.optJSONObject(i);
                JSONArray ks = pn == null ? null : pn.optJSONArray("kids");
                if (ks == null) continue;
                int at = -1, mx = 0; boolean empty = false;
                for (int k = 0; k < ks.length(); k++) {
                    JSONObject n = ks.optJSONObject(k);
                    if (n == null) continue;
                    if ("inbar".equals(n.optString("t")) && "khc".equals(n.optString("key"))) at = k;
                    if (n.has("fd")) mx = Math.max(mx, n.optInt("fd"));
                    if ("text".equals(n.optString("t")) && n.optString("s").startsWith("아직 대화가 없어요")) empty = true;
                }
                if (at < 0) continue;
                java.util.Calendar c = java.util.Calendar.getInstance();
                JSONObject m = new JSONObject();
                m.put("t", "msg"); m.put("s", tx); m.put("mine", true); m.put("un", true); m.put("nick", "");
                m.put("time", String.format(java.util.Locale.US, "%02d:%02d", c.get(java.util.Calendar.HOUR_OF_DAY), c.get(java.util.Calendar.MINUTE)));
                m.put("pad", new JSONArray("[0,4,0,0]")); m.put("fd", mx + 1);
                JSONArray out = new JSONArray();
                for (int k = 0; k < ks.length(); k++) {
                    JSONObject n = ks.optJSONObject(k);
                    if (empty && n != null && "text".equals(n.optString("t")) && n.optString("s").startsWith("아직 대화가 없어요")) continue;
                    if (k == at) out.put(m);
                    out.put(ks.get(k));
                }
                pn.put("kids", out);
                hubV.setScreen(ScreenCore.load(o.toString()), true);
                return;
            }
        } catch (Throwable ignored) { }
    }

    private String klcPrev = "";
    /** 시크릿 키 글자를 XXXXX-XXXXX 모양으로 고친다. 지우는 중에는 끝의 - 를 다시 붙이지 않는다. */
    static String fmtKey(String v, String prev) {
        String s = v.toUpperCase(java.util.Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (s.length() > 10) s = s.substring(0, 10);
        if (s.length() > 5) return s.substring(0, 5) + "-" + s.substring(5);
        if (s.length() == 5 && v.length() >= (prev == null ? 0 : prev.length())) return s + "-";
        return s;
    }

    // ───────── 미션 길동무포인트 고르기(통신 없이 바로 표시) ─────────
    private int qpt = 1;
    private void pickPt(String t) {
        try { qpt = Math.max(1, Math.min(5, Integer.parseInt(t))); } catch (Throwable e) { return; }
        ScreenView sv = sheetV;
        if (sv == null || sheetJson.length() == 0) return;
        try {
            String nj = fixQ(sheetJson);
            sheetJson = nj;
            sv.setScreen(ScreenCore.load(nj), false);
        } catch (Throwable ignored) { }
    }
    /** 미션 화면의 길동무포인트 단추 가운데 고른 것만 금색으로 칠한다. */
    private String fixQ(String js) {
        if (js == null || js.indexOf("kq.pt") < 0) return js;
        try {
            JSONObject o = new JSONObject(js);
            JSONArray b = o.optJSONArray("body");
            if (b != null) markPt(b);
            return o.toString();
        } catch (Throwable e) { return js; }
    }
    private void markPt(JSONArray arr) {
        for (int i = 0; i < arr.length(); i++) {
            JSONObject n = arr.optJSONObject(i);
            if (n == null) continue;
            JSONArray kids = n.optJSONArray("kids");
            if (kids != null) markPt(kids);
            JSONObject a = n.optJSONObject("act");
            if ("button".equals(n.optString("t")) && a != null && "kq.pt".equals(a.optString("v"))) {
                boolean on = String.valueOf(qpt).equals(a.optString("t"));
                try { n.put("fill", on ? "gold" : "card2"); n.put("tc", on ? "#121214" : "text"); n.put("line", on ? "gold" : "border"); } catch (Throwable ignored) { }
            }
        }
    }

    // ───────── QR 찍기(Google Play 서비스의 코드 스캐너 — 카메라 권한이 따로 필요 없다) ─────────
    private void scan(final ScreenView from) {
        try {
            com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions opts = new com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(com.google.mlkit.vision.barcode.common.Barcode.FORMAT_QR_CODE).build();
            com.google.mlkit.vision.codescanner.GmsBarcodeScanning.getClient(act, opts).startScan()
                    .addOnSuccessListener(new com.google.android.gms.tasks.OnSuccessListener<com.google.mlkit.vision.barcode.common.Barcode>() {
                        @Override public void onSuccess(com.google.mlkit.vision.barcode.common.Barcode bc) {
                            try {
                                String raw = bc == null ? "" : bc.getRawValue();
                                String code = codeOf(raw);
                                if (code.length() == 0) { note("길동무 키즈의 QR이 아니에요"); return; }
                                send("kl.join", "", code, from.fields(), from);
                            } catch (Throwable e) { note("QR을 읽지 못했어요. 시크릿 키를 직접 넣어 주세요"); }
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
        try {
            android.net.Uri u = android.net.Uri.parse(raw.trim());
            String k = u.getQueryParameter("k");                               // https://…/q?k=XXXXX-XXXXX · gildongmu-kids://pair?c=…&k=XXXXX-XXXXX
            if (k != null) { Matcher mk = CODE.matcher(k.toUpperCase()); if (mk.find()) return mk.group(); }
        } catch (Throwable ignored) { }
        Matcher m = CODE.matcher(raw.toUpperCase());
        return m.find() ? m.group() : "";
    }

    /** 자녀 폰 QR 을 기본 카메라로 찍어 '길동무로 열기'를 누르면 들어오는 길(gildongmu-kids://pair?k=…). 바로 연결해 준다. */
    public void joinFromUri(android.net.Uri u) {
        try {
            String code = codeOf(u == null ? "" : u.toString());
            if (code.length() == 0) { note("길동무 키즈의 QR이 아니에요"); return; }
            send("kl.join", "", code, new java.util.HashMap<String, String>(), null);
        } catch (Throwable e) { note("연결하지 못했어요"); }
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

    /** 푸시 토큰을 엔진에 올린다(푸시 서비스 · 앱 시작에서 부르는 정적 길). 성공하면 true. */
    static boolean postFt(ShellCore.Store st, String tk) {
        String id = st.get(K_ID, ""), sec = st.get(K_SEC, "");
        if (id.length() == 0 || sec.length() == 0) return false;
        HttpURLConnection c = null;
        try {
            if (!"1".equals(st.get(K_REG, "0"))) {
                JSONObject o = new JSONObject(); o.put("id", id); o.put("sec", sec); o.put("role", "p");
                String r = httpPost("/reg", o.toString(), null, null);
                if (r == null || !new JSONObject(r).optBoolean("ok", false)) return false;
                st.put(K_REG, "1");
            }
            JSONObject b = new JSONObject(); b.put("tk", tk);
            String r = httpPost("/p/ft", b.toString(), id, sec);
            return r != null && new JSONObject(r).optBoolean("ok", false);
        } catch (Throwable e) {
            return false;
        }
    }

    private static String httpPost(String path, String body, String id, String sec) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(BASE + path).openConnection();
            c.setConnectTimeout(8000); c.setReadTimeout(10000); c.setRequestMethod("POST"); c.setInstanceFollowRedirects(false);
            if (id != null) { c.setRequestProperty("x-id", id); c.setRequestProperty("x-sec", sec); }
            byte[] b = body.getBytes("UTF-8");
            c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json; charset=utf-8"); c.setFixedLengthStreamingMode(b.length);
            OutputStream os = c.getOutputStream();
            try { os.write(b); } finally { os.close(); }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in == null) return null;
            try {
                ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                return bo.toString("UTF-8");
            } finally { in.close(); }
        } catch (Throwable e) {
            return null;
        } finally {
            if (c != null) { try { c.disconnect(); } catch (Throwable ignored) { } }
        }
    }

    static void buzz(Context c, long ms) {
        try {
            Vibrator vb = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
            if (vb != null) vb.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        } catch (Throwable ignored) { }
    }
}
