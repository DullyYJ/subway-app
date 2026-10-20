package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Map;

/**
 * 웹이 없는 길동무 껍데기 — 2026-10-20 (s84).
 * Activity 가 직접 화면을 쥔다: 위에는 탭 내용(머리 칸 + 본문 칸, 모두 ScreenView), 아래에는 엔진이 그린 탭 막대(ScreenView).
 * 이 클래스는 '원자료를 받아 엔진에 묻고, 받은 화면을 검증해 올리고, 눌림을 ShellCore 에 묻는' 일만 한다.
 * 글·순서·보임/숨김은 엔진이, 눌림의 뜻과 요청 모양은 ShellCore 가 정한다. 못 받거나 틀린 화면은 알림으로 알리고 지금 화면을 둔다.
 */
public class ShellActivity extends Activity {
    static final String PREFS = "gdm_shell";

    private final Handler main = new Handler(Looper.getMainLooper());
    private ShellCore.Store store;
    private LinearLayout root;
    private ScreenView head, body, tabs;
    private float dpr = 1f;
    private String[] slots = new String[0];            // 지금 탭의 화면 칸들(위 → 아래)
    private final int[] seq = new int[2];              // 칸마다 가장 새 요청 번호(늦게 온 옛 답은 버린다)
    private int seqTabs = 0;
    private volatile ShellCore.NewsRows lastNews = new ShellCore.NewsRows();
    private final HomeCore home = new HomeCore();       // 홈 탭 입력 상태(고른 출발/도착·후보·기준시각)
    private int seqHome = 0, seqCand = 0, seqBoard = 0;
    private BoardCore board;
    private MapCore map;                                   // 지도 탭(안쪽 탭·지역·호선 필터·눌린 역)
    private int seqMapH = 0, seqMapB = 0;
    private FrameLayout holder;
    private MetroMapView mapView;
    private MetroMapData mapData;
    private boolean mapDataLoading;
    private final HcardsCore hc = new HcardsCore();         // 홈 카드 묶음(AI 승무원 · 혼잡도 · 실시간 대화)
    private volatile String hcKey = "", hcJson = "";
    private FavCore fav;                                   // 즐겨찾기 시트(저장 목록·엔진이 돌려준 새 목록)
    private final FoodCore food = new FoodCore();         // 맛집 탭(도착지·기기 위치·받은 원자료)
    private int seqFood = 0;
    private ChatCore chat;
    private int seqChat = 0;
    private boolean chatPolling;
    private ScreenView sheetView;                       // 글쓰기 같은 아래에서 올라오는 시트
    private android.app.Dialog sheet;
    private String sheetName = "", writeErr = "", writeT = "", writeB = "";
    private boolean writeBusy;
    private final java.util.Map<String, Long> cmtAt = new java.util.HashMap<String, Long>();
    private volatile String resCacheKey = "", resCacheJson = "";   // 결과 화면 캐시(같은 경로·같은 탭이면 엔진에 다시 묻지 않는다)

    /** SharedPreferences 를 ShellCore.Store 로 감싼다. */
    private static final class PrefStore implements ShellCore.Store {
        private final SharedPreferences sp;
        PrefStore(SharedPreferences sp) { this.sp = sp; }
        @Override public String get(String k, String d) { try { return sp.getString(k, d); } catch (Throwable t) { return d; } }
        @Override public void put(String k, String v) { try { sp.edit().putString(k, v).apply(); } catch (Throwable ignored) { } }
    }

    private static volatile ShellActivity live;
    /** 탑승 안내가 끝나면서 앱 화면까지 닫는다(내릴 준비 줄의 [앱 종료] · 도착 3분 뒤 자동 종료). 프로세스는 남겨 둔다(시계 위젯). */
    static void quitAll() {
        final ShellActivity a = live;
        if (a == null) return;
        a.runOnUiThread(new Runnable() { @Override public void run() { try { a.finishAndRemoveTask(); } catch (Throwable ignored) { } } });
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        live = this;
        store = new PrefStore(getSharedPreferences(PREFS, Context.MODE_PRIVATE));
        ErrLog.install(this);
        if (CmCore.on(store)) CommuteAlarm.rescheduleAsync(this);                 // 출퇴근 브리핑: 앞으로 4주 창을 다시 민다
        board = new BoardCore(store);
        chat = new ChatCore(store);
        fav = new FavCore(store);
        map = new MapCore(store);
        dpr = getResources().getDisplayMetrics().density;
        ScreenView.preloadFaces(this);
        importLegacy();

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        head = new ScreenView(this);
        head.setDpr(dpr);
        head.setListener(new Host(0));
        root.addView(head, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(44f * dpr)));
        holder = new FrameLayout(this);                 // 본문 칸의 검색 입력칸이 붙을 부모
        body = new ScreenView(this);
        body.setDpr(dpr);
        body.setListener(new Host(1));
        holder.addView(body, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(holder, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        tabs = new ScreenView(this);
        tabs.setDpr(dpr);
        tabs.setListener(new Host(2));
        root.addView(tabs, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(56f * dpr)));
        setContentView(root);

        // 상태 표시줄·내비게이션 막대 자리만큼 비운다
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                v.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(), in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom());
                return in;
            }
        });
        applyTheme();
        restoreRideCard();
        showTab(ShellCore.currentTab(store));
        WidgetCore.captureLaunch(getIntent());
        widgetLaunch();
        gwSync(false);
    }

    /** 위젯을 눌러 앱이 (다시) 열렸다. */
    @Override protected void onNewIntent(Intent it) {
        super.onNewIntent(it);
        setIntent(it);
        WidgetCore.captureLaunch(it);
        widgetLaunch();
    }
    @Override protected void onStop() { super.onStop(); WidgetCore.onAppLeft(this); }

    private boolean resumed;
    /** 위젯 본체 → 커뮤니티 탭 · 위젯 [출근하기]/[퇴근하기] → 설정한 출발·도착으로 길찾기(경로는 엔진이 장소 이름으로 찾아 준 좌표). */
    private void widgetLaunch() {
        String tab = WidgetCore.takeTab();
        if ("community".equals(tab)) { closeSheet(); store.put(ShellCore.K_TAB, "community"); showTab("community"); }
        final String go = WidgetCore.takeLaunch(this);
        if (!"morn".equals(go) && !"eve".equals(go)) return;
        toast("출퇴근 경로를 찾는 중이에요");
        final String body = CmCore.briefBody(store, go, System.currentTimeMillis(), null);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/commute-brief", body, 12000);
                final GwCore.Route rt = r.status == 200 ? GwCore.parseRoute(r.body) : null;
                main.post(new Runnable() { @Override public void run() {
                    if (rt == null) { toast("출퇴근 장소를 먼저 설정해 주세요 (설정 > 출퇴근 브리핑)"); return; }
                    closeSheet();
                    home.setStation(HomeCore.START, rt.from.name, "", rt.from.lat, rt.from.lng);
                    home.setStation(HomeCore.DEST, rt.to.name, "", rt.to.lat, rt.to.lng);
                    home.clearRoute();
                    store.put(ShellCore.K_TAB, "home"); showTab("home");
                    setHomeFields();
                    goRoute();
                } });
            }
        }, "shell-gwgo").start();
    }
    private int gwSeq;
    /**
     * 위젯에 출퇴근 설정을 넘긴다. 출·퇴근 장소의 좌표는 엔진이 이름으로 찾아 주므로(/commute-brief 의 route) 그걸 받아 적은 뒤 JSON 을 만든다.
     * 위젯이 하나도 없으면 하지 않는다(force 는 위젯을 추가하는 순간). 같은 설정이면 위젯을 다시 그리지 않는다. 연달아 바꾸면 마지막 것만.
     */
    private void gwSync(final boolean force) {
        final int my = ++gwSeq;
        final android.content.Context app = getApplicationContext();
        new Thread(new Runnable() {
            @Override public void run() {
                try { Thread.sleep(force ? 0 : 1500); } catch (InterruptedException e) { return; }
                if (my != gwSeq) return;
                try { if (!force && WidgetCore.ids(app).length == 0) return; } catch (Throwable t) { return; }
                long now = System.currentTimeMillis();
                String[] kinds = { "morn", "eve" };
                for (String k : kinds) {
                    NetPost.Res r = NetPost.post(ShellCore.BASE + "/commute-brief", CmCore.briefBody(store, k, now, null), 12000);
                    if (r.status == 200) GwCore.putOrigin(store, k, GwCore.parseRoute(r.body));          // 못 받았으면 지난 값 그대로
                    if (my != gwSeq) return;
                }
                final String json = GwCore.configJson(store);
                main.post(new Runnable() { @Override public void run() {
                    if (!force && WidgetCore.sameConfig(app, json)) return;
                    try { WidgetCore.setConfigJson(app, json); } catch (Throwable ignored) { }
                    if (ShellCore.S_SETPG.equals(sheetName) && "gw".equals(setPage) && sheet != null && sheet.isShowing()) loadSetPage();
                } });
            }
        }, "shell-gwsync").start();
    }

    /** 갤럭시 여부·앱 배터리 제한 여부를 저장소에 적어 둔다 — 설정 첫 화면 요청의 기기 사실(f.sam · f.samw)이 된다. */
    private void refreshPower() {
        try {
            PowerInfo pi = PowerInfo.read(this);
            store.put(ShellCore.K_SAM, pi.sam ? "1" : "0");
            store.put(ShellCore.K_SAMW, pi.sam && pi.w ? "1" : "0");
        } catch (Throwable t) { /* 못 읽으면 이전 값 */ }
    }
    @Override protected void onDestroy() { if (live == this) live = null; super.onDestroy(); }
    @Override protected void onResume() { super.onResume(); resumed = true; refreshPower(); if (ShellCore.S_SETPG.equals(sheetName) && sheet != null && sheet.isShowing()) loadSetPage(); if (ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "")) startChatPoll(); }
    @Override protected void onPause() { resumed = false; super.onPause(); }

    @Override public void onBackPressed() {
        String t = ShellCore.currentTab(store);
        if (!ShellCore.DEFAULT_TAB.equals(t)) {
            store.put(ShellCore.K_TAB, ShellCore.DEFAULT_TAB);
            showTab(ShellCore.DEFAULT_TAB);
        } else super.onBackPressed();
    }

    // ───────────── 색 ─────────────
    private void applyTheme() {
        int[] pal = ShellCore.palette(ShellCore.theme(store));
        head.setPalette(pal);
        body.setPalette(pal);
        tabs.setPalette(pal);
        root.setBackgroundColor(pal[ScreenView.R_BG]);
        getWindow().getDecorView().setBackgroundColor(pal[ScreenView.R_BG]);
    }

    // ───────────── 예전(웹뷰) 앱 즐겨찾기 가져오기: 한 번만, 새 앱 즐겨찾기가 비어 있을 때만 ─────────────
    private void importLegacy() {
        if ("1".equals(store.get(LegacyCore.K_DONE2, ""))) return;
        new Thread(new Runnable() {
            @Override public void run() {
                LegacyCore.Found got = new LegacyCore.Found();
                try {
                    java.util.List<byte[]> files = new java.util.ArrayList<byte[]>();
                    for (String d : LegacyCore.DIRS) {
                        java.io.File[] fs = new java.io.File(getApplicationInfo().dataDir, d).listFiles();
                        if (fs == null) continue;
                        java.util.Arrays.sort(fs, new java.util.Comparator<java.io.File>() { @Override public int compare(java.io.File a, java.io.File b) { return a.getName().compareTo(b.getName()); } });
                        for (java.io.File f : fs) {
                            if (!(f.getName().endsWith(".log") || f.getName().endsWith(".ldb")) || f.length() > 16L * 1024 * 1024) continue;
                            byte[] buf = new byte[(int) f.length()];
                            java.io.FileInputStream in = new java.io.FileInputStream(f);
                            try { int n = 0; while (n < buf.length) { int r = in.read(buf, n, buf.length - n); if (r < 0) break; n += r; } } finally { in.close(); }
                            files.add(buf);
                        }
                    }
                    String kv = null;                                   // 예전 앱 본체 저장소(설정을 한 번 더 보관해 둔 것) — 있으면 파일을 뒤지는 것보다 확실하다
                    try { kv = getSharedPreferences(LegacyCore.OLD_PREFS, Context.MODE_PRIVATE).getString(LegacyCore.OLD_KV, null); } catch (Throwable ignored) { }
                    got = LegacyCore.find(files, kv);
                } catch (Throwable ignored) { /* 못 읽으면 그냥 넘어간다 */ }
                store.put(LegacyCore.K_DONE2, "1");
                store.put(LegacyCore.K_DONE, "1");
                java.util.List<String> said = new java.util.ArrayList<String>();
                if (got.fav != null && "[]".equals(fav.listJson())) { store.put(FavCore.K_FAV, got.fav); said.add("즐겨찾기 " + LegacyCore.count(got.fav) + "개"); }
                if (got.id != null && store.get(ShellCore.K_ID, "").length() == 0) { store.put(ShellCore.K_ID, got.id); said.add("커뮤니티 아이디"); }
                if (got.pt != null && LegacyCore.totalOf(store.get(RulesCore.K_PT, "{}")) == 0) { store.put(RulesCore.K_PT, got.pt); said.add("포인트"); }
                if (got.commute != null && store.get(CmCore.K_ON, "").length() == 0 && store.get(CmCore.K_MORN, "").length() == 0 && LegacyCore.applyCommute(store, got.commute)) {
                    said.add("출퇴근 브리핑 설정");
                    if (CmCore.on(store)) CommuteAlarm.reschedule(getApplicationContext());
                }
                if (!said.isEmpty()) {
                    StringBuilder b = new StringBuilder("예전 ");
                    for (int i = 0; i < said.size(); i++) { if (i > 0) b.append(' ').append('·').append(' '); b.append(said.get(i)); }
                    toastMain(b.append("를 가져왔어요").toString());
                }
            }
        }, "shell-legacy").start();
    }

    // ───────────── 화면 받기 ─────────────
    private void showTab(String tab) {
        hideMapView();
        slots = ShellCore.slotsOf(store, tab);
        head.setVisibility(slots.length > 1 ? View.VISIBLE : View.GONE);
        loadTabs(tab);
        for (int i = 0; i < slots.length; i++) loadSlot(i, false);
    }

    private ScreenView viewOfSlot(int i) { return slots.length > 1 && i == 0 ? head : body; }

    private void loadTabs(final String tab) {
        final int my = ++seqTabs;
        final String url = ShellCore.tabsUrl(), json = ShellCore.tabsBody(tab);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(url, json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() { if (my == seqTabs) present(tabs, txt, false); } });
            }
        }, "shell-tabs").start();
    }

    /** 칸 i 의 화면을 받아 올린다. 원자료가 있는 화면은 먼저 원자료를 받는다. */
    private void loadSlot(final int i, final boolean keep) {
        if (i < 0 || i >= slots.length) return;
        final String screen = slots[i];
        final int si = slots.length > 1 ? i : 1;                // seq 번호: 머리 0 · 본문 1
        final int my = ++seq[si];
        final ScreenView v = viewOfSlot(i);
        if (ShellCore.S_PENDING.equals(screen)) { present(v, ShellCore.pendingScreen(ShellCore.currentTab(store)), false); return; }
        if (ShellCore.S_HOME.equals(screen)) { loadHome(v, keep); return; }
        if (ShellCore.S_BOARD.equals(screen)) { loadBoard(v, keep, true); return; }
        if (ShellCore.S_CHAT.equals(screen)) { loadChat(v, keep, true); return; }
        if (ShellCore.S_FOOD.equals(screen)) { loadFood(v, keep, false); return; }
        if (ShellCore.S_MAPH.equals(screen)) { loadMapHead(v, keep, null, null); return; }
        if (ShellCore.S_MAPB.equals(screen)) { loadMapBody(v, keep); return; }
        new Thread(new Runnable() {
            @Override public void run() {
                String[] urls = ShellCore.feedUrls(screen), feeds = new String[urls.length];
                for (int k = 0; k < urls.length; k++) {
                    NetPost.Res fr = NetPost.get(urls[k], 8000);
                    feeds[k] = fr.status == 200 ? fr.body : "";
                }
                if (ShellCore.S_NEWS.equals(screen)) lastNews = ShellCore.NewsRows.from(feeds);
                store.put(ShellCore.K_DAY, RulesCore.day(System.currentTimeMillis()));
                ShellCore.Req rq = ShellCore.request(screen, store, feeds);
                NetPost.Res r = rq == null ? null : ("GET".equals(rq.method) ? NetPost.get(rq.url, 10000) : NetPost.post(rq.url, rq.body, 10000));
                final String txt = (r != null && r.status == 200) ? r.body : "";
                main.post(new Runnable() { @Override public void run() { if (my == seq[si]) present(v, txt, keep); } });
            }
        }, "shell-slot").start();
    }

    /** 받은 글을 검증해 올린다. 못 읽으면 지금 화면을 그대로 두고 알린다. */
    private void present(ScreenView v, String json, boolean keep) {
        if (json == null || json.length() == 0) { toast("화면을 받지 못했어요"); return; }
        try {
            ScreenCore.Screen sc = ScreenCore.load(json);
            v.setScreen(sc, keep);
            if (!keep && v != sheetView) fadeIn(v);
        } catch (Exception e) {
            toast("화면이 올바르지 않아요: " + String.valueOf(e.getMessage()));
        }
    }

    /** 웹 slideUp 과 같은 움직임: 시트가 아래에서 올라온다(220ms, 감속). 뷰 속성만 쓴다. */
    private void slideIn(View v) {
        if (v == null) return;
        try {
            v.setAlpha(0f); v.setTranslationY(56f * dpr);
            v.animate().alpha(1f).translationY(0f).setDuration(220L).setInterpolator(new android.view.animation.DecelerateInterpolator()).start();
        } catch (Throwable ignored) { v.setAlpha(1f); v.setTranslationY(0f); }
    }
    /** 새 화면(탭 이동 등)이 올라올 때 살짝 떠오른다(웹 busCardIn 류, 140ms). 갱신(keep)에는 쓰지 않는다. */
    private void fadeIn(View v) {
        try { v.setAlpha(0.35f); v.animate().alpha(1f).setDuration(140L).start(); } catch (Throwable ignored) { v.setAlpha(1f); }
    }

    private void toast(String m) { try { Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); } catch (Throwable ignored) { } }

    // ───────────── 앱 규칙(엔진 /rules) ─────────────
    private final java.util.Random rng = new java.util.Random();
    /** 엔진에 규칙을 묻는다(스레드 안에서 부른다). 답이 없으면 "". */
    private String rulesCall(String json) {
        NetPost.Res r = NetPost.post(ShellCore.BASE + "/rules", json, 6000);
        return r.status == 200 && r.body != null ? r.body : "";
    }
    /** 올려도 되는지(스레드 안): 안 되면 문구, 되면 "". 엔진이 안 닿으면 막지 않는다(서버가 한 번 더 거른다). */
    private String rulesCheck(String kind, String cat, String... texts) {
        return RulesCore.checkError(rulesCall(RulesCore.checkBody(store, kind, cat, System.currentTimeMillis(), texts)));
    }
    /** 포인트 적립(스레드 안): 저장값을 갱신하고 보여 줄 문구를 돌려준다. */
    private String rulesAward(String ev, boolean sent) {
        return RulesCore.applyAward(store, rulesCall(RulesCore.awardBody(store, ev, System.currentTimeMillis(), rng.nextDouble(), sent)));
    }
    private void toastMain(final String m) { if (m != null && m.length() > 0) main.post(new Runnable() { @Override public void run() { toast(m); } }); }

    // ───────────── 눌림 ─────────────
    private final class Host implements ScreenView.Listener {
        private final int which;                      // 0 머리 · 1 본문 · 2 탭 막대
        Host(int which) { this.which = which; }

        private String screenName() {
            if (which == 2) return "tabs";
            if (slots.length > 1) return slots[which == 0 ? 0 : 1];
            return slots.length > 0 ? slots[0] : "";
        }
        @Override public void onAction(ScreenCore.Act a) { handle(a, false); }
        @Override public void onSet(ScreenCore.Act a, boolean on) { handle(a, on); }
        @Override public void onSearch(ScreenCore.Act a, String q) { apply(ShellCore.routeSearch(a.tpl, a.empty, q)); }
        @Override public void onInputFocus(boolean on) { }
        @Override public void onFirstDraw() { }
        @Override public void onText(String key, String value, String kind) {
            if (!ShellCore.S_HOME.equals(screenName())) return;
            homeText(key, value, kind);
        }
        @Override public void onContentH(float dp) {
            if (which != 0 || slots.length < 2) return;           // 머리 칸만 그린 내용 높이에 맞춘다
            final int h = Math.max(1, Math.round(dp * dpr));
            ViewGroup.LayoutParams lp = head.getLayoutParams();
            if (lp != null && lp.height != h) { lp.height = h; head.setLayoutParams(lp); }
        }

        private void handle(ScreenCore.Act a, boolean on) {
            ShellCore.Effect e;
            if (which == 2) e = ShellCore.routeTabs(store, a.a, a.v);
            else if (ShellCore.S_CHAT.equals(screenName())) {
                chatAct(a, body);
                return;
            } else if (ShellCore.S_BOARD.equals(screenName())) {
                boardAct(a, which == 0 ? head : body);
                return;
            } else if (ShellCore.S_FOOD.equals(screenName())) {
                foodAct(a);
                return;
            } else if (ShellCore.S_MAPH.equals(screenName()) || ShellCore.S_MAPB.equals(screenName())) {
                mapAct(a, which == 0 ? head : body);
                return;
            } else if (ShellCore.S_HOME.equals(screenName())) {
                if ("call".equals(a.a) && (a.v.startsWith("ai.") || a.v.startsWith("tk.") || a.v.startsWith("share."))) hcAct(a.v);
                else if ("call".equals(a.a)) homeAct(a.v, body.fields());
                else if ("open".equals(a.a)) apply(ShellCore.linkEffect(a.url));
                return;
            } else {
                Map<String, String> f = (which == 0 ? head : body).fields();
                e = ShellCore.route(screenName(), store, a.a, a.v, a.key, on, a.url, f);
            }
            apply(e);
        }
    }

    private void apply(ShellCore.Effect e) {
        switch (e.kind) {
            case ShellCore.E_TAB: showTab(e.arg); break;
            case ShellCore.E_REFRESH: applyTheme(); loadSlot(slots.length - 1, true); break;
            case ShellCore.E_TOAST: toast(e.arg); loadSlot(slots.length - 1, true); break;
            case ShellCore.E_LINK: openLink(e.arg); break;
            case ShellCore.E_NEWS: openNews(e.arg); break;
            case ShellCore.E_PAGE: if ("ovl".equals(e.arg) || "sam".equals(e.arg) || "arr".equals(e.arg) || "cm".equals(e.arg) || "gw".equals(e.arg) || "dev".equals(e.arg) || ShellCore.isPolPage(e.arg) || "locd".equals(e.arg)) openSetPage(e.arg); else toast("아직 옮기는 중이에요"); break;
            default: break;
        }
    }




    // ───────────── 실시간소통 ─────────────
    private static final long CHAT_POLL_MS = 6000L;
    private final Runnable chatTick = new Runnable() {
        @Override public void run() {
            chatPolling = false;
            if (!ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "") || !resumed) return;
            loadChat(body, true, true);
            chatPolling = true; main.postDelayed(this, CHAT_POLL_MS);
        }
    };
    private void startChatPoll() { if (!chatPolling) { chatPolling = true; main.postDelayed(chatTick, CHAT_POLL_MS); } }

    /** 실시간소통: 이 방의 대화(전체 /talks · 노선 /lroom)와 공식 공지를 받고 엔진에 그릴 화면을 묻는다. */
    private void loadChat(final ScreenView v, final boolean keep, final boolean fetch) {
        final int my = ++seqChat;
        final String sel = chat.sel(), me = ShellCore.commId(store);
        startChatPoll();
        new Thread(new Runnable() {
            @Override public void run() {
                if (fetch) {
                    if (System.currentTimeMillis() - chat.noticesAt > 60000) {
                        NetPost.Res nr = NetPost.get(ChatCore.noticesUrl(), 8000);
                        if (nr.status == 200) chat.setNotices(nr.body, System.currentTimeMillis());
                    }
                    if ("all".equals(sel)) {
                        NetPost.Res tr = NetPost.get(chat.talksUrlNow(), 7000);
                        if (tr.status == 200) chat.addTalks(tr.body, me); else chat.failed = !chat.loaded;
                    } else {
                        NetPost.Res rr = NetPost.get(chat.roomUrl(sel), 12000);
                        if (rr.status == 200) chat.addRoom(sel, rr.body); else chat.failed = !chat.loaded;
                    }
                }
                final String body = chat.request(ShellCore.CAP, ShellCore.theme(store), -java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000, me, System.currentTimeMillis());
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/chat", body, 10000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqChat) return;
                    present(v, txt, keep);
                    if (txt.length() > 0) chat.onScreen(txt);
                } });
            }
        }, "shell-chat").start();
    }
    private void reloadChat() { if (ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadChat(body, true, false); }

    private void chatAct(ScreenCore.Act a, final ScreenView src) {
        if ("cat".equals(a.a)) { chat.select(a.v); loadChat(body, false, true); return; }
        if (!"call".equals(a.a)) return;
        final String me = ShellCore.commId(store);
        int r = chat.act(a.v, src.fields(), me);
        switch (r) {
            case ChatCore.R_NEED_ID: toast("설정에서 커뮤니티 아이디를 등록하면 글과 제보를 남길 수 있어요"); break;
            case ChatCore.R_SEND: {
                final String line = "all".equals(chat.pendingLine) ? chat.postLine : chat.pendingLine, text = chat.pendingText;
                final String json = ChatCore.sendBody(me, text, line);
                final String fk = "all".equals(chat.pendingLine) ? "chat.all" : "chat.room";
                new Thread(new Runnable() {
                    @Override public void run() {
                        final String bad = rulesCheck("chat", "", text);
                        if (bad.length() > 0) { toastMain(bad); return; }                       // 입력칸은 그대로 둔다
                        main.post(new Runnable() { @Override public void run() { src.setField(fk, ""); } });
                        NetPost.Res rr = NetPost.post(ShellCore.BOARD_BASE + "/react", json, 9000);
                        final String why = rr.status == 200 && rr.body != null && rr.body.contains("\"stored\"") ? "" : (rr.status == 0 ? "네트워크가 불안정해요" : rr.body != null && rr.body.contains("filtered") ? "부적절한 표현이 있어 올리지 못했어요" : "잠시 후 다시 시도해 주세요");
                        main.post(new Runnable() { @Override public void run() {
                            if (why.length() > 0) toast(why);
                            loadChat(body, true, true);
                            main.postDelayed(new Runnable() { @Override public void run() { loadChat(body, true, true); } }, 1500);
                        } });
                    }
                }, "shell-chat-send").start();
                break;
            }
            case ChatCore.R_REPORT: {
                final String id = chat.pendingId;
                try {
                    new AlertDialog.Builder(this, android.R.style.Theme_Material_Light_Dialog_Alert).setTitle("이 글을 신고할까요?").setMessage("신고가 여러 명 모이면 자동으로 숨겨져요.")
                        .setNegativeButton("취소", null).setPositiveButton("신고", new android.content.DialogInterface.OnClickListener() {
                            @Override public void onClick(android.content.DialogInterface di, int w) {
                                chat.hide(id); toast("신고했어요. 이 글은 더 이상 보이지 않아요"); reloadChat();
                                final String json = ChatCore.reportBody(id);
                                new Thread(new Runnable() { @Override public void run() { NetPost.post(ShellCore.BOARD_BASE + "/lreport", json, 9000); } }, "shell-lrep").start();
                            }
                        }).show();
                } catch (Throwable t) { toast("신고창을 열지 못했어요"); }
                break;
            }
            default: break;
        }
    }

    // ───────────── 게시판 ─────────────
    private String owner() {
        String k = store.get(BoardCore.K_OWNER, "");
        if (k.length() < 16) {
            byte[] b = new byte[16]; new java.security.SecureRandom().nextBytes(b);
            StringBuilder sb = new StringBuilder(); for (byte x : b) sb.append(String.format("%02x", x & 0xff));
            k = sb.toString(); store.put(BoardCore.K_OWNER, k);
        }
        return k;
    }
    /** 게시판: 서버 글을 받고(fetch=true) 엔진에 그릴 화면을 묻는다. */
    private void loadBoard(final ScreenView v, final boolean keep, final boolean fetch) {
        final int my = ++seqBoard;
        new Thread(new Runnable() {
            @Override public void run() {
                if (fetch) {
                    NetPost.Res pr = NetPost.get(BoardCore.postsUrl(), 8000);
                    final boolean got = pr.status == 200 && board.setPosts(pr.body);
                    if (!got && board.loading) board.loading = false;
                }
                final String body = board.request(ShellCore.CAP, System.currentTimeMillis());
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/board", body, 10000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqBoard) return;
                    present(v, txt, keep);
                    if (txt.length() > 0) board.onScreen(txt);
                } });
            }
        }, "shell-board").start();
    }
    private void reloadBoard() { if (ShellCore.S_BOARD.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadBoard(body, true, false); }

    private void boardAct(ScreenCore.Act a, ScreenView src) {
        if ("tog".equals(a.a)) {                                  // 글을 펼침: 서버 댓글을 받아 온다(15초 안에는 다시 받지 않는다)
            final String id = board.idOfPid(a.v);
            if (id.length() == 0 || !board.isServerPost(id)) return;
            Long last = cmtAt.get(id);
            if (last != null && System.currentTimeMillis() - last < 15000) return;
            cmtAt.put(id, System.currentTimeMillis());
            new Thread(new Runnable() {
                @Override public void run() {
                    NetPost.Res r = NetPost.get(BoardCore.commentsUrl(id), 8000);
                    final boolean ok = r.status == 200 && board.setComments(id, r.body);
                    if (ok) main.post(new Runnable() { @Override public void run() { reloadBoard(); } });
                }
            }, "shell-cmts").start();
            return;
        }
        if (!"call".equals(a.a)) return;
        final long now = System.currentTimeMillis();
        int r = board.act(a.v, src.fields(), now);
        final String id = board.pendingId;
        switch (r) {
            case BoardCore.R_RENDER: reloadBoard(); break;
            case BoardCore.R_WRITE: openWrite(); break;
            case BoardCore.R_REPORT:
                postBg(BoardCore.reportBody(id), "/report"); toast("신고가 접수됐어요. 이 글은 더 이상 보이지 않아요"); reloadBoard(); break;
            case BoardCore.R_DELETE:
                postBg(BoardCore.deleteBody(id, owner()), "/post/mine-delete"); toast("글을 삭제했어요"); reloadBoard(); break;
            case BoardCore.R_COMMENT: {
                String nick = ShellCore.commId(store);
                if (nick.length() == 0) { toast("설정에서 커뮤니티 아이디를 먼저 정해 주세요"); break; }
                final String text = board.pendingText, fnick = nick, ckey = board.commentKey(id);
                final ScreenView csrc = src;
                new Thread(new Runnable() {
                    @Override public void run() {
                        final String bad = rulesCheck("chat", "", text);
                        main.post(new Runnable() { @Override public void run() {
                            if (bad.length() > 0) { toast(bad); return; }
                            board.addLocalComment(id, fnick, text, now);
                            postBg(BoardCore.commentBody(id, fnick, text), "/comment");
                            csrc.setField(ckey, "");
                            reloadBoard();
                        } });
                    }
                }, "shell-cmt-chk").start();
                break;
            }
            default: break;
        }
    }
    /** 결과를 기다리지 않는 서버 쓰기(신고·삭제·댓글). 실패해도 화면은 이미 바뀌어 있다. */
    private void postBg(final String json, final String path) {
        new Thread(new Runnable() { @Override public void run() { NetPost.post(ShellCore.BOARD_BASE + path, json, 9000); } }, "shell-bw").start();
    }

    // 글쓰기 시트(엔진 /screen/write 가 그린다)
    private void openWrite() {
        if (ShellCore.commId(store).length() == 0) { toast("설정에서 커뮤니티 아이디를 먼저 정해 주세요"); return; }
        writeErr = ""; writeT = ""; writeB = ""; writeBusy = false;
        sheetName = ShellCore.S_WRITE;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        sheetView.setPalette(ShellCore.palette(ShellCore.theme(store)));
        sheetView.setListener(new SheetHost());
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        sheet.setContentView(sheetView);
        try { sheet.getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE); } catch (Throwable ignored) { }
        try { sheet.show(); slideIn(sheetView); } catch (Throwable t) { toast("글쓰기를 열지 못했어요"); return; }
        loadWrite(false);
    }
    private void loadWrite(final boolean keep) {
        final String json = "{\"cap\":" + ShellCore.CAP + ",\"f\":{\"rc\":0,\"err\":" + ShellCore.q(writeErr) + ",\"busy\":" + (writeBusy ? 1 : 0)
            + ",\"t\":" + ShellCore.q(writeT) + ",\"b\":" + ShellCore.q(writeB) + "}}";
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/write", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() { if (sheet != null && sheet.isShowing()) present(sheetView, txt, keep); } });
            }
        }, "shell-write").start();
    }
    // ───────────── 맛집 ─────────────
    private static final int REQ_FOOD_LOC = 72;

    /** 도착지(홈에서 고른 것)·기기 위치를 FoodCore 에 알리고, 엔진에 화면을 묻는다. 중심 좌표를 알면 서버·공공데이터 원자료를 받아 다시 묻는다. */
    private void loadFood(final ScreenView v, final boolean keep, final boolean force) {
        final int my = ++seqFood;
        HomeCore.Loc d = home.loc[HomeCore.DEST];
        if (d != null && d.ok()) food.setDest(d.name, d.lat, d.lng); else food.setDest("", 0, 0);
        if (force) food.refresh();
        if (food.needGps() && !food.noperm && !food.locating) locateForFood();
        final String json = food.request(ShellCore.CAP, true);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/food", json, 12000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqFood || txt.length() == 0) { if (txt.length() == 0 && my == seqFood) toast("맛집 화면을 받지 못했어요"); return; }
                    food.onScreen(txt);
                    present(v, txt, keep);
                    if (food.needData()) fetchFoodData(my, v);
                } });
            }
        }, "shell-food").start();
    }
    /** 서버 맛집 + 공공데이터(최대 3쪽)를 받아 FoodCore 에 넣고 엔진에 다시 묻는다. */
    private void fetchFoodData(final int my, final ScreenView v) {
        final String su = food.serverUrl();
        final String[] pu = new String[FoodCore.PUB_PAGES];
        for (int i = 0; i < pu.length; i++) pu[i] = food.publicUrl(i + 1);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res sr = NetPost.get(su, 8000);
                List<String> pubs = new ArrayList<String>();
                for (int i = 0; i < pu.length; i++) {
                    NetPost.Res pr = NetPost.get(pu[i], 10000);
                    pubs.add(pr.status == 200 ? pr.body : "");
                    if (FoodCore.pageCount(pr.status == 200 ? pr.body : "") < FoodCore.PUB_PAGE_SIZE) break;
                }
                final FoodCore.Data data = FoodCore.parseData(sr.status == 200 ? sr.body : "", pubs);
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqFood) return;
                    food.setData(data);
                    final String json = food.request(ShellCore.CAP, true);
                    new Thread(new Runnable() {
                        @Override public void run() {
                            NetPost.Res r2 = NetPost.post(ShellCore.BASE + "/screen/food", json, 20000);
                            final String txt2 = r2.status == 200 ? r2.body : "";
                            main.post(new Runnable() { @Override public void run() {
                                if (my != seqFood) return;
                                if (txt2.length() == 0) { toast("맛집 화면을 받지 못했어요"); return; }
                                food.onScreen(txt2); present(v, txt2, true);
                            } });
                        }
                    }, "shell-food2").start();
                } });
            }
        }, "shell-fooddata").start();
    }
    private void reloadFood() { if (ShellCore.S_FOOD.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadFood(body, true, false); }

    private void foodAct(ScreenCore.Act a) {
        if ("refresh".equals(a.a)) { loadFood(body, true, true); return; }
        if ("cat".equals(a.a)) {
            if (food.pickChip(a.v)) present(body, food.altOf(food.flt), false); else loadFood(body, false, false);
            return;
        }
        if (!"call".equals(a.a)) return;
        switch (food.act(a.v)) {
            case FoodCore.R_SHEET: openFoodSheet(); break;
            default: break;
        }
    }
    private void openFoodSheet() {
        closeSheet();
        sheetName = ShellCore.S_FOODSHEET;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        sheetView.setPalette(ShellCore.palette(ShellCore.theme(store)));
        sheetView.setListener(new SheetHost());
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        sheet.setContentView(sheetView);
        try { sheet.show(); slideIn(sheetView); } catch (Throwable t) { toast("가게 정보를 열지 못했어요"); return; }
        final double[] me = food.gps;
        final String json = food.sheetRequest(ShellCore.CAP, me);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/food", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (sheet != null && sheet.isShowing() && ShellCore.S_FOODSHEET.equals(sheetName)) { food.onSheet(txt); present(sheetView, txt, false); }
                } });
            }
        }, "shell-foodsheet").start();
    }
    /** 카카오맵 가게 정보: 엔진이 이름+좌표로 장소 ID 를 찾으면 그 가게 페이지를, 못 찾으면(또는 4초 안에 답이 없으면) 이름 검색 주소를 연다. */
    private void openKakaoPlace(final String[] fallback) {
        final String body = food.kakaoIdBody();
        if (body.length() == 0) { openExternal(fallback[0], fallback[1]); return; }
        toast("카카오맵에서 가게 정보를 여는 중...");
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/food", body, 6000);
                final String[] ln = r.status == 200 ? FoodCore.kakaoIdLink(r.body) : null;
                main.post(new Runnable() { @Override public void run() { if (ln != null) openExternal(ln[0], ln[1]); else openExternal(fallback[0], fallback[1]); } });
            }
        }, "shell-kakaoid").start();
    }
    /** 외부 지도 앱을 열어 보고, 없으면 웹 주소로 연다. */
    private void openExternal(String app, String web) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(app))); return; }
        catch (Throwable ignored) { /* 앱 없음 */ }
        openLink(web);
    }

    /** 위치 한 번 받기(홈의 위치 감지와 따로 — 홈 입력칸은 건드리지 않는다). 결과는 cb 로. */
    private interface LocCb { void fix(Location l); void fail(boolean noperm); }
    private LocCb pendingLoc;
    private void locateOnce(final int reqCode, final LocCb cb) {
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            pendingLoc = cb;
            locGate(new Runnable() { @Override public void run() { requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION }, reqCode); } },
                new Runnable() { @Override public void run() { LocCb c = pendingLoc; pendingLoc = null; if (c != null) c.fail(true); } });
            return;
        }
        final LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        try {
            Location best = null;
            for (String p : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            }
            if (best != null && System.currentTimeMillis() - best.getTime() < 5 * 60 * 1000L) { cb.fix(best); return; }
            String prov = lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
            final Location fallback = best;
            final boolean[] done = { false };
            final LocationListener ll = new LocationListener() {
                @Override public void onLocationChanged(Location l) { if (done[0]) return; done[0] = true; try { lm.removeUpdates(this); } catch (Throwable ignored) { } cb.fix(l); }
                @Override public void onProviderEnabled(String p) { }
                @Override public void onProviderDisabled(String p) { }
                @Override @SuppressWarnings("deprecation") public void onStatusChanged(String p, int s, Bundle b) { }
            };
            lm.requestSingleUpdate(prov, ll, Looper.getMainLooper());
            main.postDelayed(new Runnable() { @Override public void run() {
                if (done[0]) return; done[0] = true;
                try { lm.removeUpdates(ll); } catch (Throwable ignored) { }
                if (fallback != null) cb.fix(fallback); else cb.fail(false);
            } }, 8000);
        } catch (Throwable t) { cb.fail(false); }
    }
    private void locateForFood() {
        food.locating = true;
        locateOnce(REQ_FOOD_LOC, new LocCb() {
            @Override public void fix(Location l) { food.setGps(l.getLatitude(), l.getLongitude()); reloadFood(); }
            @Override public void fail(boolean noperm) { food.noperm = true; food.locating = false; reloadFood(); }
        });
    }

    // ───────────── 지도 ─────────────
    private static final int REQ_MAP_LOC = 73;

    private void loadMapHead(final ScreenView v, final boolean keep, final String q, final Runnable after) {
        final int my = ++seqMapH;
        final String typed = q != null ? q : (head.fields().get("mq") == null ? "" : head.fields().get("mq"));
        final String json = map.headRequest(ShellCore.CAP, ShellCore.theme(store), typed);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapH) return;
                    present(v, txt, keep);
                    if (txt.length() > 0) { map.onScreen(txt); if (after != null) after.run(); }
                } });
            }
        }, "shell-maph").start();
    }
    private void loadMapBody(final ScreenView v, final boolean keep) { loadMapBodyRound(v, keep, 0); }
    /** 버스는 엔진이 "이 주소들을 받아 와라" 하면 받아서 다시 묻는다(위치 → 정류장 → 도착정보, 최대 3번). */
    private void loadMapBodyRound(final ScreenView v, final boolean keep, final int round) {
        final int my = ++seqMapB;
        final String json = map.bodyRequest(ShellCore.CAP, ShellCore.theme(store));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapB) return;
                    if (txt.length() > 0) map.onScreen(txt);
                    present(v, txt, keep);
                    syncMapView();
                    if (txt.length() > 0 && !map.busNeed.isEmpty() && round < 3) fetchBusNeed(v, keep, round, my);
                } });
            }
        }, "shell-mapb").start();
    }
    private void fetchBusNeed(final ScreenView v, final boolean keep, final int round, final int my) {
        final List<String[]> need = new ArrayList<String[]>(map.busNeed);
        new Thread(new Runnable() {
            @Override public void run() {
                final String[] got = new String[need.size()];
                Thread[] ts = new Thread[need.size()];
                for (int i = 0; i < need.size(); i++) {
                    final int k = i;
                    ts[i] = new Thread(new Runnable() { @Override public void run() {
                        String u = MapCore.busFetchUrl(need.get(k)[1]);
                        NetPost.Res r = u.length() == 0 ? null : NetPost.get(u, 9000);
                        got[k] = r != null && r.status == 200 ? r.body : "";
                    } });
                    ts[i].start();
                }
                for (Thread t : ts) { try { t.join(12000); } catch (InterruptedException e) { /* 무시 */ } }
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapB) return;
                    for (int i = 0; i < need.size(); i++) map.addBusRes(need.get(i)[0], got[i] == null ? "" : got[i]);
                    map.busNeed.clear();
                    loadMapBodyRound(v, true, round + 1);
                } });
            }
        }, "shell-mapbus").start();
    }
    private void reloadMap(boolean headToo) {
        if (headToo) loadMapHead(head, true, null, null);
        loadMapBody(body, false);
    }

    private void mapAct(ScreenCore.Act a, ScreenView src) {
        if ("cat".equals(a.a)) {
            if (map.cat(a.v) == MapCore.R_RENDER) {
                if (a.v.startsWith("f:") && mapView != null) mapView.setFilter(map.flt());
                reloadMap(true);
            }
            return;
        }
        if ("open".equals(a.a)) { apply(ShellCore.linkEffect(a.url)); return; }       // 정류장 위치 보기 · 길찾기(외부 지도)
        if (!"call".equals(a.a)) return;
        switch (map.act(a.v, head.fields())) {
            case MapCore.R_FIND: {
                final String q = head.fields().get("mq");
                loadMapHead(head, true, q, new Runnable() { @Override public void run() {
                    if (mapView == null || map.findName.length() == 0 || !mapView.centerOn(map.findName, 1.6f, true)) toast("'" + q.trim() + "' 역을 찾지 못했어요");
                } });
                break;
            }
            case MapCore.R_LOC:
                toast("내 위치 확인 중...");
                locateOnce(REQ_MAP_LOC, new LocCb() {
                    @Override public void fix(Location l) {
                        map.gps = new double[] { l.getLatitude(), l.getLongitude() };
                        loadMapHead(head, true, null, new Runnable() { @Override public void run() {
                            map.gps = null;
                            if (mapView != null && map.nearName.length() > 0 && mapView.centerOn(map.nearName, 1.6f, true)) toast(map.nearName + " (가장 가까운 역)");
                            else toast("가까운 역을 지도에서 찾지 못했어요");
                        } });
                    }
                    @Override public void fail(boolean noperm) { toast(noperm ? "위치 권한이 필요해요" : "현재 위치를 찾지 못했어요"); }
                });
                break;
            case MapCore.R_BUS_LOC:
                toast("내 위치 확인 중...");
                locateOnce(REQ_MAP_LOC, new LocCb() {
                    @Override public void fix(Location l) { map.setBusLoc(l.getLatitude(), l.getLongitude()); loadMapBody(body, true); }
                    @Override public void fail(boolean noperm) { toast(noperm ? "위치 권한이 필요해요" : "현재 위치를 찾지 못했어요"); }
                });
                break;
            case MapCore.R_STN: openMapSheet(S_STN_H); break;
            default: break;
        }
    }
    private static final int S_STN_H = 330, S_TT_H = -58;

    // 노선도 View: 수도권 지하철일 때만 본문 위에 얹는다
    private void syncMapView() {
        boolean want = "metro".equals(map.view) && ShellCore.S_MAPB.equals(slots.length > 1 ? slots[1] : "");
        if (!want) { if (mapView != null) mapView.setVisibility(View.GONE); return; }
        if (mapView != null) { mapView.setVisibility(View.VISIBLE); mapView.setFilter(map.flt()); return; }
        if (mapDataLoading) return;
        mapDataLoading = true;
        new Thread(new Runnable() {
            @Override public void run() {
                MetroMapData d = null;
                try { d = MetroMapData.parse(getAssets().open("metro_native.bin")); } catch (Throwable t) { d = null; }
                final MetroMapData fd = d;
                main.post(new Runnable() { @Override public void run() {
                    mapDataLoading = false;
                    if (fd == null) { toast("노선도를 열지 못했어요"); return; }
                    mapData = fd;
                    mapView = new MetroMapView(ShellActivity.this, fd, dpr);
                    mapView.setListener(new MetroMapView.Listener() {
                        @Override public void onStation(int op, float sx, float sy) {
                            map.tapStation(mapData.labelName(op));
                            openMapSheet(S_STN_H);
                        }
                        @Override public void onGestureStart() { if (ShellCore.S_MAPSTN.equals(sheetName) || ShellCore.S_MAPTT.equals(sheetName)) closeSheet(); }
                        @Override public void onReady() { }
                        @Override public void onError(String msg) { toast("노선도를 그리지 못했어요"); }
                        @Override public void onCentered(int op) { map.tapStation(mapData.labelName(op)); openMapSheet(S_STN_H); }
                    });
                    holder.addView(mapView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                    mapView.setFilter(map.flt());
                    syncMapView();
                } });
            }
        }, "shell-mapdata").start();
    }
    private void hideMapView() {
        closeSheet();
        if (mapView != null) mapView.setVisibility(View.GONE);
    }

    /** 아래에서 올라오는 팝업(역 정보·시간표). hDp > 0 이면 그 높이(dp), 음수면 화면 높이의 -hDp %. */
    private void openMapSheet(int hDp) {
        closeSheet();
        sheetName = ShellCore.S_MAPSTN;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        int[] pal = ShellCore.palette(ShellCore.theme(store));
        sheetView.setPalette(pal);
        sheetView.setListener(new SheetHost());
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_Dialog_NoActionBar);
        sheet.setContentView(sheetView);
        try {
            android.view.Window w = sheet.getWindow();
            int hpx = hDp > 0 ? Math.round(hDp * dpr) : Math.round(getResources().getDisplayMetrics().heightPixels * (-hDp) / 100f);
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, hpx);
            w.setGravity(android.view.Gravity.BOTTOM);
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(pal[ScreenView.R_BG]));
            w.clearFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            w.setWindowAnimations(android.R.style.Animation_InputMethod);
            sheet.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() { @Override public void onDismiss(android.content.DialogInterface d) { map.ttSeq++; } });
            sheet.show(); slideIn(sheetView);
        } catch (Throwable t) { toast("역 정보를 열지 못했어요"); return; }
        final String json = map.stnRequest(ShellCore.CAP, ShellCore.theme(store));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (sheet == null || !sheet.isShowing() || !ShellCore.S_MAPSTN.equals(sheetName)) return;
                    if (txt.length() == 0) { closeSheet(); return; }          // 역이 아닌 글자 — 조용히 닫는다
                    map.onStn(txt); map.setLinesFromStn(txt);
                    present(sheetView, txt, false);
                    if (mapView != null) mapView.ensureVisible(map.stn);
                } });
            }
        }, "shell-mapstn").start();
    }

    private void mapSheetAct(String v) {
        switch (map.sheetAct(v)) {
            case MapCore.R_CLOSE: closeSheet(); break;
            case MapCore.R_START:
                home.setStation(HomeCore.START, map.pickName, map.pickLine, map.pickLa, map.pickLo);
                closeSheet(); toast("출발역: " + map.pickName + " · 이제 도착역을 선택하세요");
                break;
            case MapCore.R_DEST:
                home.setStation(HomeCore.DEST, map.pickName, map.pickLine, map.pickLa, map.pickLo);
                closeSheet();
                if (home.bothSet()) {
                    toast("도착역: " + map.pickName);
                    store.put(ShellCore.K_TAB, "home"); showTab("home");
                    main.postDelayed(new Runnable() { @Override public void run() { goRoute(); } }, 400);
                } else toast("도착역: " + map.pickName + " · 출발역도 골라 주세요");
                break;
            case MapCore.R_TT: openTimetable(); break;
            case MapCore.R_TT_LOAD: ttFetch(); break;
            case MapCore.R_TT_RENDER: ttRender(); break;
            default: break;
        }
    }
    private void openTimetable() {
        if (sheet == null) return;
        try { android.view.Window w = sheet.getWindow(); w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(getResources().getDisplayMetrics().heightPixels * 0.62f)); } catch (Throwable ignored) { }
        sheetName = ShellCore.S_MAPTT;
        ttRender();
        ttFetch();
    }
    private void ttRender() {
        final String json = map.ttRequest(ShellCore.CAP, ShellCore.theme(store));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (sheet == null || !sheet.isShowing() || !ShellCore.S_MAPTT.equals(sheetName) || txt.length() == 0) return;
                    map.onTt(txt);
                    present(sheetView, txt, true);
                } });
            }
        }, "shell-maptt").start();
    }
    /** 시간표 응답이 없으면 묻는다: 처음이면 이 역의 모든 노선을 한 번에, 요일을 골랐으면 그 노선·요일만. */
    private void ttFetch() {
        final int sq = map.ttSeq;
        final String body = map.ttAskBody(System.currentTimeMillis());
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(MapCore.ttUrl(), body, 12000);
                final boolean got = r.status == 200 && map.addTt(r.body, sq);
                main.post(new Runnable() { @Override public void run() {
                    if (sq != map.ttSeq) return;
                    if (!got) map.ttState = "fail";
                    ttRender();
                } });
            }
        }, "shell-ttfetch").start();
    }

    private void closeSheet() { try { if (sheet != null) sheet.dismiss(); } catch (Throwable ignored) { } sheet = null; sheetView = null; sheetName = ""; }

    private final class SheetHost implements ScreenView.Listener {
        @Override public void onAction(ScreenCore.Act a) {
            if (ShellCore.S_MAPSTN.equals(sheetName) || ShellCore.S_MAPTT.equals(sheetName)) { if ("call".equals(a.a)) mapSheetAct(a.v); return; }
            if (ShellCore.S_SETPG.equals(sheetName)) { setPageAct(a.a, a.v, a.key, false); return; }
            if (!"call".equals(a.a)) return;
            if (ShellCore.S_FAV.equals(sheetName)) { favAct(a.v, sheetView == null ? null : sheetView.fields()); return; }
            if (ShellCore.S_DETAIL.equals(sheetName)) { detailAct(a.v); return; }
            if ("wr.close".equals(a.v) || "fm.close".equals(a.v)) { closeSheet(); return; }
            if ("wr.submit".equals(a.v)) { submitWrite(); return; }
            String[] ln = food.sheetLink(a.v);
            if (ln != null && "fm.ki".equals(a.v)) { openKakaoPlace(ln); return; }
            if (ln != null) openExternal(ln[0], ln[1]);
        }
        @Override public void onSet(ScreenCore.Act a, boolean on) { if (ShellCore.S_SETPG.equals(sheetName)) setPageAct(a.a, a.v, a.key, on); }
        @Override public void onSearch(ScreenCore.Act a, String q) { if (ShellCore.S_SETPG.equals(sheetName) && "cm".equals(setPage) && "call".equals(a.a)) cmAct("call", a.v, null, false, q); }
        @Override public void onInputFocus(boolean on) { }
        @Override public void onFirstDraw() { }
        @Override public void onText(String key, String value, String kind) {
            if (ShellCore.S_SETPG.equals(sheetName) && "cm".equals(setPage)) { if ("cmq".equals(key) && "edit".equals(kind)) cmQuery(value); return; }
            if (!ShellCore.S_FAV.equals(sheetName)) return;
            if ("blur".equals(kind)) {                                   // 후보 줄을 누르는 동안 잠깐 기다렸다 닫는다
                main.postDelayed(new Runnable() { @Override public void run() { if (ShellCore.S_FAV.equals(sheetName) && fav.endActive()) { fav.sync(sheetView == null ? null : sheetView.fields()); loadFav(); } } }, 250);
                return;
            }
            if (fav.onText(key, value, kind)) { fav.sync(sheetView == null ? null : sheetView.fields()); fav.fs = "fvs".equals(key) ? value : fav.fs; fav.fd = "fvd".equals(key) ? value : fav.fd; loadFav(); }
        }
        @Override public void onContentH(float dp) { }
    }
    private void submitWrite() {
        if (writeBusy || sheetView == null) return;
        Map<String, String> f = sheetView.fields();
        final String t = f.get("wt") == null ? "" : f.get("wt").trim(), b = f.get("wb") == null ? "" : f.get("wb").trim();
        writeT = t; writeB = b;
        if (t.length() == 0) { writeErr = "제목을 입력해주세요"; loadWrite(true); return; }
        if (b.length() == 0) { writeErr = "내용을 입력해주세요"; loadWrite(true); return; }
        final String nick = ShellCore.commId(store);
        writeBusy = true; writeErr = ""; loadWrite(true);
        final String json = BoardCore.postBody(nick, t, b, "잡담", owner());
        new Thread(new Runnable() {
            @Override public void run() {
                final String bad = rulesCheck("post", "잡담", t, b);
                if (bad.length() > 0) {
                    main.post(new Runnable() { @Override public void run() { writeBusy = false; writeErr = bad; loadWrite(true); } });
                    return;
                }
                NetPost.Res r = NetPost.post(ShellCore.BOARD_BASE + "/post", json, 9000);
                final String id = r.status == 200 ? ShellCore.jsonId(r.body) : "";
                final boolean rejected = r.status >= 400 && r.status < 500;
                final String why = rejected ? ShellCore.jsonError(r.body) : "";
                final String award = rejected ? "" : rulesAward("write", id.length() > 0);
                main.post(new Runnable() { @Override public void run() {
                    writeBusy = false;
                    if (rejected) { writeErr = why.length() > 0 ? why : "등록할 수 없어요"; loadWrite(true); return; }
                    long now = System.currentTimeMillis();
                    boolean ok = id.length() > 0;
                    board.addMine(ok ? id : "L" + now, "잡담", t, b, nick, now, !ok);
                    toast(award.length() > 0 ? award : ok ? "글이 등록되었어요" : "글을 저장했어요. 연결되면 모두에게 보여요");
                    closeSheet();
                    reloadBoard();
                } });
            }
        }, "shell-post").start();
    }

    // ───────────── 홈 탭 ─────────────
    private HomeCore.Env homeEnv() {
        HomeCore.Env e = new HomeCore.Env();
        Calendar c = Calendar.getInstance();
        e.nowMs = System.currentTimeMillis();
        e.tzoMin = -(c.getTimeZone().getOffset(e.nowMs) / 60000);
        e.y = c.get(Calendar.YEAR); e.m = c.get(Calendar.MONTH); e.d = c.get(Calendar.DAY_OF_MONTH);
        int w = c.get(Calendar.DAY_OF_WEEK);
        e.hol = w == Calendar.SATURDAY || w == Calendar.SUNDAY;
        return e;
    }

    /** 홈 화면: 입력 상태를 엔진에 보내고, 경로 결과가 있으면 결과 화면도 받아 이어 붙여 올린다. */
    private void loadHome(final ScreenView v, final boolean keep) {
        final int my = ++seqHome;
        startHomeTick();
        final String json = home.request(homeEnv(), ShellCore.CAP);
        final boolean hasRes = home.hasRoute();
        final String resBody = hasRes ? home.resultRequest(homeEnv(), ShellCore.CAP, ShellCore.theme(store), 0) : "";
        final String resKey = home.resRev + ":" + home.resTab;
        final long nowH = System.currentTimeMillis();
        hc.ensureNext(nowH);
        hc.rideScene = RideService.running ? RideService.liveScene : "";
        hc.share = RideService.running && RideService.liveShare != null;
        final String hKey = hc.key(home.resRev, home.resTab, nowH, chat.talkCount(), chat.talkMark());
        final String hBody = hKey.equals(hcKey) ? "" : hc.request(ShellCore.CAP, ShellCore.theme(store), homeEnv(), home.resultFacts(homeEnv(), ShellCore.theme(store)), chat.recentTalksJson(8));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/home", json, 8000);
                String txt = r.status == 200 ? r.body : "";
                if (hasRes && txt.length() > 0) {
                    String rs;
                    if (resKey.equals(resCacheKey)) rs = resCacheJson;
                    else {
                        NetPost.Res rr = NetPost.post(ShellCore.BASE + "/screen/result", resBody, 15000);
                        rs = rr.status == 200 ? rr.body : "";
                        if (rs.length() > 0) { resCacheKey = resKey; resCacheJson = rs; }
                    }
                    if (rs.length() > 0) { final String rsf = rs; txt = ShellCore.mergeBodies(txt, rs); main.post(new Runnable() { @Override public void run() { home.onResult(rsf); chat.routeSec = home.resSec; maybeFetchNotes(); } }); }
                    else main.post(new Runnable() { @Override public void run() { toast("경로 결과를 그리지 못했어요"); } });
                }
                if (txt.length() > 0) {                                                    // 홈 카드 3장(AI 승무원 · 혼잡도 · 실시간 대화)
                    String cj;
                    if (hBody.length() == 0) cj = hcJson;
                    else {
                        NetPost.Res cr = NetPost.post(ShellCore.BASE + "/screen/hcards", hBody, 15000);
                        cj = cr.status == 200 && cr.body != null ? cr.body : "";
                        if (cj.length() > 0) { hcKey = hKey; hcJson = cj; }
                    }
                    if (cj.length() > 0) txt = ShellCore.mergeBodies(txt, cj);
                }
                final String fin = txt;
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqHome) return;
                    present(v, fin, keep);
                    if (fin.length() > 0) home.onScreen(fin);
                } });
            }
        }, "shell-home").start();
    }

    // ───────────── 홈 카드 묶음: 눌림 · 대화 갱신 · 위치 ─────────────
    private boolean homeTickOn;
    private void hcAct(String v) {
        String input = body.fields().get("talk.in");
        switch (hc.act(v, input)) {
            case HcardsCore.R_AI: hc.refreshAi(System.currentTimeMillis()); reloadHome(); break;
            case HcardsCore.R_TALK_OPEN:
                chat.select("all");
                store.put(ShellCore.K_MODE, "chat");
                store.put(ShellCore.K_TAB, "community");
                showTab("community");
                break;
            case HcardsCore.R_TALK_SEND: sendHomeTalk(hc.sendText); break;
            case HcardsCore.R_SHARE: shareLoc(); break;
            default: break;
        }
    }
    /** 내 위치 공유: 엔진이 준 글+그림을 다른 앱(카카오톡 우선)으로 보낸다. 그림은 앱 캐시의 파일 제공자로 읽게 한다. */
    private void shareLoc() {
        final ShareCore.Share sh = RideService.liveShare;
        if (sh == null) { toast("탑승 안내 중일 때만 공유할 수 있어요"); return; }
        final int[] pal = ShellCore.palette(ShellCore.theme(store));
        new Thread(new Runnable() {
            @Override public void run() {
                Uri uri = null;
                try {
                    android.graphics.Bitmap bmp = ShareArt.draw(sh, pal);
                    File dir = new File(getCacheDir(), ShareProvider.DIR);
                    if (!dir.isDirectory()) dir.mkdirs();
                    File[] old = dir.listFiles();
                    if (old != null) for (File o : old) o.delete();
                    File f = new File(dir, "gildongmu_" + System.currentTimeMillis() + ".png");
                    FileOutputStream os = new FileOutputStream(f);
                    try { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, os); } finally { os.close(); }
                    uri = ShareProvider.uriFor(ShellActivity.this, f);
                } catch (Throwable t) { ErrLog.record(ShellActivity.this, t, false); }
                final Uri fu = uri;
                main.post(new Runnable() { @Override public void run() { startShare(sh.text, fu); } });
            }
        }).start();
    }
    private void startShare(String text, Uri img) {
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.putExtra(Intent.EXTRA_TEXT, text);
            if (img != null) { send.setType("image/png"); send.putExtra(Intent.EXTRA_STREAM, img); send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); }
            else send.setType("text/plain");
            Intent chooser = Intent.createChooser(send, "내 위치 공유");
            try {
                getPackageManager().getPackageInfo("com.kakao.talk", 0);
                Intent kk = new Intent(send).setPackage("com.kakao.talk");
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { kk });
            } catch (PackageManager.NameNotFoundException ignored) { }
            startActivity(chooser);
        } catch (Throwable t) { toast("공유할 수 있는 앱을 열지 못했어요"); }
    }
    private void sendHomeTalk(final String text) {
        final String me = ShellCore.commId(store);
        if (me.length() == 0) { toast("설정에서 커뮤니티 아이디를 등록하면 글과 제보를 남길 수 있어요"); return; }
        final String json = "{\"nick\":" + ShellCore.q(me) + ",\"text\":" + ShellCore.q(text) + "}";
        new Thread(new Runnable() {
            @Override public void run() {
                final String bad = rulesCheck("chat", "", text);
                if (bad.length() > 0) { toastMain(bad); return; }
                main.post(new Runnable() { @Override public void run() { body.setField("talk.in", ""); } });
                NetPost.Res rr = NetPost.post(ShellCore.BOARD_BASE + "/react", json, 9000);
                final String why = rr.status == 200 && rr.body != null && rr.body.contains("\"stored\"") ? "" : (rr.status == 0 ? "네트워크가 불안정해요" : rr.body != null && rr.body.contains("filtered") ? "부적절한 표현이 있어 올리지 못했어요" : "잠시 후 다시 시도해 주세요(시간당 한도)");
                main.post(new Runnable() { @Override public void run() {
                    if (why.length() > 0) toast(why);
                    pollHomeTalks();
                    main.postDelayed(new Runnable() { @Override public void run() { pollHomeTalks(); } }, 1500);
                } });
            }
        }, "shell-home-send").start();
    }
    private boolean homeVisible() { return slots.length > 0 && ShellCore.S_HOME.equals(slots[slots.length - 1]); }
    private void pollHomeTalks() {
        if (!homeVisible()) return;
        final String me = ShellCore.commId(store);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.get(chat.talksUrlNow(), 6000);
                if (r.status != 200 || r.body == null) return;
                final String b = r.body;
                main.post(new Runnable() { @Override public void run() {
                    String before = chat.talkMark();
                    if (chat.addTalks(b, me) && !before.equals(chat.talkMark()) && homeVisible()) reloadHome();
                } });
            }
        }, "shell-home-talks").start();
    }
    /** 홈이 보이는 동안 5초마다: 새 대화를 받고, AI 승무원 갱신 시각이 지났으면 새로고침한다. */
    private void startHomeTick() {
        if (homeTickOn) return;
        homeTickOn = true;
        quietFix();
        pollHomeTalks();
        main.postDelayed(new Runnable() {
            @Override public void run() {
                if (!homeVisible()) { homeTickOn = false; return; }
                pollHomeTalks();
                pollRide();
                long now = System.currentTimeMillis();
                if (hc.aiNextAt > 0 && now >= hc.aiNextAt) { hc.refreshAi(now); reloadHome(); }
                main.postDelayed(this, 5000);
            }
        }, 5000);
    }
    /** 권한이 이미 있으면 물어보지 않고 마지막 위치를 한 번 읽어 둔다(혼잡도·브리핑의 '가까운 역'). */
    private void quietFix() {
        long now = System.currentTimeMillis();
        if (now - hc.fixAt < 10 * 60000L) return;
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            Location best = null;
            for (String p : lm.getProviders(true)) { Location l = lm.getLastKnownLocation(p); if (l != null && (best == null || l.getTime() > best.getTime())) best = l; }
            if (best != null) { hc.setFix(best.getLatitude(), best.getLongitude(), now); reloadHome(); }
        } catch (Throwable t) { /* 위치 없이 그린다 */ }
    }
    private void reloadHome() { if (ShellCore.S_HOME.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadHome(body, true); }

    private void homeText(final String key, String value, String kind) {
        final int f = "dest".equals(key) ? HomeCore.DEST : HomeCore.START;
        if ("blur".equals(kind)) {                       // 후보 줄을 누르는 동안 잠깐 기다렸다 닫는다
            main.postDelayed(new Runnable() { @Override public void run() { home.endActive(f); reloadHome(); } }, 250);
            return;
        }
        if (!home.onText(key, value, kind)) return;
        fetchCands();
        reloadHome();
    }

    /** 눌려 있는 칸의 글자에 대한 버스정류장·장소 후보를 받아 온다(글이 같으면 다시 받지 않는다). */
    private void fetchCands() {
        final String q = home.wantQuery();
        if (q.length() == 0) return;
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res rb = NetPost.get(HomeSearchCore.busUrl(HomeSearchCore.DEFAULT_BASE, q), 6000);
                final List<Map<String, Object>> bus = rb.status == 200 ? HomeSearchCore.parseBus(rb.body) : new java.util.ArrayList<Map<String, Object>>();
                NetPost.Res rp = NetPost.get(HomeSearchCore.placeUrl(HomeSearchCore.DEFAULT_BASE, q), 6000);
                final List<Map<String, Object>> pl = rp.status == 200 ? HomeSearchCore.parsePlaces(rp.body) : new java.util.ArrayList<Map<String, Object>>();
                main.post(new Runnable() { @Override public void run() {
                    boolean a = home.setCands(q, true, bus), b = home.setCands(q, false, pl);
                    if (a || b) reloadHome();
                } });
            }
        }, "shell-cand").start();
    }

    private void homeAct(String v, Map<String, String> fields) {
        int r = home.act(v, fields);
        switch (r) {
            case HomeCore.R_RESULT: reloadHome(); break;
            case HomeCore.R_FAV: openFavSheet(); break;
            case HomeCore.R_LD: ldReselect(); break;
            case HomeCore.R_ROOM: goRoom(); break;
            case HomeCore.R_DETAIL: openDetailSheet(); break;
            case HomeCore.R_STOP: stopRide(); break;
            case HomeCore.R_RENDER: case HomeCore.R_FIELDS:
                if (r == HomeCore.R_FIELDS) setHomeFields();
                reloadHome(); break;
            case HomeCore.R_GPS: startGps(); break;
            case HomeCore.R_PICK_TIME: pickBase(); break;
            case HomeCore.R_GO: goRoute(); break;
            case HomeCore.R_NEED_BOTH: toast("출발지와 도착지를 입력해 주세요"); break;
            default: break;
        }
    }

    /** 고른 장소·바꾸기 뒤 입력칸 글자를 화면에 다시 쓴다. */
    private void setHomeFields() {
        body.setField(HomeCore.KEYS[HomeCore.START], home.text[HomeCore.START]);
        body.setField(HomeCore.KEYS[HomeCore.DEST], home.text[HomeCore.DEST]);
    }

    // 위치 감지: 권한 → 마지막 위치 → 한 번 갱신
    private static final int REQ_LOC = 71;
    private void startGps() {
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            locGate(new Runnable() { @Override public void run() { requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_LOC); } },
                new Runnable() { @Override public void run() { toast("위치 정보 이용에 동의하지 않아 내 위치를 쓸 수 없어요"); } });
            return;
        }
        home.gps = true; reloadHome();
        final LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        try {
            Location best = null;
            for (String p : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            }
            if (best != null && System.currentTimeMillis() - best.getTime() < 120000) { gotGps(best); return; }
            String prov = lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
            final Location fallback = best;
            final LocationListener ll = new LocationListener() {
                @Override public void onLocationChanged(Location l) { try { lm.removeUpdates(this); } catch (Throwable ignored) { } gotGps(l); }
                @Override public void onProviderEnabled(String p) { }
                @Override public void onProviderDisabled(String p) { }
                @Override @SuppressWarnings("deprecation") public void onStatusChanged(String p, int s, Bundle b) { }
            };
            lm.requestSingleUpdate(prov, ll, Looper.getMainLooper());
            main.postDelayed(new Runnable() { @Override public void run() {
                if (!home.gps) return;
                try { lm.removeUpdates(ll); } catch (Throwable ignored) { }
                if (fallback != null) gotGps(fallback); else { home.gps = false; toast("현재 위치를 찾지 못했어요"); reloadHome(); }
            } }, 12000);
        } catch (Throwable t) { home.gps = false; toast("위치를 쓸 수 없어요"); reloadHome(); }
    }
    private void gotGps(Location l) {
        if (!home.gps) return;
        home.setGpsStart(l.getLatitude(), l.getLongitude());
        setHomeFields(); reloadHome();
    }
    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_FOOD_LOC || code == REQ_MAP_LOC) {
            boolean g = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            LocCb cb = pendingLoc; pendingLoc = null;
            if (cb == null) return;
            if (g) locateOnce(code, cb); else cb.fail(true);
            return;
        }
        if (code == REQ_RIDE) {
            boolean g = false;
            for (int i = 0; i < perms.length && i < res.length; i++) if (android.Manifest.permission.ACCESS_FINE_LOCATION.equals(perms[i]) && res[i] == PackageManager.PERMISSION_GRANTED) g = true;
            if (g) startRide(); else toast("위치 권한이 있어야 탑승 안내를 할 수 있어요");
            return;
        }
        if (code != REQ_LOC) return;
        boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
        if (ok) startGps(); else toast("위치 권한이 필요해요");
    }

    // 기준시각: 날짜 → 시각 고르기(네이티브 대화상자)
    private void pickBase() {
        final Calendar c = Calendar.getInstance();
        if (home.baseMs >= 0) c.setTimeInMillis(home.baseMs);
        new android.app.DatePickerDialog(this, new android.app.DatePickerDialog.OnDateSetListener() {
            @Override public void onDateSet(android.widget.DatePicker dp, final int y, final int m, final int d) {
                new android.app.TimePickerDialog(ShellActivity.this, new android.app.TimePickerDialog.OnTimeSetListener() {
                    @Override public void onTimeSet(android.widget.TimePicker tp, int h, int mi) {
                        Calendar x = Calendar.getInstance();
                        x.set(y, m, d, h, mi, 0); x.set(Calendar.MILLISECOND, 0);
                        home.baseMs = x.getTimeInMillis();
                        if (home.hasRoute() && home.bothSet()) goRoute();          // 결과를 보는 중에 기준시각을 바꾸면 그 시각으로 다시 찾는다
                        else reloadHome();
                    }
                }, c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), false).show();
            }
        }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show();
    }

    /** 경로 탐색: 좌표가 있는 두 장소로 경로 서버에 묻는다. 빠른 응답(live=0)을 먼저 그리고, 엔진의 follow 지시대로 전체를 뒤따라 받는다. */
    private void goRoute() {
        final boolean picked = home.baseMs >= 0;
        final long base = picked ? home.baseMs : System.currentTimeMillis();
        final String qs = HomeCore.routeQuery(home.loc[HomeCore.START], home.loc[HomeCore.DEST], base, picked);
        if (qs == null) { toast("출발지와 도착지를 목록에서 골라 주세요"); return; }
        final String url = HomeCore.routeUrl(qs), a = home.text[HomeCore.START], b = home.text[HomeCore.DEST];
        final long bt = picked ? base : -1, rb = System.currentTimeMillis();
        final int my = ++seqRoute;
        home.lastQs = qs;
        toast("경로를 찾는 중이에요");
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r1 = NetPost.get(RouteFetchCore.liveZero(url), 15000);
                String b1 = (r1.status == 200 && r1.body != null) ? r1.body : "";
                Map<String, Object> fo = RouteFetchCore.extractFollow(b1);
                boolean draw = b1.length() > 2 && RouteFetchCore.draws(fo);
                if (draw) postRoute(my, b1, a, b, bt, rb);
                if (!draw || RouteFetchCore.wantsFull(fo)) {
                    NetPost.Res r2 = NetPost.get(url, 30000);
                    String b2 = (r2.status == 200 && r2.body != null) ? r2.body : "";
                    if (b2.length() > 2) { postRoute(my, b2, a, b, bt, rb); fo = RouteFetchCore.extractFollow(b2); }
                    else if (!draw) { postFail(my); return; }
                }
                if (bt < 0) retryEstimated(my, url, fo);                       // 기준시각을 직접 고르지 않았을 때만(고르면 실시간 도착을 못 쓴다)
            }
        }, "shell-route").start();
    }
    /** '예상'으로 남은 버스 구간이 있으면 엔진이 준 간격(follow.retry)마다 다시 받아, 엔진이 '나아졌다(follow.better)'고 할 때만 결과를 바꾼다. */
    @SuppressWarnings("unchecked")
    private void retryEstimated(final int my, String url, Map<String, Object> fo) {
        if (fo == null || !(fo.get("retry") instanceof List)) return;
        List<Object> delays = (List<Object>) fo.get("retry");
        int miss = RouteFetchCore.num(fo, "miss"), applied = RouteFetchCore.num(fo, "applied");
        for (Object dobj : delays) {
            if (miss <= 0 || !(dobj instanceof Number)) return;
            try { Thread.sleep(Math.max(1000, Math.min(60000, ((Number) dobj).longValue()))); } catch (InterruptedException e) { return; }
            if (my != seqRoute || !home.hasRoute()) return;
            String u = url.replaceFirst("baseMs=\\d+", "baseMs=" + System.currentTimeMillis()) + "&pm=" + miss + "&pa=" + applied;
            NetPost.Res r = NetPost.get(u, 30000);
            String body = r.status == 200 && r.body != null ? r.body.trim() : "";
            Map<String, Object> f2 = RouteFetchCore.extractFollow(body);
            if (body.length() < 3 || f2 == null || my != seqRoute) continue;
            if (Boolean.TRUE.equals(f2.get("better"))) {
                miss = RouteFetchCore.num(f2, "miss"); applied = RouteFetchCore.num(f2, "applied");
                final String nb = body;
                main.post(new Runnable() { @Override public void run() { if (my == seqRoute && home.replaceRoute(nb)) reloadHome(); } });
            }
        }
    }
    private boolean notesBusy;
    /** 결과 카드의 공지·지연 제보 줄: 엔진이 알려 준 내 지하철 노선에 대해 서버 원자료를 받아 엔진에 다시 묻는다(60초 안에는 다시 받지 않는다). */
    private void maybeFetchNotes() {
        final long now0 = System.currentTimeMillis();
        if (notesBusy || !home.needNotes(now0)) return;
        notesBusy = true;
        final String key = home.secKey();
        final StringBuilder qs = new StringBuilder();
        for (String l : home.resSec) { if (qs.length() > 0) qs.append(','); qs.append(l); }
        final int my = seqRoute;
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res o = NetPost.get(ShellCore.BASE + "/line-notices", 6000);
                NetPost.Res a = NetPost.get(ShellCore.BOARD_BASE + "/lalerts?lines=" + HomeSearchCore.enc(qs.toString()), 6000);
                final String off = o.status == 200 && o.body != null && o.body.startsWith("{") && o.body.length() < 200000 ? o.body : "";
                final String al = a.status == 200 && a.body != null && a.body.startsWith("{") && a.body.length() < 200000 ? a.body : "";
                main.post(new Runnable() { @Override public void run() {
                    notesBusy = false;
                    if (my != seqRoute || !home.hasRoute()) return;
                    home.setNotes(key, off, al, System.currentTimeMillis());
                    if (off.length() > 0 || al.length() > 0) reloadHome();
                } });
            }
        }, "shell-notes").start();
    }
    /** 장거리 '다른 편' 고르기: 엔진이 만든 질의를 덧붙여 다시 받고, 엔진이 장거리 경로만 바꿔 끼운다. */
    private void ldReselect() {
        if (home.lastQs.length() == 0) return;
        final String url = HomeCore.routeUrl(home.lastQs + home.ldPending);
        final int my = ++seqRoute;
        toast("다른 편을 찾는 중이에요");
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.get(url, 30000);
                final String b = r.status == 200 && r.body != null ? r.body.trim() : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqRoute) return;
                    if (b.length() > 2 && b.charAt(0) == '{' && b.charAt(b.length() - 1) == '}') { home.ld2Raw = b; home.resRev++; reloadHome(); }
                    else toast("다른 편을 받지 못했어요");
                } });
            }
        }, "shell-ld").start();
    }
    /** 노선 방 보기: 실시간소통 탭에서 그 노선 방을 연다. */
    private void goRoom() {
        chat.select(home.roomLine);
        store.put(ShellCore.K_MODE, "chat");
        store.put(ShellCore.K_TAB, "community");
        showTab("community");
    }

    // ───────────── 탑승 추적 ─────────────
    private static final int REQ_RIDE = 74;
    private final RideCore ride = new RideCore();
    private long rideGraceUntil = 0L;
    /** 경로 확정: 엔진이 대기 모드 state 를 만들면 포그라운드 서비스가 이어받는다. */
    private void startRide() {
        if (!home.hasRoute() || home.riding()) return;
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            locGate(new Runnable() { @Override public void run() {
                    if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION, android.Manifest.permission.POST_NOTIFICATIONS }, REQ_RIDE);
                    else requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_RIDE);
                } },
                new Runnable() { @Override public void run() { toast("위치 정보 이용에 동의하지 않아 탑승 안내를 할 수 없어요"); } });
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[] { android.Manifest.permission.POST_NOTIFICATIONS }, REQ_RIDE + 1);
        final String body = RideCore.startBody(ShellCore.CAP, home.resultFacts(homeEnv(), ShellCore.theme(store)), RideCore.offKinds(store), "1".equals(store.get(ShellCore.K_PFL, "0")));
        final int rid = home.routeId;
        toast("탑승 안내를 준비하고 있어요");
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/ride/start", body, 12000);
                final String txt = r.body == null ? "" : r.body;
                main.post(new Runnable() { @Override public void run() {
                    if (rid != home.routeId || !home.hasRoute()) return;                  // 그 사이 다른 경로를 찾았다
                    String err = txt.length() == 0 ? "탑승 안내를 시작하지 못했어요" : ride.onStart(txt);
                    if (err.length() > 0) { toast(err); return; }
                    RideService.save(ShellActivity.this, ride);
                    store.put(ShellCore.K_RIDESNAP, home.rideSnapshot());
                    try { RideService.start(ShellActivity.this); } catch (Throwable t) { toast("탑승 안내를 켜지 못했어요"); return; }
                    home.rideRouteId = rid;
                    rideGraceUntil = System.currentTimeMillis() + 8000L;
                    home.setRide(ride.rideJson(), ride.lvJson());
                    closeSheet();
                    toast("탑승 안내를 시작했어요");
                    reloadHome();
                    final List<String> secs = new ArrayList<String>(home.resSec);
                    new Thread(new Runnable() {
                        @Override public void run() {
                            RulesCore.applyMyLines(store, rulesCall(RulesCore.mylinesBody(store.get(ChatCore.K_MY, "[]"), secs, System.currentTimeMillis())));
                            toastMain(rulesAward("ride", true));
                        }
                    }, "shell-rules-ride").start();
                } });
            }
        }, "shell-ride").start();
    }
    /** 앱이 죽었다(또는 화면만 다시 만들어졌다) 다시 열렸을 때, 탑승 안내가 아직 살아 있으면 그 경로의 결과 카드를 되살린다. */
    private void restoreRideCard() {
        try {
            String snap = store.get(ShellCore.K_RIDESNAP, "");
            if (snap.length() < 3 || home.hasRoute()) return;
            RideCore live = RideCore.restore(getSharedPreferences(RideService.PREFS, MODE_PRIVATE).getString(RideService.KEY_SAVED, ""), System.currentTimeMillis());
            if (live == null || !home.restoreRide(snap)) return;
            home.rideRouteId = home.routeId;
            home.setRide(RideService.running ? RideService.liveRide : live.rideJson(), RideService.running ? RideService.liveLv : live.lvJson());
            rideGraceUntil = System.currentTimeMillis() + 8000L;
        } catch (Throwable ignored) { }
    }
    private void stopRide() {
        store.put(ShellCore.K_RIDESNAP, "");
        RideService.stop(this);
        rideGraceUntil = 0L;
        home.setRide("", "");
        reloadHome();
        toast("탑승 안내를 끝냈어요");
    }
    /** 서비스가 엔진에게서 받은 상태(상주 글 · 내 위치)를 결과 카드에 옮긴다. */
    private void pollRide() {
        if (!home.riding()) return;
        if (!RideService.running && System.currentTimeMillis() < rideGraceUntil) return;       // 서비스가 막 켜지는 중
        if (home.setRide(RideService.liveRide, RideService.liveLv)) reloadHome();
    }

    // ───────────── 세부경로 시트 ─────────────
    private void openDetailSheet() {
        closeSheet();
        sheetName = ShellCore.S_DETAIL;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        sheetView.setPalette(ShellCore.palette(ShellCore.theme(store)));
        sheetView.setListener(new SheetHost());
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        sheet.setContentView(sheetView);
        try { sheet.show(); slideIn(sheetView); } catch (Throwable t) { toast("세부경로를 열지 못했어요"); return; }
        loadDetail();
    }
    private void loadDetail() {
        final String json = home.detailRequest(homeEnv(), ShellCore.CAP, ShellCore.theme(store));
        if (json.length() == 0) { closeSheet(); return; }
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/result", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (sheet == null || !sheet.isShowing() || !ShellCore.S_DETAIL.equals(sheetName)) return;
                    if (txt.length() == 0) { toast("세부경로를 받지 못했어요"); return; }
                    home.onDetail(txt);
                    present(sheetView, txt, true);
                } });
            }
        }, "shell-detail").start();
    }
    private void detailAct(String v) {
        switch (home.actDetail(v)) {
            case HomeCore.D_CLOSE: closeSheet(); break;
            case HomeCore.D_RENDER: loadDetail(); break;
            case HomeCore.D_CONFIRM: startRide(); break;
            case HomeCore.D_STOP: stopRide(); closeSheet(); break;
            case HomeCore.D_KAKAO: openNav(home.navKakao); break;
            case HomeCore.D_NAVER: openNav(home.navNaver); break;
            default: break;
        }
    }
    /** 길안내: 앱 주소를 먼저 열고, 앱이 없으면 웹 주소로. */
    private void openNav(String[] u) {
        if (u == null) return;
        if (HomeCore.navAppOk(u[0])) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u[0]))); return; } catch (ActivityNotFoundException e) { /* 앱 없음 → 웹 */ }
        }
        openLink(u[1]);
    }

    // ───────────── 설정 하위 화면 시트(다른 앱 위에 표시) ─────────────
    private String setPage = "ovl";
    private boolean arrStat;
    private final CmCore cm = new CmCore();
    private int cmBusSeq;
    private void openSetPage(String page) {
        closeSheet();
        setPage = page; arrStat = false;
        if ("cm".equals(page)) { cm.sub = ""; cm.clearBus(); }
        sheetName = ShellCore.S_SETPG;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        sheetView.setPalette(ShellCore.palette(ShellCore.theme(store)));
        sheetView.setListener(new SheetHost());
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        sheet.setContentView(sheetView);
        if ("locd".equals(page)) sheet.setCancelable(false);                 // 바깥을 눌러도 닫히지 않는다 — 직접 [동의] 또는 [거부]
        try { sheet.show(); slideIn(sheetView); } catch (Throwable t) { toast("설정을 열지 못했어요"); return; }
        loadSetPage();
    }
    private void loadSetPage() {
        final String url = "sam".equals(setPage) ? ShellCore.pageUrlSam(PowerInfo.read(this).pageFacts())
            : ("cm".equals(setPage) ? ShellCore.pageUrlCm(cm.pageFacts(store))
            : "gw".equals(setPage) ? ShellCore.pageUrlGw(GwCore.pageFacts(store))
            : "locd".equals(setPage) ? ShellCore.pageUrlPlain("locd", null)
            : "erl".equals(setPage) ? ShellCore.pageUrlPlain("erl", ErrCore.pageFacts(store))
            : ShellCore.isPolPage(setPage) ? ShellCore.pageUrlPlain(setPage, null)
            : "dev".equals(setPage) ? ShellCore.pageUrlDev(DevCore.pageFacts(devPh, devLeft(), devStopped))
            : "arr".equals(setPage) ? ShellCore.pageUrlArr(arrStat, RideService.running, notifOk(), RideService.liveReco, RideService.recoStage, RideService.recoStageAt)
            : ShellCore.pageUrl(store, "ovl", RideOverlay.supported(), RideOverlay.allowed(this)));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.get(url, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (sheet == null || !sheet.isShowing() || !ShellCore.S_SETPG.equals(sheetName)) return;
                    if (txt.length() == 0) { toast("설정을 받지 못했어요"); return; }
                    if ("cm".equals(setPage)) cm.setStations(cmStations(txt));
                    present(sheetView, txt, true);
                } });
            }
        }, "shell-setpg").start();
    }
    /** 엔진 장소 고르기 화면의 info.pk.u(지하철역 후보 이름들). */
    @SuppressWarnings("unchecked")
    private static List<String> cmStations(String json) {
        List<String> out = new java.util.ArrayList<String>();
        try {
            Object o = ScreenCore.parse(json);
            Object info = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            Object pk = info instanceof Map ? ((Map<String, Object>) info).get("pk") : null;
            Object u = pk instanceof Map ? ((Map<String, Object>) pk).get("u") : null;
            if (u instanceof List) for (Object x : (List<Object>) u) { Object nm = x instanceof Map ? ((Map<String, Object>) x).get("name") : null; out.add(nm instanceof String ? (String) nm : ""); }
        } catch (ScreenCore.ParseError e) { out.clear(); }
        return out;
    }
    /** 출퇴근 브리핑 화면 눌림 — 저장은 CmCore, 알림 문구·시각은 엔진. */
    private void cmAct(String a, String v, String key, boolean on, String q) {
        int r = cm.act(store, a, v, key, on, q);
        if ((r & CmCore.R_CLOSE) != 0) { closeSheet(); loadSlot(slots.length - 1, true); return; }
        if ((r & CmCore.R_RESCHED) != 0) { CommuteAlarm.rescheduleAsync(this); gwSync(false); }
        if ((r & CmCore.R_TEST) != 0) { testBrief(); return; }
        if ((r & CmCore.R_BUS) != 0) { cmBusSearch(cm.pkQ); return; }
        if ((r & CmCore.R_RENDER) != 0) loadSetPage();
    }
    /** 글자가 바뀔 때마다: 검색어를 기억하고 버스정류장을 다시 찾는다(역 후보는 화면을 다시 받을 때 엔진이 정한다). */
    private void cmQuery(String q) {
        int r = cm.onQuery(q);
        if ((r & CmCore.R_BUS) != 0) cmBusSearch(cm.pkQ); else if ((r & CmCore.R_RENDER) != 0) loadSetPage();
    }
    private void cmBusSearch(final String q) {
        final int my = ++cmBusSeq;
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res rb = NetPost.get(HomeSearchCore.busUrl(HomeSearchCore.DEFAULT_BASE, q.trim()), 6000);
                final List<Map<String, Object>> raw = rb.status == 200 ? HomeSearchCore.parseBus(rb.body) : new java.util.ArrayList<Map<String, Object>>();
                main.post(new Runnable() { @Override public void run() {
                    if (my != cmBusSeq || !"cm".equals(setPage) || !cm.picking() || sheet == null || !sheet.isShowing()) return;
                    List<String> names = new java.util.ArrayList<String>(); List<double[]> geo = new java.util.ArrayList<double[]>();
                    for (Map<String, Object> m : raw) {
                        Object nm = m.get("nodenm") != null ? m.get("nodenm") : m.get("nodeNm");
                        double la = HomeSearchCore.pf(m.get("gpslati")), lo = HomeSearchCore.pf(m.get("gpslong"));
                        if (nm instanceof String && ((String) nm).length() > 0 && la != 0 && lo != 0) { names.add((String) nm); geo.add(new double[] { la, lo }); }
                    }
                    cm.setBus(names, geo);
                    loadSetPage();
                } });
            }
        }, "shell-cmbus").start();
    }
    /** '지금 미리보기': 지금이 오후 3시 전이면 출근, 아니면 퇴근 브리핑을 알림으로 한 번 띄운다(글은 엔진). */
    private void testBrief() {
        toast("브리핑을 만드는 중이에요");
        final android.content.Context app = getApplicationContext();
        final String kind = Calendar.getInstance().get(Calendar.HOUR_OF_DAY) < 15 ? "morn" : "eve";
        new Thread(new Runnable() { @Override public void run() { CommuteAlarm.send(app, kind); } }, "shell-cmtest").start();
    }
    private void setPageAct(String a, String v, String key, boolean on) {
        if ("cm".equals(setPage)) { cmAct(a, v, key, on, null); return; }
        int r = ShellCore.routePage(store, setPage, a, v, key, on, RideOverlay.allowed(this));
        if (r == ShellCore.PG_CLOSE) {
            if (locOk != null && ShellCore.isPolPage(setPage)) { openSetPage("locd"); return; }          // 안내에서 방침을 보러 갔다 오면 안내로 돌아온다
            closeSheet(); loadSlot(slots.length - 1, true); return;
        }
        if (r == ShellCore.PG_LOCOK) { closeSheet(); Runnable ok = locOk; locOk = null; locNo = null; if (ok != null) ok.run(); return; }
        if (r == ShellCore.PG_LOCNO) { closeSheet(); Runnable no = locNo; locOk = null; locNo = null; if (no != null) no.run(); return; }
        if (r == ShellCore.PG_POLOPEN) { openSetPage("polp"); return; }
        if (r == ShellCore.PG_SAMOPEN) { PowerInfo.openSamsung(this); return; }          // 돌아오면 onResume 이 다시 읽어 그린다
        if (r == ShellCore.PG_BATREQ) { PowerInfo.requestIgnore(this); return; }
        if (r == ShellCore.PG_ARRTEST) { testReco(ShellCore.arrKind(v)); return; }
        if (r == ShellCore.PG_ERLCOPY) {
            try { ((android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("오류 로그", ErrCore.copyText(store))); toast("복사했어요"); }
            catch (Throwable t) { toast("복사하지 못했어요"); }
            return;
        }
        if (r == ShellCore.PG_ERLCLEAR) { ErrCore.clear(store); toast("오류 로그를 지웠어요"); loadSetPage(); return; }
        if (r == ShellCore.PG_DEVSTART) { devStart(DevCore.mode(v)); return; }
        if (r == ShellCore.PG_DEVSTOP) { devStop(true); return; }
        if (r == ShellCore.PG_GWADD) {
            gwSync(true);
            if (WidgetCore.pin(this, GwCore.addType(v))) toast("홈 화면에 추가할지 물어보면 [추가]를 눌러 주세요");
            else toast("이 런처는 바로 추가를 지원하지 않아요. 홈 화면을 길게 눌러 위젯에서 길동무 캐릭터 시계를 골라 주세요");
            return;
        }
        if (r == ShellCore.PG_GWCFG) { try { WidgetCore.setConfigJson(getApplicationContext(), GwCore.configJson(store)); } catch (Throwable ignored) { } }       // 장소 좌표는 이미 적혀 있다 — 돌아다니는 시간만 바뀐 것
        if (r == ShellCore.PG_RENDER && "arr".equals(setPage)) arrStat = true;
        if (r == ShellCore.PG_NEEDPERM) {                              // '다른 앱 위에 표시' 허용 화면(기기 설정)으로 보낸다. 돌아오면 onResume 이 다시 그린다.
            toast("설정에서 '다른 앱 위에 표시'를 허용해 주세요");
            try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); } catch (Throwable t) { /* 기기가 못 열면 안내 글만 남는다 */ }
        }
        if (r != ShellCore.PG_NONE) loadSetPage();
    }

    // ───────────── 개발자 도구(출시 전 삭제): 가짜 여정을 떠 있는 안내 막대에 보낸다 ─────────────
    private String devMode = "", devPh;
    private long devT0;
    private boolean devStopped, devRecoSent;
    private RideOverlay devOv;
    private final Runnable devTick = new Runnable() { @Override public void run() { devStep(); } };
    private int devSec() { return (int) ((System.currentTimeMillis() - devT0) / 1000L); }
    private int devLeft() { return devMode.length() == 0 ? 0 : Math.max(0, DevCore.total(devMode) - devSec()); }
    private void devStart(String mode) {
        if (mode == null) return;
        if (!RideOverlay.allowed(this) && !"reco".equals(mode) && !"quit".equals(mode)) { toast("설정에서 '다른 앱 위에 표시'를 먼저 허용해 주세요"); return; }
        devStop(false);
        devMode = mode; devT0 = System.currentTimeMillis(); devStopped = false; devRecoSent = false; devPh = null;
        if (devOv == null) devOv = new RideOverlay(this);
        devStep();
    }
    private void devStop(boolean render) {
        main.removeCallbacks(devTick);
        if (devOv != null) devOv.hide();
        boolean was = devMode.length() > 0;
        devMode = ""; devPh = null; devStopped = was && render;
        if (render && ShellCore.S_SETPG.equals(sheetName) && "dev".equals(setPage) && sheet != null && sheet.isShowing()) loadSetPage();
    }
    private void devStep() {
        if (devMode.length() == 0) return;
        int sec = devSec();
        String ph = DevCore.phaseAt(devMode, sec);
        if (ph == null) { devStop(false); devStopped = false; if (ShellCore.S_SETPG.equals(sheetName) && "dev".equals(setPage) && sheet != null && sheet.isShowing()) loadSetPage(); return; }
        boolean changed = !ph.equals(devPh);
        devPh = ph;
        if ("reco".equals(ph) && !devRecoSent) { devRecoSent = true; testReco("lunch"); }
        String[] bar = DevCore.bar(ph);
        if (devOv != null) { if (bar == null) devOv.hide(); else devOv.update(true, bar[0], bar[1], bar[2], Integer.parseInt(bar[3])); }
        if ("quit".equals(devMode) && sec >= DevCore.QUIT_AT - 1) { main.postDelayed(new Runnable() { @Override public void run() { finishAndRemoveTask(); android.os.Process.killProcess(android.os.Process.myPid()); } }, 1000L); return; }
        if ((changed || sec % 5 == 0) && ShellCore.S_SETPG.equals(sheetName) && "dev".equals(setPage) && sheet != null && sheet.isShowing()) loadSetPage();
        main.postDelayed(devTick, 1000L);
    }

    // ───────────── 위치 정보 이용 안내(처음 위치 권한을 요청하기 전에 한 번) ─────────────
    private Runnable locOk, locNo;
    private void locGate(Runnable ok, Runnable no) {
        if ("1".equals(store.get(ShellCore.K_LOCDISC, "0"))) { ok.run(); return; }
        locOk = ok; locNo = no;
        openSetPage("locd");
    }

    private boolean notifOk() {
        try { return ((android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE)).areNotificationsEnabled(); } catch (Throwable t) { return true; }
    }
    /** 시험 알림: 그 시간대의 실제 추천 알림을 지금 한 번 띄운다(글은 엔진). */
    private void testReco(final String kind) {
        if (kind == null) return;
        toast("추천 알림을 만드는 중이에요");
        final android.content.Context app = getApplicationContext();
        new Thread(new Runnable() {
            @Override public void run() {
                final boolean ok = RecoNotify.send(app, ShellCore.arrTestBody(kind, System.currentTimeMillis()));
                RideService.recoStage = ok ? "시험 알림 보냄(" + kind + ")" : "시험 알림 못 보냄(" + kind + ")"; RideService.recoStageAt = System.currentTimeMillis();
                main.post(new Runnable() { @Override public void run() { if (!ok) toast("추천을 받지 못했어요"); if (sheet != null && sheet.isShowing() && "arr".equals(setPage)) { arrStat = true; loadSetPage(); } } });
            }
        }, "shell-recotest").start();
    }

    // ───────────── 즐겨찾기 시트 ─────────────
    private void openFavSheet() {
        closeSheet();
        sheetName = ShellCore.S_FAV;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        sheetView.setPalette(ShellCore.palette(ShellCore.theme(store)));
        sheetView.setListener(new SheetHost());
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        sheet.setContentView(sheetView);
        try { sheet.show(); slideIn(sheetView); } catch (Throwable t) { toast("즐겨찾기를 열지 못했어요"); return; }
        loadFav();
    }
    private void loadFav() {
        final String json = fav.request(ShellCore.CAP, ShellCore.theme(store), home.hasRoute() ? home.resA : home.text[HomeCore.START], home.hasRoute() ? home.resB : home.text[HomeCore.DEST]);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/fav", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (sheet == null || !sheet.isShowing() || !ShellCore.S_FAV.equals(sheetName)) return;
                    if (txt.length() == 0) { toast("즐겨찾기를 받지 못했어요"); return; }
                    fav.onScreen(txt);
                    if (fav.msg.length() > 0) toast(fav.msg);
                    present(sheetView, txt, true);
                } });
            }
        }, "shell-fav").start();
    }
    private void favAct(String v, Map<String, String> fields) {
        switch (fav.act(v, fields)) {
            case FavCore.R_CLOSE: closeSheet(); break;
            case FavCore.R_RENDER: loadFav(); break;
            case FavCore.R_GO: {
                FavCore.Go g = fav.go.get(fav.goIdx);
                closeSheet();
                home.setStation(HomeCore.START, g.sName, g.sLine, g.sLa, g.sLo);
                home.setStation(HomeCore.DEST, g.dName, g.dLine, g.dLa, g.dLo);
                home.clearRoute();
                store.put(ShellCore.K_TAB, "home"); showTab("home");
                setHomeFields();
                goRoute();
                break;
            }
            default: break;
        }
    }
    private int seqRoute = 0;
    private void postRoute(final int my, final String raw, final String a, final String b, final long bt, final long rb) {
        main.post(new Runnable() { @Override public void run() {
            if (my != seqRoute) return;
            if (home.setRoute(raw, a, b, bt, rb)) reloadHome(); else toast("경로 응답을 읽지 못했어요");
        } });
    }
    private void postFail(final int my) {
        main.post(new Runnable() { @Override public void run() { if (my == seqRoute) toast("경로를 받지 못했어요"); } });
    }

    private void openLink(String url) {
        if (!ShellCore.linkOk(url)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (ActivityNotFoundException e) { toast("열 수 있는 앱이 없어요"); }
    }

    /** 기사 상세: 엔진에 문구를 묻고 안내창으로 보인다. */
    private void openNews(String idx) {
        final int i;
        try { i = Integer.parseInt(idx); } catch (NumberFormatException e) { return; }
        final ShellCore.NewsRows rows = lastNews;
        if (i < 0 || i >= rows.rows.size()) return;
        final String link = rows.rows.get(i)[1];
        final String json = ShellCore.newsDetailBody(rows.rowJson(i));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/news", json, 8000);
                final ShellCore.Detail d = r.status == 200 ? ShellCore.parseDetail(r.body, link) : null;
                main.post(new Runnable() { @Override public void run() { if (d == null) toast("기사 내용을 받지 못했어요"); else showDetail(d); } });
            }
        }, "shell-news").start();
    }

    private void showDetail(final ShellCore.Detail d) {
        StringBuilder m = new StringBuilder();
        if (d.meta.length() > 0) m.append(d.meta).append("\n\n");
        m.append(d.body);
        if (d.notice.length() > 0) m.append("\n\n").append(d.notice);
        AlertDialog.Builder b = new AlertDialog.Builder(this, android.R.style.Theme_Material_Light_Dialog_Alert);
        b.setTitle(d.title).setMessage(m.toString()).setNegativeButton(d.close, null);
        if (d.open) {
            b.setPositiveButton(d.btn.length() > 0 ? d.btn : "원문 보기", new android.content.DialogInterface.OnClickListener() {
                @Override public void onClick(android.content.DialogInterface di, int w) { openLink(d.link); }
            });
        }
        try { b.show(); } catch (Throwable t) { toast(d.title); }
    }
}
