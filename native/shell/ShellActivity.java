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
    private RsSheetView rs;
    private final Runnable rsApply = new Runnable() { @Override public void run() { if (rs == null) return; boolean ovOn = false; try { ovOn = "1".equals(store.get(ShellCore.K_OVL, "0")) && RideOverlay.allowed(ShellActivity.this); } catch (Throwable ignored) { } rs.setOv(RideService.running && !ovOn ? RideService.liveOv : null); } };       // 떠 있는 안내(오버레이)가 켜져 있으면 같은 줄이 거기 있으니 앱 안에서는 겹쳐 그리지 않는다
    private ScreenView hdr, head, body, tabs;
    private float dpr = 1f;
    private String[] slots = new String[0];            // 지금 탭의 화면 칸들(위 → 아래)
    private final int[] seq = new int[2];              // 칸마다 가장 새 요청 번호(늦게 온 옛 답은 버린다)
    private int seqTabs = 0, seqHdr = 0;
    // ── 디바운스 · 연타 막기 · SWR 보관함(s132) — 입력이 멈춘 뒤 한 번만 통신하고, 같은 요청은 지난 결과를 먼저 보인다 ──
    private final Debounce deb = new Debounce(new Debounce.Clock() {
        @Override public long now() { return android.os.SystemClock.uptimeMillis(); }
        @Override public void post(Runnable r, long ms) { main.postDelayed(r, ms); }
        @Override public void cancel(Runnable r) { main.removeCallbacks(r); }
    });
    private final Swr routeSwr = new Swr(12);
    private static final long ROUTE_FRESH_MS = 8000L, ROUTE_STALE_MS = 600000L;
    // 화면 글 캐시: 탭을 오갈 때 마지막으로 받은 화면을 바로 올리고, 새 글은 뒤에서 받아 바꾼다(스크롤은 그대로)
    private final java.util.Set<String> scrKeys = java.util.Collections.newSetFromMap(new java.util.concurrent.ConcurrentHashMap<String, Boolean>());      // 메모리 캐시에 든 열쇠(다른 스레드에서 "캐시가 있나" 볼 때)
    private final java.util.LinkedHashMap<String, String> scrCache = new java.util.LinkedHashMap<String, String>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, String> e) { boolean over = size() > 40; if (over) scrKeys.remove(e.getKey()); return over; }       // 오래 안 본 화면부터 버린다(메모리 한도)
    };
    private final java.util.HashMap<ScreenView, String> viewKey = new java.util.HashMap<ScreenView, String>();
    private final java.util.HashMap<ScreenView, String> shownJson = new java.util.HashMap<ScreenView, String>();       // 칸이 지금 보여 주는 글(같은 글이면 다시 그리지 않는다)
    // 검증을 마친 화면 객체: 받는 스레드에서 미리 읽어 두면(warm) 올릴 때 주 스레드가 글을 다시 읽지 않는다
    private final java.util.LinkedHashMap<String, ScreenCore.Screen> parsedScr = new java.util.LinkedHashMap<String, ScreenCore.Screen>(16, 0.75f, true) {
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, ScreenCore.Screen> e) { return size() > 20; }
    };
    private ScreenCore.Screen parsedGet(String json) throws ScreenCore.ParseError {
        synchronized (parsedScr) { ScreenCore.Screen c = parsedScr.get(json); if (c != null) return c; }
        ScreenCore.Screen sc = ScreenCore.load(json);
        synchronized (parsedScr) { parsedScr.put(json, sc); }
        return sc;
    }
    /** 받는 스레드에서 부른다: 글을 미리 검증·해석해 둔다(실패해도 조용히 — 올릴 때 다시 알린다). */
    private void warm(String json) { if (json == null || json.length() < 5 || json.length() > 600000 || isNotMod(json)) return; try { parsedGet(json); } catch (Throwable ignored) { } }
    private volatile ShellCore.NewsRows lastNews = new ShellCore.NewsRows();
    private final HomeCore home = new HomeCore();       // 홈 탭 입력 상태(고른 출발/도착·후보·기준시각)
    private int seqHome = 0, seqCand = 0, seqBoard = 0;
    private BoardCore board;
    private MapCore map;                                   // 지도 탭(안쪽 탭·지역·호선 필터·눌린 역)
    private int seqMapH = 0, seqMapB = 0;
    private FrameLayout holder;
    private VecMap vec;
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
    /** 결과 화면 캐시: 같은 경로 자료 · 같은 탭이면 엔진에 다시 묻지 않는다. 경로가 나오면 다른 탭(최소환승 · 지하철 · 버스)도 뒤에서 미리 받아 두어, 칩을 누르면 웹처럼 바로 바뀐다. */
    private final java.util.LinkedHashMap<String, String> resCache = new java.util.LinkedHashMap<String, String>();
    private final java.util.HashSet<String> resFly = new java.util.HashSet<String>();
    private final java.util.LinkedHashMap<String, String> homeCache = new java.util.LinkedHashMap<String, String>();     // 홈 화면(검색 영역) 응답: 요청이 같으면 그대로
    private boolean homeChip;                                                    // 방금 결과 칩을 눌렀다(홈 화면 응답은 그대로 쓴다)
    private final java.util.HashMap<String, Long> resAt = new java.util.HashMap<String, Long>();
    /** 결과 화면 캐시에서 꺼낸다 — 2분이 지난 것은 쓰지 않는다(결과 속 시각이 낡지 않게). */
    private String resGet(String k) {
        String v = lruGet(resCache, k);
        if (v == null) return null;
        Long at; synchronized (resAt) { at = resAt.get(k); }
        return at != null && System.currentTimeMillis() - at < 120000L ? v : null;
    }
    private void resPut(String k, String v) { lruPut(resCache, k, v, 16); synchronized (resAt) { resAt.put(k, System.currentTimeMillis()); if (resAt.size() > 64) resAt.clear(); } }
    private static String lruGet(java.util.LinkedHashMap<String, String> m, String k) { synchronized (m) { return m.get(k); } }
    private static void lruPut(java.util.LinkedHashMap<String, String> m, String k, String v, int cap) {
        synchronized (m) { m.remove(k); m.put(k, v); while (m.size() > cap) { java.util.Iterator<String> it = m.keySet().iterator(); it.next(); it.remove(); } }
    }

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
        store = new PrefStore(getSharedPreferences(PREFS, Context.MODE_PRIVATE));      // 설정 파일 읽기는 시스템이 따로 시작한다 — 아래 일을 하는 동안 저절로 끝난다
        dpr = getResources().getDisplayMetrics().density;
        if (b == null) store.put(ShellCore.K_TAB, ShellCore.DEFAULT_TAB);            // 껐다 켜면 늘 홈부터(웹과 같다) — 화면 회전 같은 다시 만들기(b != null)는 보던 탭 그대로
        preloadDisk();                                                               // 모든 탭의 마지막 화면을 IO 스레드가 읽고 해석해 둔다(주 스레드는 파일을 열지 않는다)
        if ("map".equals(ShellCore.currentTab(store))) preconnectBus();             // 버스 서버 연결을 미리 맺어 둔다(도착정보 요청의 DNS · TLS 시간을 없앤다)
        ErrLog.install(this);
        ScreenView.preloadFaces(this);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        hdr = new ScreenView(this);                      // 맨 위 흐르는 응원 문구(엔진 /screen/hdr)
        hdr.setDpr(dpr);
        hdr.setListener(new Host(3));
        root.addView(hdr, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(43f * dpr)));
        head = new ScreenView(this);
        head.setDpr(dpr);
        head.setListener(new Host(0));
        root.addView(head, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(44f * dpr)));
        holder = new FrameLayout(this);                 // 본문 칸의 검색 입력칸이 붙을 부모
        body = new ScreenView(this);
        body.setDpr(dpr);
        body.setListener(new Host(1));
        body.setReorderHost(new ScreenView.ReorderHost() { @Override public void onReorder(String[] keys, int[] perm) { reorderBusNear(keys, perm); } });      // 주변 정류장 카드 끌어서 순서 바꾸기
        holder.addView(body, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        vec = new VecMap(this, holder, body, dpr);       // 정류장 지도: 웹과 같은 벡터 지도(MapLibre · OpenFreeMap Liberty) — 못 받으면 아래 타일 그림이 그대로
        body.setVecHost(vec);
        root.addView(holder, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        rs = new RsSheetView(this);                      // 탑승 시트: 하단 탭 바로 위(웹 rs-sheet — 도착 2분 전 [탑승]/[환승완료] · 되돌리기 · 대기 알약). 값은 서비스가 엔진에게서 받아 온다
        rs.setHost(new RsSheetView.Act() { @Override public void act(String a) { RideService.rsAct(a); } });
        root.addView(rs, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        tabs = new ScreenView(this);
        tabs.setDpr(dpr);
        tabs.setListener(new Host(2));
        tabs.setOnTouchListener(new View.OnTouchListener() {         // 하단 탭 막대를 위로 쓸면 탑승 시트를 연다(웹 _rsInitSwipe) — 탭 누름은 그대로 두려고 이벤트를 먹지 않는다
            private float tx, ty;
            @Override public boolean onTouch(View v, android.view.MotionEvent e) {
                int a = e.getActionMasked();
                if (a == android.view.MotionEvent.ACTION_DOWN) { tx = e.getX() / dpr; ty = e.getY() / dpr; }
                else if (a == android.view.MotionEvent.ACTION_UP && RideService.running) {
                    String act = RsCore.tabSwipe(RideService.liveOv, e.getX() / dpr - tx, e.getY() / dpr - ty);
                    if (act != null) RideService.rsAct(act);
                }
                return false;
            }
        });
        root.addView(tabs, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(56f * dpr)));
        setContentView(root);

        // 설정 값이 필요한 준비는 칸을 만든 뒤에(그때쯤 설정 파일 읽기가 끝나 있어 기다림이 없다)
        if (CmCore.on(store)) CommuteAlarm.rescheduleAsync(this);                 // 출퇴근 브리핑: 앞으로 4주 창을 다시 민다
        board = new BoardCore(store);
        chat = new ChatCore(store);
        fav = new FavCore(store);
        map = new MapCore(store);
        store.put(MapCore.K_BUSVW, MapCore.VW_NEAR);                          // 웹은 앱을 켤 때마다 '주변 정류장'부터
        importLegacy();

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
        loadHdr();
        main.postDelayed(hdrTick, 600000L);
        WidgetCore.captureLaunch(getIntent());
        widgetLaunch();
        gwSync(false);
        launchLocate();
        main.postDelayed(new Runnable() { @Override public void run() {                // 켠 직후 바쁜 시간이 지나 한가해지면 무거운 준비물(지도 엔진 · 노선도 그림)을 미리 만들어 둔다 — 탭에 들어갈 때 버벅이지 않게
            android.os.Looper.myQueue().addIdleHandler(new android.os.MessageQueue.IdleHandler() { @Override public boolean queueIdle() {
                if (isFinishing()) return false;
                VecMap.warmUp(ShellActivity.this);
                ensureMetro();
                return false;
            } });
        } }, 1500L);
        captureLastLoc();
        ioExec.execute(new Runnable() { @Override public void run() { main.post(new Runnable() { @Override public void run() { prefetchTabs(); } }); } });     // 켜는 즉시(0초) 모든 탭 화면을 병렬로 미리 받는다 — 캐시 파일 목록 훑기가 끝난 뒤(주 스레드가 파일을 확인하지 않게)
    }

    /** 앱을 켜면 출발지를 내 위치로 자동으로 잡는다(이미 경로를 보고 있거나 출발지를 골랐으면 건드리지 않는다). 권한 안내는 처음 한 번만 묻는다. */
    private void autoGps() {
        if (home.hasRoute() || home.loc[HomeCore.START] != null || home.gps || home.text[HomeCore.START].length() > 0) return;
        boolean perm = checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!perm) {
            if ("1".equals(store.get(ShellCore.K_GPSASK, "0"))) return;          // 한 번 물었다 — 다시 조르지 않는다(위치 감지 단추로 직접)
            store.put(ShellCore.K_GPSASK, "1");
        }
        startGps();
    }

    /** 위젯을 눌러 앱이 (다시) 열렸다. */
    @Override protected void onNewIntent(Intent it) {
        super.onNewIntent(it);
        setIntent(it);
        WidgetCore.captureLaunch(it);
        widgetLaunch();
    }
    @Override protected void onStart() { super.onStart(); if (vec != null) vec.onStart(); }
    @Override protected void onStop() { if (vec != null) vec.onStop(); super.onStop(); WidgetCore.onAppLeft(this); }
    @Override public void onLowMemory() { super.onLowMemory(); if (vec != null) vec.onLowMemory(); }

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
    @Override protected void onDestroy() { if (live == this) live = null; rloadHide(); if (locf != null) locf.cancelAll(); if (vec != null) vec.onDestroy(); super.onDestroy(); }
    @Override protected void onResume() { super.onResume(); resumed = true; RideService.rsListener = rsApply; rsApply.run(); if (vec != null) vec.onResume(); trackStart(); refreshPower(); if (System.currentTimeMillis() - hdrAt > 300000L) loadHdr(); if (prefetchAt > 0L && System.currentTimeMillis() - prefetchAt > 600000L) prefetchTabs(); busResume(); brResume(); if (ShellCore.S_SETPG.equals(sheetName) && sheet != null && sheet.isShowing()) loadSetPage(); if (ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "")) startChatPoll(); }
    @Override protected void onPause() { resumed = false; trackStop(); if (vec != null) vec.onPause(); main.removeCallbacks(brTick); brTicking = false; if (RideService.rsListener == rsApply) RideService.rsListener = null; super.onPause(); }

    @Override public void onBackPressed() {
        String t = ShellCore.currentTab(store);
        if (!ShellCore.DEFAULT_TAB.equals(t)) {
            store.put(ShellCore.K_TAB, ShellCore.DEFAULT_TAB);
            showTab(ShellCore.DEFAULT_TAB);
        } else if (!dlgKind("exit", new Runnable() { @Override public void run() { finish(); } }, null)) super.onBackPressed();      // 웹처럼 한 번 더 확인(엔진 카드) — 못 받았으면 바로 닫는다
    }

    // ───────────── 색 ─────────────
    private void applyTheme() {
        int[] pal = ShellCore.palette(ShellCore.theme(store));
        hdr.setPalette(pal);
        head.setPalette(pal);
        body.setPalette(pal);
        tabs.setPalette(pal);
        if (rs != null) rs.setPalette(pal);
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
    /** 키보드가 올라올 때 화면을 줄이지(눌러 찌그러뜨리지) 않는다 — 웹처럼 화면은 그대로 두고 키보드만 위로 뜬다(adjustPan: 입력칸이 키보드에 가릴 때만 창을 밀어 올린다).
     *  단 채팅(아래 입력줄이 화면 밑에 붙은 화면)은 입력줄이 키보드 위에 붙어야 하므로 예전처럼 줄인다. */
    private void applyIme() {
        try {
            boolean chat = "community".equals(ShellCore.currentTab(store)) && "chat".equals(ShellCore.mode(store));
            getWindow().setSoftInputMode(chat ? android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE : android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN);
        } catch (Throwable ignored) { }
    }
    private void showTab(String tab) {
        applyIme();
        hideMapView();
        slots = ShellCore.slotsOf(store, tab);
        head.setVisibility(slots.length > 1 ? View.VISIBLE : View.GONE);
        loadTabs(tab);
        if ("map".equals(tab)) seedMapLoc();
        for (int i = 0; i < slots.length; i++) loadSlot(i, false);
        tabSettle();
        if ("home".equals(tab)) main.post(new Runnable() { @Override public void run() { autoGps(); } });
    }

    /** 탭을 옮길 때 새 화면이 아이폰처럼 살짝(10dp) 떠올라 자리잡는다(0.3초 · 투명도 0.55 → 1 · 아이폰 곡선). 그리는 일만 한다 — 새 내용은 이미 올라가 있다(캐시 먼저). */
    private void tabSettle() {
        try {
            body.animate().cancel();
            body.setAlpha(0.85f); body.setTranslationY(4f * dpr);                      // 웹은 탭을 곧바로 바꾼다 — 그 느낌에 가깝게 아주 짧고 얕게(0.18초 · 4dp)
            body.animate().alpha(1f).translationY(0f).setDuration(180L).setInterpolator(new android.view.animation.PathInterpolator(0.32f, 0.72f, 0f, 1f)).start();
        } catch (Throwable ignored) { body.setAlpha(1f); body.setTranslationY(0f); }
    }
    private ScreenView viewOfSlot(int i) { return slots.length > 1 && i == 0 ? head : body; }

    private final java.util.HashMap<String, Long> tabsAt = new java.util.HashMap<String, Long>();
    private void loadTabs(final String tab) {
        final int my = ++seqTabs;
        final String url = ShellCore.tabsUrl(), json = ShellCore.tabsBody(tab), ck = "tabs|" + tab;
        viewKey.put(tabs, ck);
        String c = cacheGet(ck, true);
        final boolean shown = c != null && showCached(tabs, c);
        Long at = tabsAt.get(ck);
        if (shown && at != null && System.currentTimeMillis() - at < 600000L) return;            // 하단 탭 막대는 10분 안에 받은 화면이면 그대로(탭을 옮길 때마다 다시 받지 않는다)
        new Thread(new Runnable() {
            @Override public void run() {
                final String txt = screenCall(ck, false, url, json, null, 8000); warm(txt);
                main.post(new Runnable() { @Override public void run() { if (my == seqTabs) { present(tabs, txt, shown); if (txt.length() > 0) tabsAt.put(ck, System.currentTimeMillis()); } } });       // 캐시를 이미 보여 줬으면 같은 글은 다시 그리지 않고, 다르면 자리·깜빡임 없이 바꾼다
            }
        }, "shell-tabs").start();
    }

    // ── 맨 위 흐르는 문구: 켤 때 · 10분마다 · 앞으로 돌아올 때 새로 받는다(시간대가 바뀌면 문구 묶음이 바뀐다) ──
    private long hdrAt = 0L;
    private void loadHdr() {
        final int my = ++seqHdr;
        hdrAt = System.currentTimeMillis();
        viewKey.put(hdr, ShellCore.S_HDR);
        if (hdr.itemCount() == 0) { String c = cacheGet(ShellCore.S_HDR, true); if (c != null) showCached(hdr, c); }
        final int tz = java.util.TimeZone.getDefault().getOffset(hdrAt) / 60000;
        final String url = ShellCore.hdrUrl(tz, hdrAt);
        new Thread(new Runnable() {
            @Override public void run() {
                final String txt = screenCall(ShellCore.S_HDR, true, url, null, "tz" + tz, 8000);
                warm(txt);
                main.post(new Runnable() { @Override public void run() { if (my == seqHdr && txt.length() > 0) present(hdr, txt, true); } });
            }
        }, "shell-hdr").start();
    }
    private final Runnable hdrTick = new Runnable() {
        @Override public void run() { if (resumed) loadHdr(); main.postDelayed(this, 600000L); }
    };

    /** 같은 칸에 다른 변형(방 · 분류 · 방식)을 열 때: 열쇠를 바꾸고, 본 적이 있으면 그 화면을 먼저 올린다(올렸으면 true). */
    private boolean keyedShow(ScreenView v, String screen) {
        String ck = ShellCore.cacheKey(screen, store);
        viewKey.put(v, ck);
        String c = cacheGet(ck, ShellCore.diskCacheable(screen));
        return c != null && showCached(v, c);
    }
    /** 쇼핑·소식 분류나 테마를 바꿨다: 분류가 바뀐 것이면 본 적 있는 화면을 먼저 올리고 새 글을 받는다. */
    private void refreshLast() {
        int li = slots.length - 1;
        if (li < 0) return;
        String nk = ShellCore.cacheKey(slots[li], store), ok = viewKey.get(viewOfSlot(li));
        if (ok != null && !ok.equals(nk)) loadSlotX(li, false, false); else loadSlot(li, true);
    }

    // ───────────── 조건부 요청: 엔진이 준 ETag · max-age 를 그대로 따른다 ─────────────
    // 신선 시간(max-age) 안이고 같은 요청이면 네트워크 없이 캐시를 쓰고, 지났으면 If-None-Match 로 묻는다. 엔진이 "같다"(304)고 하면 화면은 그대로 둔다(다시 읽지도 그리지도 않아 깜빡임이 없다).
    static final String NOT_MOD = "\u0000304";
    static boolean isNotMod(String t) { return t != null && t.length() == 4 && t.charAt(0) == 0 && NOT_MOD.equals(t); }
    private boolean haveCached(String key) {
        if (scrKeys.contains(key)) return true;
        long ttl = ShellCore.diskTtl(key);
        if (ttl > 0L) { long m = diskMtime(key); return m > 0L && System.currentTimeMillis() - m <= ttl; }
        return false;
    }
    private final java.util.concurrent.ConcurrentHashMap<String, String> delayBodies = new java.util.concurrent.ConcurrentHashMap<String, String>();
    private ShellCore.Cond condOf(String ck) { return ShellCore.Cond.parse(store.get(ShellCore.condKey(ck), "")); }
    /** (스레드 안) 화면 하나를 받는다. 돌려주는 글: 받은 화면 · NOT_MOD(캐시 그대로) · ""(못 받음). 받은 화면은 캐시와 ETag 를 함께 갱신한다. */
    /** 화면 열쇠별 마지막 실패 이유(HTTP 코드 · 통신 오류) — 안내 화면에 작게 보인다. */
    private final java.util.concurrent.ConcurrentHashMap<String, String> netDiag = new java.util.concurrent.ConcurrentHashMap<String, String>();
    private String screenCall(final String ck, boolean get, String url, String body, String sig, int timeoutMs) {
        final int sg = (sig != null ? sig : (get ? url : body)).hashCode();
        final ShellCore.Cond c = condOf(ck);
        final boolean have = c != null && c.etag.length() > 0 && haveCached(ck);
        final long now = System.currentTimeMillis();
        if (have && c.fresh(now, sg)) return NOT_MOD;
        delayBodies.remove(ck);
        NetPost.Res r = get ? NetPost.getCond(url, timeoutMs, have ? c.etag : "") : NetPost.postCond(url, body, timeoutMs, have ? c.etag : "");
        if (r.status == 304 && have) { main.post(new Runnable() { @Override public void run() { store.put(ShellCore.condKey(ck), c.touched(System.currentTimeMillis(), 0, sg).enc()); } }); return NOT_MOD; }
        if (r.status == 503 && r.body != null && ShellCore.retryHint(r.body) != null) { delayBodies.put(ck, r.body); return ""; }          // 엔진이 준 "서버 연결 지연" 안내 — 캐시에 두지 않고 따로 건넨다
        if (r.status != 200 || r.body == null) { netDiag.put(ck, r.status > 0 ? "HTTP " + r.status : String.valueOf(r.err)); return ""; }
        delayBodies.remove(ck); netDiag.remove(ck);
        screenStore(ck, r.body, r.etag, r.maxAge, sg);
        return r.body;
    }
    /** 받은 화면을 검증해 캐시와 ETag 메타를 함께 갱신한다(어느 스레드에서든). 다른 화면이 오면 버린다. */
    private void screenStore(final String ck, final String json, final String etag, final int maxAge, final int sg) {
        if (json == null || json.length() < 3) return;
        try { if (!ShellCore.expectId(ck).equals(parsedGet(json).id)) return; } catch (Throwable e) { return; }
        main.post(new Runnable() { @Override public void run() {
            cachePut(ck, json);
            if (etag != null && etag.length() > 0) store.put(ShellCore.condKey(ck), new ShellCore.Cond(etag, System.currentTimeMillis(), maxAge, sg).enc());
            else store.put(ShellCore.condKey(ck), "");
        } });
    }

    // ── 화면 글 캐시 ──
    /** 주 스레드는 파일을 열지 않는다: 메모리(scrCache) → IO 스레드가 미리 읽어 둔 것(diskPre) 순서로만 본다. 둘 다 없으면 IO 스레드에 읽기를 맡기고(끝나면 빈 칸에 바로 올린다) null. */
    private String cacheGet(String key, boolean disk) {
        String c = scrCache.get(key);
        if (c == null && ShellCore.diskTtl(key) > 0L) {
            c = diskPre.remove(key);
            if (c != null) { scrCache.put(key, c); scrKeys.add(key); } else diskWarmAsync(key);
        }
        if (c != null && ShellCore.S_MAPB.equals(key.indexOf('|') > 0 ? key.substring(0, key.indexOf('|')) : key) && key.contains("|bus|")) {      // 버스 도착정보는 실시간 — 8초가 지난 것은 보여 주지 않고 새로 받을 때까지 뼈대
            long m = diskMtime(key);
            if (m <= 0L || System.currentTimeMillis() - m > ShellCore.BUS_STALE_MS) return null;          // 오래돼도 5분 안이면(앱을 껐다 켠 직후 포함) 먼저 보이고(SWR) 뒤에서 새로 받아 바꾼다
        }
        return c;
    }
    // ── 디스크 I/O 는 전용 IO 스레드 하나에서만(차례가 보장돼 쓰기 직후 읽어도 맞다) · 읽자마자 글을 미리 해석해 둔다(warm) ──
    private final java.util.concurrent.ExecutorService ioExec = java.util.concurrent.Executors.newSingleThreadExecutor(new java.util.concurrent.ThreadFactory() {
        @Override public Thread newThread(Runnable r) { Thread t = new Thread(r, "shell-io"); t.setDaemon(true); t.setPriority(Thread.NORM_PRIORITY - 1); return t; }
    });
    private final java.util.concurrent.ConcurrentHashMap<String, String> diskPre = new java.util.concurrent.ConcurrentHashMap<String, String>();
    private final java.util.Set<String> diskAsked = java.util.Collections.newSetFromMap(new java.util.concurrent.ConcurrentHashMap<String, Boolean>());
    private void diskWarmAsync(final String key) {
        if (key == null || ShellCore.diskTtl(key) <= 0L || !diskAsked.add(key)) return;
        ioExec.execute(new Runnable() { @Override public void run() {
            String c = diskGet(key);
            if (c == null) { diskAsked.remove(key); return; }
            warm(c);
            diskPre.put(key, c);
            main.post(new Runnable() { @Override public void run() { adoptDisk(key); diskAsked.remove(key); } });
        } });
    }
    /** IO 스레드가 읽어 온 화면을 메모리에 넣고, 그 열쇠를 기다리는(빈 칸 · 뼈대) 칸이 있으면 바로 올린다. 그사이 네트워크 글이 먼저 왔으면 그것을 지키고 버린다. */
    private void adoptDisk(String key) {
        String c = diskPre.remove(key);
        if (c == null || scrCache.get(key) != null) return;
        scrCache.put(key, c); scrKeys.add(key);
        for (java.util.Map.Entry<ScreenView, String> e : new java.util.ArrayList<java.util.Map.Entry<ScreenView, String>>(viewKey.entrySet())) {
            ScreenView v = e.getKey();
            if (key.equals(e.getValue()) && v != sheetView && (v.itemCount() == 0 || skelViews.contains(v)) && !c.equals(shownJson.get(v))) showCached(v, c);
        }
    }
    /** 켤 때: 지금 탭의 화면 글을 IO 스레드에서 미리 읽고 해석해 둔다(첫 그림이 파일 읽기를 기다리지 않게). */
    private void preloadDisk() {
        ioExec.execute(new Runnable() { @Override public void run() {          // 설정 값으로 열쇠를 만드는 일도 IO 스레드에서(설정 파일이 덜 읽혔어도 주 스레드가 기다리지 않는다)
            try {                                                              // 캐시 폴더를 한 번 훑어 파일 목록(이름 · 수정 시각)을 메모리에 둔다 — 이후 "있나?" 는 파일을 열지 않고 메모리에서 답한다
                File[] fs = new File(getCacheDir(), "scr").listFiles();
                if (fs != null) for (File f : fs) { String n = f.getName(); if (n.endsWith(".json") && f.length() > 2) diskIdx.put(n.substring(0, n.length() - 5), f.lastModified()); }
            } catch (Throwable ignored) { }
            idxReady.countDown();
            try { for (String k : ShellCore.warmKeys(store, ShellCore.currentTab(store))) diskWarmAsync(k); } catch (Throwable ignored) { }
        } });
    }
    /** 캐시 파일 목록(파일 이름 → 수정 시각). IO 스레드가 채우고(훑기 · 쓰기 · 지우기) 모든 스레드가 읽는다. */
    private final java.util.concurrent.ConcurrentHashMap<String, Long> diskIdx = new java.util.concurrent.ConcurrentHashMap<String, Long>();
    private final java.util.concurrent.CountDownLatch idxReady = new java.util.concurrent.CountDownLatch(1);
    private static String diskName(String key) { return Integer.toHexString(key.hashCode()); }
    /** 캐시 파일의 수정 시각(없으면 -1). 파일을 열지 않는다 — 주 스레드가 아닌 곳에서는 처음 훑기가 끝나기를 잠깐(최대 1초) 기다린다. */
    private long diskMtime(String key) {
        if (idxReady.getCount() > 0 && Looper.myLooper() != Looper.getMainLooper()) { try { idxReady.await(1, java.util.concurrent.TimeUnit.SECONDS); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); } }
        Long m = diskIdx.get(diskName(key));
        return m == null ? -1L : m;
    }
    private void cachePut(String key, String json) {
        scrCache.put(key, json); scrKeys.add(key);
        if (ShellCore.diskTtl(key) > 0L) diskIdx.put(diskName(key), System.currentTimeMillis());          // 받은 시각(캐시 나이 · 파일 목록)을 바로 맞춘다
        if (key.startsWith(ShellCore.S_SETTINGS + "|")) dropOldSettings(key);
        if (ShellCore.diskTtl(key) > 0L && !(ShellCore.S_HOME.equals(key) && home.hasRoute())) diskPut(key, json);        // 경로를 보는 중의 홈은 디스크에 두지 않는다(다시 켜면 그 경로 상태가 없다)
    }
    /** 설정 화면은 기기 값마다 열쇠가 달라지므로 지난 값의 글 · 파일 · 메모는 치운다(쌓이지 않게). */
    private String lastSetKey = "";
    private void dropOldSettings(String key) {
        String old = lastSetKey; lastSetKey = key;
        if (old.length() == 0 || old.equals(key)) return;
        scrCache.remove(old); scrKeys.remove(old); store.put(ShellCore.condKey(old), "");
        final File f = diskFile(old); diskIdx.remove(diskName(old));
        ioExec.execute(new Runnable() { @Override public void run() { try { f.delete(); } catch (Throwable ignored) { } } });
    }
    private File diskFile(String key) { return new File(new File(getCacheDir(), "scr"), diskName(key) + ".json"); }
    private String diskGet(String key) {
        try {
            File f = diskFile(key);
            if (!f.isFile() || f.length() > 600000L || System.currentTimeMillis() - f.lastModified() > ShellCore.diskTtl(key)) return null;
            java.io.FileInputStream in = new java.io.FileInputStream(f);
            try {
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                byte[] b = new byte[8192]; int n;
                while ((n = in.read(b)) > 0) bo.write(b, 0, n);
                String t = new String(bo.toByteArray(), "UTF-8");
                return t.length() > 2 ? t : null;
            } finally { in.close(); }
        } catch (Throwable t) { return null; }
    }
    private void diskPut(final String key, final String json) {
        ioExec.execute(new Runnable() { @Override public void run() {
            try {
                File d = new File(getCacheDir(), "scr");
                if (!d.isDirectory()) d.mkdirs();
                FileOutputStream os = new FileOutputStream(diskFile(key));
                try { os.write(json.getBytes("UTF-8")); } finally { os.close(); }
                diskIdx.put(diskName(key), System.currentTimeMillis());
            } catch (Throwable ignored) { }
        } });
    }
    /** 캐시 글을 조용히 올린다(검증 통과한 것만; 못 읽으면 버린다). */
    private boolean showCached(ScreenView v, String json) {
        try {
            String ak = viewKey.get(v); long am = ak == null ? -1L : diskMtime(ak);
            v.setSourceAge(am > 0L ? System.currentTimeMillis() - am : 0L);                 // 캐시 화면의 버스 초 카운트다운은 받은 뒤 흐른 만큼 이미 줄어 있다
            v.setScreen(parsedGet(json), false); shownJson.put(v, json); skelViews.remove(v);
            String ck = viewKey.get(v);
            if (ck != null && v != sheetView) restoreState(ck, json);
            return true;
        } catch (Throwable e) { return false; }
    }
    /** 캐시 화면이 눌림에 필요한 상태(화면 info)를 함께 되살린다(받은 화면을 올릴 때와 같은 onScreen). 글 목록 번호표를 쓰는 게시판은 새 글을 받은 뒤에만 맞는다. */
    private void restoreState(String ck, String json) {
        String id = ShellCore.expectId(ck);
        try {
            if (ShellCore.S_HOME.equals(id)) home.onScreen(json);
            else if (ShellCore.S_CHAT.equals(id)) chat.onScreen(json);
            else if (ShellCore.S_FOOD.equals(id)) { final String fj = json; ioExec.execute(new Runnable() { @Override public void run() { final FoodCore.Parsed fp = FoodCore.parseScreen(fj); main.post(new Runnable() { @Override public void run() { food.apply(fp); } }); } }); }       // 큰 목록(6칩 화면)은 주 스레드에서 읽지 않는다
            else if ("map".equals(id)) map.onScreen(json);
            else if (ShellCore.S_BOARD.equals(id) && json.contains("\"sid\":")) board.onScreen(json);       // 엔진이 글 고유 id 를 준 화면은 보낸 목록 순서와 상관없이 맞는다
        } catch (Throwable ignored) { }
    }
    // 스켈레톤: 캐시도 없고 아직 못 받은 칸에 먼저 보이는 뼈대
    private final java.util.HashSet<ScreenView> skelViews = new java.util.HashSet<ScreenView>();
    private void showSkeleton(ScreenView v, String screen) {
        try {
            if (v == body && ShellCore.S_MAPB.equals(screen) && "bus".equals(map.mode()) && MapCore.VW_NEAR.equals(map.busView())) {        // 버스: 엔진이 그려 둔 정류장 뼈대(도착정보 자리는 '불러오는 중')를 먼저 — 같은 동네(약 110m 칸)일 때만, 숫자는 없다
                String cell = map.stopsCell(), sk = cell.length() > 0 && cell.equals(store.get("bsk_cell", "")) ? cacheGet(ShellCore.busSkelKey(store), true) : null;
                if (sk != null) { v.setSourceAge(0L); v.setScreen(parsedGet(sk), false); shownJson.remove(v); skelViews.add(v); return; }
            }
            v.setScreen(parsedGet(ShellCore.skeletonScreen(screen)), false); shownJson.remove(v); skelViews.add(v);
        }
        catch (Throwable e) { v.clearScreen(); shownJson.remove(v); }
    }

    /** 칸 i 의 화면을 받아 올린다. 원자료가 있는 화면은 먼저 원자료를 받는다. */
    private void loadSlot(final int i, final boolean keep0) { loadSlotX(i, keep0, true); }
    /** clearOnMiss: 캐시가 없을 때 칸을 비울지(다른 탭으로 옮겨 왔으면 비운다 · 같은 화면의 분류만 바꿀 땐 옛 화면을 두고 새 글을 기다린다). */
    private void loadSlotX(final int i, final boolean keep0, final boolean clearOnMiss) {
        if (i < 0 || i >= slots.length) return;
        final String screen = slots[i];
        final int si = slots.length > 1 ? i : 1;                // seq 번호: 머리 0 · 본문 1
        final int my = ++seq[si];
        final ScreenView v = viewOfSlot(i);
        boolean keepX = keep0;
        if (ShellCore.S_PENDING.equals(screen)) { viewKey.remove(v); present(v, ShellCore.pendingScreen(ShellCore.currentTab(store)), false); return; }
        final String ck = ShellCore.cacheKey(screen, store);
        viewKey.put(v, ck);
        if (!keep0) retryN.remove(v);                                 // 사람이 연 로드(탭 · 분류 · 다시 시도)는 자동 재시도를 처음부터
        if (!keep0) {
            String c = cacheGet(ck, ShellCore.diskCacheable(screen));
            if (c != null && showCached(v, c)) { keepX = true; if (ShellCore.S_MAPB.equals(screen)) syncMapView(); }
            else if (clearOnMiss) {
                if (v == body && diskAsked.contains(ck)) {                  // 디스크에서 읽는 중 — 곧(수십 ms) 마지막 화면이 올라오므로 뼈대를 잠깐 미뤄 깜빡임을 없앤다
                    v.clearScreen(); shownJson.remove(v);
                    final String wk = ck; final int wmy = my;
                    main.postDelayed(new Runnable() { @Override public void run() { if (wmy == seq[si] && v.itemCount() == 0 && wk.equals(viewKey.get(v))) showSkeleton(v, screen); } }, 120L);
                }
                else if (v == body) showSkeleton(v, screen); else { v.clearScreen(); shownJson.remove(v); }
            }       // 머리 칸(칩 줄)은 뼈대 없이 비운다(높이가 그린 만큼이라)          // 옛 탭 화면이 남아 보이지 않게 — 받는 동안은 뼈대
        }
        final boolean keep = keepX;
        final Runnable go = new Runnable() { @Override public void run() {
            if (my != seq[si]) return;                               // 그 사이 다른 탭 · 더 새 요청이 시작됐다 — 이 받기는 보내지 않는다
            if (ShellCore.S_HOME.equals(screen)) { loadHome(v, keep); return; }
            if (ShellCore.S_BOARD.equals(screen)) { loadBoard(v, keep, true); return; }
            if (ShellCore.S_CHAT.equals(screen)) { loadChat(v, keep, true); return; }
            if (ShellCore.S_FOOD.equals(screen)) { loadFood(v, keep, false); return; }
            if (ShellCore.S_MAPH.equals(screen)) { loadMapHead(v, keep, null, null); return; }
            if (ShellCore.S_MAPB.equals(screen)) { if (keep && !keep0 && busReturnQuiet()) return; loadMapBodyFast(v, keep); return; }
            new Thread(new Runnable() {
                @Override public void run() {
                    final String txt = fetchGeneric(screen); warm(txt);
                    main.post(new Runnable() { @Override public void run() { if (my == seq[si]) present(v, txt, keep); } });
                }
            }, "shell-slot").start();
        } };
        // SWR: 캐시 화면은 위에서 0초에 이미 올렸다. 탭을 연달아 옮기는 동안은 새로 받기를 잠깐 미뤄(디바운스) 지나친 탭의 통신을 보내지 않는다. 캐시가 없으면 곧장.
        if (!keep0 && keep) deb.trailing("slot" + si, Debounce.TAB_GAP_MS, go); else { deb.cancel("slot" + si); go.run(); }
    }

    /** 상태 없이 엔진에서 한 번에 받는 화면(쇼핑·소식·칩 줄·설정)의 글. 못 받으면 "". */
    private String fetchGeneric(String screen) {
        String[] feeds = feedsAll(ShellCore.feedUrls(screen), 8000);
        if (ShellCore.S_NEWS.equals(screen)) lastNews = ShellCore.NewsRows.from(feeds);
        store.put(ShellCore.K_DAY, RulesCore.day(System.currentTimeMillis()));
        ShellCore.Req rq = ShellCore.request(screen, store, feeds);
        if (rq == null) return "";
        String ck = ShellCore.cacheKey(screen, store);
        String t = ShellCore.S_SHOP.equals(screen) ? shopCall(ck, store.get(ShellCore.K_SHOP_CAT, "")) : screenCall(ck, "GET".equals(rq.method), rq.url, rq.body, null, 10000);          // 쇼핑: 엔진이 상품 서버를 못 받으면 앱이 직접 받아 실어 보낸다(계산은 여전히 엔진)
        if (t.length() == 0) { String d = delayBodies.remove(ck); if (d != null) return d; }          // 못 받았는데 엔진이 안내 화면을 줬으면 그것
        return t;
    }
    /** 쇼핑 화면 한 번 받기: 엔진에 묻고(상품 서버는 엔진이 받는다), 엔진이 상품 서버를 못 받았다고 하면 앱이 직접 받아 실어 보낸다. */
    private String shopCall(String ck, String cat) {
        if ("1".equals(store.get("shop_direct", ""))) {                    // 엔진이 상품 서버를 못 받는 것으로 확인됐다 — 처음부터 앱이 받아 실어 보낸다(엔진이 헛되이 13초 기다리지 않게)
            String d = shopDirect(ck, cat);
            if (d.length() > 0) return d;
        }
        String t = screenCall(ck, true, ShellCore.shopUrl(cat), null, null, 16000);
        if (t.length() == 0 && delayBodies.containsKey(ck)) {
            String d = shopDirect(ck, cat);
            if (d.length() > 0) { main.post(new Runnable() { @Override public void run() { store.put("shop_direct", "1"); } }); return d; }
        }
        return t;
    }
    /** 쇼핑: 상품 서버(gildongmu-shop)와 운영 설정(gildongmu-food)을 앱이 동시에 직접 받아 POST /screen/shop 에 실어 보낸다. 못 받으면 "". */
    private String shopDirect(String ck, String cat) {
        final String[] raw = new String[] { "", "" };
        Thread a = new Thread(new Runnable() { @Override public void run() { NetPost.Res r = NetPost.get(ShellCore.SHOP_BASE + "/shop", 9000); if (r.status == 200 && r.body != null) raw[0] = r.body; } }, "shell-shopsrc");
        Thread b = new Thread(new Runnable() { @Override public void run() { NetPost.Res r = NetPost.get(FoodCore.FOOD_BASE + "/app-config?k=shop", 4000); if (r.status == 200 && r.body != null) raw[1] = r.body; } }, "shell-shopcfg");
        a.start(); b.start();
        try { a.join(11000L); b.join(1500L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return ""; }
        try { if (!(ScreenCore.parse(raw[0]) instanceof java.util.Map)) return ""; } catch (Throwable e) { return ""; }
        boolean cfgOk = false;
        try { cfgOk = ScreenCore.parse(raw[1]) instanceof java.util.Map; } catch (Throwable e) { cfgOk = false; }
        String body = "{\"cap\":" + ShellCore.CAP + ",\"cat\":" + ShellCore.q(cat == null ? "" : cat) + ",\"shop\":" + raw[0] + (cfgOk ? ",\"cfg\":" + raw[1] : "") + "}";
        NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/shop", body, 12000);
        if (r.status != 200 || r.body == null) { netDiag.put(ck, r.status > 0 ? "shop POST HTTP " + r.status : "shop POST " + r.err); return ""; }
        delayBodies.remove(ck); netDiag.remove(ck);
        screenStore(ck, r.body, "", 0, body.hashCode());
        return r.body;
    }
    /** 원자료(뉴스 피드 등) GET: 서버가 ETag 를 주면 If-None-Match 로 묻고 304 면 가진 글을 그대로 쓴다(주지 않는 서버면 평소대로 받는다). */
    private final java.util.concurrent.ConcurrentHashMap<String, String> feedBodies = new java.util.concurrent.ConcurrentHashMap<String, String>();
    /** 원자료 여러 곳을 동시에 받는다(차례로 받으면 느린 한 곳이 다른 곳까지 붙잡는다). 못 받은 곳은 빈 글. */
    private String[] feedsAll(final String[] urls, final int timeoutMs) {
        final String[] out = new String[urls.length];
        java.util.Arrays.fill(out, "");
        Thread[] th = new Thread[urls.length];
        for (int k = 0; k < urls.length; k++) {
            final int kk = k;
            th[k] = new Thread(new Runnable() { @Override public void run() { try { out[kk] = feedGet(urls[kk], timeoutMs); } catch (Throwable ignored) { } } }, "shell-feed");
            th[k].start();
        }
        for (Thread t : th) { try { t.join(timeoutMs + 3000L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; } }
        return out;
    }
    private String feedGet(String url, int timeoutMs) {
        String fk = "feed|" + url, old = feedBodies.get(fk);
        ShellCore.Cond c = condOf(fk);
        if (old != null && c != null && c.fresh(System.currentTimeMillis(), 0)) return old;
        NetPost.Res r = NetPost.getCond(url, timeoutMs, old != null && c != null ? c.etag : "");
        if (r.status == 304 && old != null) { if (c != null) store.put(ShellCore.condKey(fk), c.touched(System.currentTimeMillis(), r.maxAge, 0).enc()); return old; }
        if (r.status != 200 || r.body == null) return "";
        if (r.body.length() < 2000000) { feedBodies.put(fk, r.body); store.put(ShellCore.condKey(fk), new ShellCore.Cond(r.etag, System.currentTimeMillis(), r.maxAge, 0).enc()); }
        return r.body;
    }

    /**
     * 앱을 켜는 즉시(0초) 모든 탭의 화면을 뒤에서 병렬로 미리 받아 캐시(메모리 + 디스크)에 둔다. 예외 탭은 없다.
     *  · 지금 보는 칸은 건드리지 않는다(요청 번호를 올리지 않는다). 대화 · 지도 · 맛집은 따로 만든 상태기(고스트)로 받아 지금 상태를 어지럽히지 않는다.
     *  · 분류 · 방 · 방식마다의 화면까지 받는다: 소식(엔진이 모든 분류를 한 번에), 쇼핑 분류, 대화방, 노선도 버스/지하철, 칩 줄 방식.
     *  · 위치가 필요한 지도 · 맛집은 마지막으로 안 위치로 받는다(위치가 한 번도 없으면 그 안내 화면이 캐시된다).
     */
    private long prefetchAt = 0L;
    private static final long PF_SKIP_MS = 120000L;                  // 이보다 최근에 받아 둔 화면은 미리 받기에서 건너뛴다(데이터 · 배터리)
    private ChatCore pfChat; private MapCore pfMap, pfMapB; private final FoodCore pfFood = new FoodCore();

    // ── 우선순위 큐: 지금 보는 탭은 평소 로더가 바로 받고, 나머지는 여기서 순서(우선순위)대로 100~300ms 간격으로 받는다(동시 2개 · 낮은 스레드 우선순위) ──
    private interface PfJob { boolean run() throws Exception; }          // 돌려주는 값: 네트워크를 썼는가(썼으면 다음 일 전에 쉰다)
    private static final class PfTask implements Comparable<PfTask> {
        final int prio; final long seq; final PfJob job;
        PfTask(int p, long s, PfJob j) { prio = p; seq = s; job = j; }
        @Override public int compareTo(PfTask o) { return prio != o.prio ? (prio < o.prio ? -1 : 1) : (seq < o.seq ? -1 : seq > o.seq ? 1 : 0); }
    }
    private final java.util.concurrent.PriorityBlockingQueue<PfTask> pfQueue = new java.util.concurrent.PriorityBlockingQueue<PfTask>();
    private final java.util.concurrent.atomic.AtomicLong pfSeq = new java.util.concurrent.atomic.AtomicLong();
    private final java.util.concurrent.atomic.AtomicInteger pfPending = new java.util.concurrent.atomic.AtomicInteger(), pfWorkers = new java.util.concurrent.atomic.AtomicInteger();
    private void pfAdd(int prio, PfJob job) { pfPending.incrementAndGet(); pfQueue.add(new PfTask(prio, pfSeq.incrementAndGet(), job)); pfKick(); }
    private void pfGap() { try { Thread.sleep(100 + rng.nextInt(200)); } catch (InterruptedException ignored) { } }
    private void pfKick() {
        while (true) {
            int w = pfWorkers.get();
            if (w >= 2 || pfQueue.isEmpty()) return;
            if (!pfWorkers.compareAndSet(w, w + 1)) continue;
            new Thread(new Runnable() { @Override public void run() {
                try {
                    android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);
                    PfTask t;
                    while ((t = pfQueue.poll()) != null) {
                        boolean net = false;
                        try { net = t.job.run(); } catch (Throwable ignored) { } finally { pfPending.decrementAndGet(); }
                        if (net) pfGap();
                    }
                } finally { pfWorkers.decrementAndGet(); if (!pfQueue.isEmpty()) pfKick(); }
            } }, "shell-pf").start();
        }
    }
    /** 캐시에 둔 지 얼마나 됐나(ms). 없으면 아주 큰 값. */
    private long cacheAge(String key) {
        if (!haveCached(key)) return Long.MAX_VALUE;
        long now = System.currentTimeMillis();
        ShellCore.Cond c = condOf(key);
        if (c != null && c.at > 0) return Math.max(0L, now - c.at);
        long m = diskMtime(key);
        return m > 0L ? Math.max(0L, now - m) : Long.MAX_VALUE / 2;
    }
    private boolean pfNeeds(String key) { return cacheAge(key) >= PF_SKIP_MS; }

    private final Object pfBusLock = new Object();
    /** (뒤 스레드) 버스 탭 미리 받기: 위치 → 정류장 → 도착정보 왕복을 돌려 화면을 캐시에 두고, 가까운 정류장의 앞 노선 목록도 이어서 받아 둔다. 위치가 있어야 한다. */
    private boolean pfBusRun(double[] ll, String theme) throws Exception {
        if (ll == null) return false;                                               // 위치 없이 받은 '위치 없음' 화면을 캐시에 넣지 않는다
        boolean done = false;
        synchronized (pfBusLock) {
            pfMap.modeOverride = "bus";
            try {
                String bk = ShellCore.mapKey(ShellCore.S_MAPB, "bus", store);
                if (ll != null) pfMap.setBusLoc(ll[0], ll[1]);
                for (int round = 0; round < 4; round++) {
                    NetPost.Res br = NetPost.post(ShellCore.BASE + "/screen/map", pfMap.bodyRequest(ShellCore.CAP, theme), 8000);
                    if (br.status != 200 || br.body == null) break;
                    pfMap.onScreen(br.body);
                    if (pfMap.busNeed.isEmpty()) { prefetchPut(bk, br.body, false); done = true; break; }
                    if (round == 3) break;
                    final List<String[]> need = new ArrayList<String[]>(pfMap.busNeed);
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
                    for (Thread t : ts) { try { t.join(10000); } catch (InterruptedException e) { /* 무시 */ } }
                    for (int i = 0; i < need.size(); i++) pfMap.addBusRes(need.get(i)[0], got[i] == null ? "" : got[i]);
                    pfMap.rememberNeed(need);                                               // 미리 받을 때 본 도착정보 주소도 기기에 남겨, 처음 열어도 엔진 왕복 없이 갱신한다
                    pfMap.busNeed.clear();
                }
            } finally { pfMap.modeOverride = null; }
            if (done) brPrefetch(pfMap);
        }
        return true;
    }
    private void prefetchTabs() {
        if (pfPending.get() > 0) return;                                  // 아직 도는 중
        prefetchAt = System.currentTimeMillis();
        store.put(ShellCore.K_DAY, RulesCore.day(prefetchAt));            // 설정 화면 열쇠에 오늘 날짜가 들어 있어 미리 정해 둔다(나중에 받을 때와 같은 열쇠)
        if (pfChat == null) pfChat = new ChatCore(store);
        if (pfMap == null) pfMap = new MapCore(store);
        if (pfMapB == null) pfMapB = new MapCore(store);
        final String cur = ShellCore.currentTab(store);
        final java.util.HashSet<String> live = new java.util.HashSet<String>();
        for (String sc : slots) live.add(sc);
        final String liveMode = ShellCore.mode(store), liveSel = chat.sel(), mapMode = map.mode(), theme = ShellCore.theme(store);
        final double[] ll = liveLL();
        final ArrayList<String> sec = new ArrayList<String>(chat.routeSec);
        final HomeCore.Loc d = home.loc[HomeCore.DEST];
        final String dName = d != null && d.ok() ? d.name : ""; final double dLa = d != null && d.ok() ? d.lat : 0, dLo = d != null && d.ok() ? d.lng : 0;
        final boolean hasRoute = home.hasRoute();

        // 0순위: 가볍고 상태 없는 화면들(탭 막대 · 칩 줄 · 설정 · 노선도 지하철 방식)은 /screen/batch 한 번으로
        final java.util.ArrayList<String[]> ents = new java.util.ArrayList<String[]>();       // {열쇠, 경로, GET|POST, 본문}
        for (String t : ShellCore.TABS) if (!t.equals(cur)) ents.add(new String[] { "tabs|" + t, "/screen/tabs", "POST", ShellCore.tabsBody(t) });
        for (String m : ShellCore.MODES) {
            if (m.equals("set") && live.contains(ShellCore.S_SETTINGS)) continue;
            if (live.contains(ShellCore.S_CCHIPS) && m.equals(liveMode)) continue;
            ents.add(new String[] { ShellCore.cchipsKey(m), "/screen/cchips", "POST", ShellCore.cchipsBody(m) });
        }
        if (!live.contains(ShellCore.S_SETTINGS)) ents.add(new String[] { ShellCore.settingsKey(store), ShellCore.settingsUrl(store).substring(ShellCore.BASE.length()), "GET", "" });
        pfAdd(0, new PfJob() { @Override public boolean run() throws Exception {
            pfMapB.modeOverride = "subway";
            if (!("map".equals(cur) && "subway".equals(mapMode))) {
                ents.add(new String[] { ShellCore.mapKey(ShellCore.S_MAPH, "subway", store), "/screen/map", "POST", pfMapB.headRequest(ShellCore.CAP, theme, "") });
                ents.add(new String[] { ShellCore.mapKey(ShellCore.S_MAPB, "subway", store), "/screen/map", "POST", pfMapB.bodyRequest(ShellCore.CAP, theme) });
            }
            if (!("map".equals(cur) && "bus".equals(mapMode))) { pfMapB.modeOverride = "bus"; ents.add(new String[] { ShellCore.mapKey(ShellCore.S_MAPH, "bus", store), "/screen/map", "POST", pfMapB.headRequest(ShellCore.CAP, theme, "") }); }
            pfMapB.modeOverride = null;
            return pfBatch(ents);
        } });
        if (!"home".equals(cur) && !hasRoute) pfAdd(0, new PfJob() { @Override public boolean run() throws Exception {                 // 홈
            if (!pfNeeds(ShellCore.S_HOME)) return false;
            String body = onMainWait(new java.util.concurrent.Callable<String>() { @Override public String call() { return home.request(homeEnv(), ShellCore.CAP); } });
            if (body == null || body.length() == 0) return false;
            NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/home", body, 8000);
            String txt = r.status == 200 && r.body != null ? r.body : "";
            String hc0 = hcJson;
            if (txt.length() > 0 && hc0 != null && hc0.length() > 0) txt = ShellCore.mergeBodies(txt, hc0);
            prefetchPut(ShellCore.S_HOME, txt, true);
            return true;
        } });
        if (!live.contains(ShellCore.S_BOARD)) pfAdd(1, new PfJob() { @Override public boolean run() throws Exception {              // 게시판
            if (!pfNeeds(ShellCore.S_BOARD)) return false;
            String bb = boardBody(true);
            final String txt = screenCall(ShellCore.S_BOARD, false, ShellCore.BASE + "/screen/board", bb, null, 10000);
            if (txt.length() > 0 && !isNotMod(txt)) main.post(new Runnable() { @Override public void run() { board.onScreen(txt); } });
            return true;
        } });
        pfAdd(1, new PfJob() { @Override public boolean run() throws Exception { return prefetchNews(live.contains(ShellCore.S_NEWS)); } });    // 소식(모든 분류)
        pfAdd(1, new PfJob() { @Override public boolean run() throws Exception { return rloadFetch(); } });                                    // 경로 탐색 로딩 카드(글 · 모양은 엔진 — 한 번 받아 두면 앱을 끌 때까지 쓴다)
        pfAdd(1, new PfJob() { @Override public boolean run() throws Exception { boolean n = dlgFetch("exit"); n |= dlgFetch("report"); n |= dlgFetch("perm"); return n; } });      // 종료 · 신고 · 권한 안내 카드(글 · 단추 · 모양은 엔진)
        pfAdd(1, new PfJob() { @Override public boolean run() throws Exception {                // 노선도 버스(위치 → 정류장 → 도착정보 왕복이라 묶지 못한다)
            if (("map".equals(cur) && "bus".equals(mapMode)) || !pfNeeds(ShellCore.mapKey(ShellCore.S_MAPB, "bus", store))) return false;
            return pfBusRun(ll, theme);
        } });
        pfAdd(2, new PfJob() { @Override public boolean run() throws Exception {                // 대화방 전부(고스트 상태기) — 엔진이 칩으로 준 순서대로
            String me = ShellCore.commId(store);
            int tzo = -java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000;
            pfChat.routeSec = new ArrayList<String>(sec);
            ArrayList<String> sels = new ArrayList<String>(); sels.add("all");
            boolean net = false;
            for (int i = 0; i < sels.size() && i < 24; i++) {
                String sel = sels.get(i), key = ShellCore.S_CHAT + "|" + sel;
                boolean isLive = live.contains(ShellCore.S_CHAT) && sel.equals(liveSel);
                if (i > 0 && (isLive || !pfNeeds(key))) continue;
                if (System.currentTimeMillis() - pfChat.noticesAt > 60000) {
                    NetPost.Res nr = NetPost.get(ChatCore.noticesUrl(), 8000);
                    if (nr.status == 200) pfChat.setNotices(nr.body, System.currentTimeMillis());
                }
                if ("all".equals(sel)) { NetPost.Res tr = NetPost.get(pfChat.talksUrlNow(), 7000); if (tr.status == 200) pfChat.addTalks(tr.body, me); }
                else { NetPost.Res rr = NetPost.get(pfChat.roomUrl(sel), 12000); if (rr.status == 200) pfChat.addRoom(sel, rr.body); }
                String body = pfChat.requestFor(sel, false, ShellCore.CAP, theme, tzo, me, System.currentTimeMillis());
                String txt = screenCall(key, false, ShellCore.BASE + "/screen/chat", body, null, 10000);
                net = true;
                if (i == 0) {
                    String src = txt.length() > 0 && !isNotMod(txt) ? txt : null;
                    if (src == null) { NetPost.Res r0 = NetPost.post(ShellCore.BASE + "/screen/chat", body, 10000); src = r0.status == 200 ? r0.body : ""; }
                    for (String c : ShellCore.catValues(src)) if (!sels.contains(c)) sels.add(c);
                }
                pfGap();
            }
            return net;
        } });
        if (!"food".equals(cur)) pfAdd(3, new PfJob() { @Override public boolean run() throws Exception {                // 맛집: 도착지 또는 마지막 위치(고스트 상태기)
            if (!pfNeeds(ShellCore.S_FOOD)) return false;
            pfFood.setDest(dName, dLa, dLo);
            if (pfFood.needGps()) { if (ll != null) pfFood.setGps(ll[0], ll[1]); else return false; }
            NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/food", pfFood.request(ShellCore.CAP, true), 12000);
            if (r.status != 200 || r.body == null) return true;
            pfFood.onScreen(r.body);
            if (pfFood.needData()) {
                String su = pfFood.serverUrl();
                String[] pu = new String[FoodCore.PUB_PAGES];
                for (int i = 0; i < pu.length; i++) pu[i] = pfFood.publicUrl(i + 1);
                pfFood.setData(foodDataNow(su, pu));
                NetPost.Res r2 = NetPost.post(ShellCore.BASE + "/screen/food", pfFood.request(ShellCore.CAP, true), 20000);
                if (r2.status == 200 && r2.body != null) { pfFood.onScreen(r2.body); prefetchPut(ShellCore.S_FOOD, r2.body, false); }
            } else prefetchPut(ShellCore.S_FOOD, r.body, false);
            return true;
        } });
        pfAdd(3, new PfJob() { @Override public boolean run() throws Exception {                // 쇼핑: 지금 분류 → 나머지 분류(서버가 느려서 차례로 · 연달아 두 번 못 받으면 멈춘다)
            String key = ShellCore.cacheKey(ShellCore.S_SHOP, store);
            boolean net = false;
            String base = pfNeeds(key) ? shopCall(key, store.get(ShellCore.K_SHOP_CAT, "")) : "";
            if (base.length() > 0) net = true;
            String src = base.length() > 0 && !isNotMod(base) ? base : onMainWait(new java.util.concurrent.Callable<String>() { @Override public String call() { return cacheGet(ShellCore.cacheKey(ShellCore.S_SHOP, store), true); } });
            if (src == null || src.length() == 0) return net;
            int fails = 0;
            for (String c : ShellCore.catValues(src)) {
                String ck = "shop|" + c;
                if (ck.equals(key) || !pfNeeds(ck)) continue;
                pfGap();
                String cr = shopCall(ck, c);
                net = true;
                if (cr.length() > 0) fails = 0; else if (++fails >= 2) break;
            }
            return net;
        } });
    }
    /** 묶음 요청: 여러 화면을 /screen/batch 한 번에 받는다. 신선하거나 최근에 받아 둔 것은 빼고, 앱이 가진 ETag 를 실어 같으면 항목만 304 를 받는다. 묶음이 안 되는 워커(옛 버전)면 하나씩. */
    @SuppressWarnings("unchecked")
    private boolean pfBatch(java.util.List<String[]> ents) {
        final long now = System.currentTimeMillis();
        final java.util.ArrayList<String[]> todo = new java.util.ArrayList<String[]>();
        for (String[] e : ents) {
            String key = e[0];
            if (!pfNeeds(key)) continue;
            ShellCore.Cond c = condOf(key);
            if (c != null && haveCached(key) && c.fresh(now, ("GET".equals(e[2]) ? e[1] : e[3]).hashCode())) continue;
            todo.add(e);
        }
        if (todo.isEmpty()) return false;
        StringBuilder b = new StringBuilder("{\"r\":[");
        for (int i = 0; i < todo.size(); i++) {
            String[] e = todo.get(i);
            ShellCore.Cond c = condOf(e[0]);
            if (i > 0) b.append(',');
            b.append("{\"k\":").append(ShellCore.q(e[0])).append(",\"u\":").append(ShellCore.q(e[1])).append(",\"m\":").append(ShellCore.q(e[2]));
            if ("POST".equals(e[2])) b.append(",\"b\":").append(ShellCore.q(e[3]));
            if (c != null && c.etag.length() > 0 && haveCached(e[0])) b.append(",\"t\":").append(ShellCore.q(c.etag));
            b.append('}');
        }
        b.append("]}");
        NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/batch", b.toString(), 15000);
        Object parsed = null;
        try { if (r.status == 200 && r.body != null) parsed = ScreenCore.parse(r.body); } catch (Exception ignored) { }
        if (!(parsed instanceof java.util.Map) || !(((java.util.Map<String, Object>) parsed).get("res") instanceof java.util.Map)) {
            for (final String[] e : todo) pfAdd(1, new PfJob() { @Override public boolean run() throws Exception {      // 옛 워커: 하나씩(큐가 간격을 둔다)
                screenCall(e[0], "GET".equals(e[2]), ShellCore.BASE + e[1], e[3], null, 10000);
                return true;
            } });
            return true;
        }
        java.util.Map<String, Object> res = (java.util.Map<String, Object>) ((java.util.Map<String, Object>) parsed).get("res");
        for (String[] e : todo) {
            Object o = res.get(e[0]);
            if (!(o instanceof java.util.Map)) continue;
            java.util.Map<String, Object> m = (java.util.Map<String, Object>) o;
            int st = m.get("s") instanceof Double ? (int) ((Double) m.get("s")).doubleValue() : 0;
            String et = m.get("e") instanceof String ? (String) m.get("e") : "";
            int ma = m.get("m") instanceof Double ? (int) ((Double) m.get("m")).doubleValue() : 0;
            final int sg = ("GET".equals(e[2]) ? e[1] : e[3]).hashCode();
            if (st == 200 && m.get("b") instanceof String) { warm((String) m.get("b")); screenStore(e[0], (String) m.get("b"), et, ma, sg); }
            else if (st == 304) {
                final String ck = e[0]; final ShellCore.Cond c = condOf(ck); final int fma = ma;
                if (c != null) main.post(new Runnable() { @Override public void run() { store.put(ShellCore.condKey(ck), c.touched(System.currentTimeMillis(), fma, sg).enc()); } });
            }
        }
        return true;
    }
    /** 소식: 엔진이 모든 분류의 화면을 한 번에 계산해 주므로(alts) 한 번 받아 분류마다 캐시에 둔다. live 면 지금 분류 화면은 건드리지 않는다(눌림이 목록과 묶여 있어서). */
    @SuppressWarnings("unchecked")
    private boolean prefetchNews(boolean live) {
        String curKey = ShellCore.cacheKey(ShellCore.S_NEWS, store);
        ShellCore.Cond nc = condOf("newsalts");
        long nowMs = System.currentTimeMillis();
        if (nc != null && nowMs - nc.at < PF_SKIP_MS && haveCached(curKey)) return false;
        String[] feeds = feedsAll(ShellCore.feedUrls(ShellCore.S_NEWS), 8000);
        ShellCore.NewsRows rows = ShellCore.NewsRows.from(feeds);
        String body = ShellCore.newsBody(store, rows, true);
        final int sg = body.hashCode();
        if (nc != null && nc.sig == sg && haveCached(curKey) && nowMs - nc.at < 60000L) return false;            // 같은 기사 목록이고 엔진이 말한 신선 시간(1분) 안
        NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/news", body, 15000);
        if (r.status != 200 || r.body == null) return true;
        try {
            Object o = ScreenCore.parse(r.body);
            if (!(o instanceof java.util.Map)) return true;
            java.util.Map<String, Object> m = (java.util.Map<String, Object>) o;
            Object alts = m.remove("alts");
            if (!live) { lastNews = rows; prefetchPut(curKey, HomeSearchCore.toJson(m), false); }
            if (alts instanceof java.util.Map) for (java.util.Map.Entry<String, Object> e : ((java.util.Map<String, Object>) alts).entrySet()) {
                String k = ShellCore.S_NEWS + "|" + e.getKey();
                if (!k.equals(curKey)) prefetchPut(k, HomeSearchCore.toJson(e.getValue()), false);
            }
            main.post(new Runnable() { @Override public void run() { store.put(ShellCore.condKey("newsalts"), new ShellCore.Cond("alts", System.currentTimeMillis(), 60, sg).enc()); } });
        } catch (Throwable ignored) { }
        return true;
    }
    /** 주 스레드에서 한 번 돌리고 결과를 기다린다(3초 안에 못 받으면 null). */
    private <T> T onMainWait(java.util.concurrent.Callable<T> c) {
        java.util.concurrent.FutureTask<T> f = new java.util.concurrent.FutureTask<T>(c);
        main.post(f);
        try { return f.get(3, java.util.concurrent.TimeUnit.SECONDS); } catch (Throwable e) { return null; }
    }
    /** 미리 받은 글을 검증해 캐시에 넣는다(엔진이 다른 화면을 돌려줬거나 못 읽으면 버린다). restore: 같은 상태기가 만든 글이면 눌림 상태도 함께 되살린다. */
    private void prefetchPut(final String key, final String txt, final boolean restore) {
        if (txt == null || txt.length() < 3) return;
        try { if (!ShellCore.expectId(key).equals(parsedGet(txt).id)) return; } catch (Throwable e) { return; }
        main.post(new Runnable() { @Override public void run() {
            cachePut(key, txt);
            store.put(ShellCore.condKey(key), "");                          // 이 글은 ETag 없이 들어왔다 — 옛 ETag 와 짝이 어긋나지 않게 비운다
            if (restore) { if (ShellCore.S_BOARD.equals(ShellCore.expectId(key))) board.onScreen(txt); else restoreState(key, txt); }
        } });
    }
    private void cachePutAsync(final String key, final String json) {
        main.post(new Runnable() { @Override public void run() { cachePut(key, json); } });
    }

    /** 받은 글을 검증해 올린다. 못 읽으면 지금 화면을 그대로 두고 알린다. */
    private void present(ScreenView v, String json, boolean keep) {
        if (isNotMod(json)) {                                           // 엔진이 "같다" — 캐시 화면이 이미 맞는 글이다. 안 떠 있으면 그것을 올린다.
            String ck = viewKey.get(v), c = ck == null ? null : cacheGet(ck, true);
            if (c != null && !c.equals(shownJson.get(v))) showCached(v, c);
            return;
        }
        int[] rh = ShellCore.retryHint(json);
        if (rh != null && v != sheetView && viewKey.get(v) != null) { showDelayed(v, json, keep, rh); return; }
        if (json == null || json.length() == 0) {
            String ck = viewKey.get(v);
            if (ck != null && v != sheetView && (v.itemCount() == 0 || skelViews.contains(v))) {          // 빈 칸이면 안내와 [다시 시도] — 뒤에서 몇 번 더 받아 본다
                try { String dg = netDiag.get(ck); v.setScreen(ScreenCore.load(ShellCore.errorScreen(dg)), false); shownJson.remove(v); skelViews.remove(v); fadeIn(v); scheduleRetry(v, ShellCore.DEFAULT_RETRY); return; } catch (Throwable ignored) { }
            }
            if (keep && v.itemCount() > 0) return;                // 뒤에서 조용히 새로 받던 중 실패 — 떠 있는 옛 화면을 그대로 둔다(SWR: 알림도 띄우지 않는다)
            toast("화면을 받지 못했어요"); return;
        }
        retryN.remove(v);
        try {
            String ck = viewKey.get(v);
            if (keep && v != sheetView && json.equals(shownJson.get(v))) return;      // 이미 이 글을 보여 주는 중 — 다시 읽고 배치하고 그릴 까닭이 없다
            ScreenCore.Screen sc = parsedGet(json);
            if (ck != null && v != sheetView && !ShellCore.expectId(ck).equals(sc.id)) return;     // 다른 탭 화면의 늦은 답
            v.setScreen(sc, keep && !skelViews.contains(v));
            skelViews.remove(v);
            if (v != sheetView) shownJson.put(v, json);
            if (ck != null && v != sheetView && !partialScreen(ck)) cachePut(ck, json);
            if (!keep && v != sheetView) fadeIn(v);
        } catch (Throwable e) {
            toast("화면이 올바르지 않아요: " + String.valueOf(e.getMessage()));
        }
    }

    // ── 서버 지연 안내 + 뒤에서 다시 받기: 안내 문구 · 간격은 엔진이 준다. 이미 보이는 내용(캐시)이 있으면 그것을 두고 조용히 다시 받는다 ──
    private final java.util.HashMap<ScreenView, Integer> retryN = new java.util.HashMap<ScreenView, Integer>();
    private final java.util.HashMap<ScreenView, Object> retryTok = new java.util.HashMap<ScreenView, Object>();
    private void showDelayed(ScreenView v, String json, boolean keep, int[] delays) {
        boolean hasContent = keep && v.itemCount() > 0 && !skelViews.contains(v) && shownJson.get(v) != null;
        if (!hasContent) {
            try { v.setScreen(parsedGet(json), false); shownJson.remove(v); skelViews.remove(v); fadeIn(v); }
            catch (Throwable e) { try { v.setScreen(ScreenCore.load(ShellCore.errorScreen()), false); shownJson.remove(v); skelViews.remove(v); } catch (Throwable ignored) { } }
        }
        scheduleRetry(v, delays);
    }
    private void scheduleRetry(final ScreenView v, final int[] delays) {
        Integer cur = retryN.get(v);
        final int n = cur == null ? 0 : cur;
        if (n >= delays.length) return;                                        // 정해진 횟수만큼 시도했다 — 이제는 [다시 시도] 단추로
        final String ck = viewKey.get(v);
        final Object tok = new Object();
        retryTok.put(v, tok);
        main.postDelayed(new Runnable() { @Override public void run() {
            if (retryTok.get(v) != tok || ck == null || !ck.equals(viewKey.get(v)) || !resumed) return;       // 다른 탭으로 갔거나 앱이 가려졌으면 하지 않는다
            retryN.put(v, n + 1);
            int i = v == body ? slots.length - 1 : 0;
            loadSlotX(i, true, false);
        } }, delays[n] * 1000L);
    }
    /** 아직 다 안 채워진 중간 화면(버스 도착정보를 더 받아야 하는 노선도 · 원자료를 기다리는 맛집)은 캐시에 두지 않는다 — 다음에 켰을 때 "받는 중" 화면이 먼저 뜨지 않게. */
    private boolean partialScreen(String ck) {
        String id = ShellCore.expectId(ck);
        if ("map".equals(id) && ck.startsWith(ShellCore.S_MAPB)) return !map.busNeed.isEmpty();
        if (ShellCore.S_FOOD.equals(id)) return food.needData();
        return false;
    }
    /** 웹 slideUp 과 같은 움직임: 시트가 아래에서 올라온다(220ms, 감속). 뷰 속성만 쓴다. */
    private void slideIn(View v) {
        if (v == null) return;
        try {
            v.setAlpha(0f); v.setTranslationY(56f * dpr);
            v.animate().alpha(1f).translationY(0f).setDuration(340L).setInterpolator(new android.view.animation.PathInterpolator(0.32f, 0.72f, 0f, 1f)).start();        // 아이폰 시트와 같은 곡선(빠르게 시작해 부드럽게 멈춘다)
        } catch (Throwable ignored) { v.setAlpha(1f); v.setTranslationY(0f); }
    }
    /** 새 화면(탭 이동 등)이 올라올 때 살짝 떠오른다(웹 busCardIn 류, 140ms). 갱신(keep)에는 쓰지 않는다. */
    private void fadeIn(View v) {
        try { v.setAlpha(0.35f); v.animate().alpha(1f).setDuration(240L).setInterpolator(new android.view.animation.DecelerateInterpolator(1.4f)).start(); } catch (Throwable ignored) { v.setAlpha(1f); }
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
            if (which == 3) return "hdr";
            if (which == 2) return "tabs";
            if (slots.length > 1) return slots[which == 0 ? 0 : 1];
            return slots.length > 0 ? slots[0] : "";
        }
        @Override public void onAction(ScreenCore.Act a) { handle(a, false); }
        @Override public void onSet(ScreenCore.Act a, boolean on) { handle(a, on); }
        @Override public void onSearch(ScreenCore.Act a, String q) { apply(ShellCore.routeSearch(a.tpl, a.empty, q)); }
        @Override public void onInputFocus(boolean on) { if (on) applyIme(); }
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
            if (which == 3) return;
            if (which == 2 && !deb.gate("tab:" + a.a + ":" + a.v, Debounce.TAP_MS)) return;          // 같은 탭 버튼 연타는 한 번으로
            if ("call".equals(a.a) && ShellCore.RETRY_ACT.equals(a.v)) { if (deb.gate("retry", 600L)) showTab(ShellCore.currentTab(store)); return; }
            ShellCore.Effect e;
            if (which == 2) e = ShellCore.routeTabs(store, a.a, a.v);
            else if (ShellCore.S_CHAT.equals(screenName())) {
                chatAct(a, body);
                return;
            } else if (ShellCore.S_BOARD.equals(screenName())) {
                boardAct(a, which == 0 ? head : body);
                return;
            } else if (ShellCore.S_NEWS.equals(screenName()) && "call".equals(a.a) && a.v.startsWith("nw.") && (a.id.length() > 0)) {
                openNewsById(a.id, a.t, a.ix);                       // 목록이 바뀐 뒤에 눌러도 같은 기사 — 순번이 아니라 기사의 고유 id 로
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
            case ShellCore.E_REFRESH: applyTheme(); refreshLast(); break;
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
                final String body = chatBody(fetch, sel, me);
                final String txt = screenCall(ShellCore.S_CHAT + "|" + sel, false, ShellCore.BASE + "/screen/chat", body, null, 10000); warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqChat) return;
                    present(v, txt, keep);
                    if (txt.length() > 0 && !isNotMod(txt)) chat.onScreen(txt);
                } });
            }
        }, "shell-chat").start();
    }
    /** (스레드 안) 대화방 원자료를 받아 상태에 넣고 엔진에 보낼 본문을 만든다. 공지와 대화를 함께 받는다. */
    private String chatBody(boolean fetch, String sel, String me) {
        if (fetch) {
            Thread nt = null;
            if (System.currentTimeMillis() - chat.noticesAt > 60000) {
                nt = new Thread(new Runnable() { @Override public void run() {
                    NetPost.Res nr = NetPost.get(ChatCore.noticesUrl(), 8000);
                    if (nr.status == 200) chat.setNotices(nr.body, System.currentTimeMillis());
                } }, "shell-chat-notice");
                nt.start();
            }
            if ("all".equals(sel)) {
                NetPost.Res tr = NetPost.get(chat.talksUrlNow(), 7000);
                if (tr.status == 200) chat.addTalks(tr.body, me); else chat.failed = !chat.loaded;
            } else {
                NetPost.Res rr = NetPost.get(chat.roomUrl(sel), 12000);
                if (rr.status == 200) chat.addRoom(sel, rr.body); else chat.failed = !chat.loaded;
            }
            if (nt != null) { try { nt.join(9000); } catch (InterruptedException ignored) { } }
        }
        return chat.request(ShellCore.CAP, ShellCore.theme(store), -java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000, me, System.currentTimeMillis());
    }
    private void reloadChat() { if (ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadChat(body, true, false); }

    private void chatAct(ScreenCore.Act a, final ScreenView src) {
        if ("cat".equals(a.a)) { chat.select(a.v); boolean shown = keyedShow(body, ShellCore.S_CHAT); loadChat(body, shown, true); return; }
        if (!"call".equals(a.a)) return;
        final String me = ShellCore.commId(store);
        int r = chat.act(a.v, a.id, src.fields(), me);
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
                final Runnable doReport = new Runnable() { @Override public void run() {
                    chat.hide(id); toast("신고했어요. 이 글은 더 이상 보이지 않아요"); reloadChat();
                    final String json = ChatCore.reportBody(id);
                    new Thread(new Runnable() { @Override public void run() { NetPost.post(ShellCore.BOARD_BASE + "/lreport", json, 9000); } }, "shell-lrep").start();
                } };
                if (dlgKind("report", doReport, null)) break;                               // 엔진 카드(취소 / 신고)
                try {
                    new AlertDialog.Builder(this, android.R.style.Theme_Material_Light_Dialog_Alert).setTitle("이 글을 신고할까요?").setMessage("신고가 여러 명 모이면 자동으로 숨겨져요.")
                        .setNegativeButton("취소", null).setPositiveButton("신고", new android.content.DialogInterface.OnClickListener() {
                            @Override public void onClick(android.content.DialogInterface di, int w) { doReport.run(); }
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
                final String body = boardBody(fetch);
                final String txt = screenCall(ShellCore.S_BOARD, false, ShellCore.BASE + "/screen/board", body, null, 10000); warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqBoard) return;
                    present(v, txt, keep);
                    if (txt.length() > 0 && !isNotMod(txt)) board.onScreen(txt);
                } });
            }
        }, "shell-board").start();
    }
    /** (스레드 안) 글 목록 원자료를 받아 상태에 넣고 엔진에 보낼 본문을 만든다. */
    private String boardBody(boolean fetch) {
        if (fetch) {
            NetPost.Res pr = NetPost.get(BoardCore.postsUrl(), 8000);
            final boolean got = pr.status == 200 && board.setPosts(pr.body);
            if (!got && board.loading) board.loading = false;
        }
        return board.request(ShellCore.CAP, System.currentTimeMillis());
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
        int r = board.act(a.v, a.id, a.key, src.fields(), now);
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
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
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
        if (food.needGps() && !food.noperm) {                                   // 위치를 기다리지 않고 마지막 위치로 먼저 그린다
            double[] seed = liveLL();
            if (seed != null) {
                food.setGps(seed[0], seed[1]);
                locateQuiet(new LocCb() {
                    @Override public void fix(Location l) { if (farFrom(food.gps, l)) { food.setGps(l.getLatitude(), l.getLongitude()); reloadFood(); } }
                    @Override public void fail(boolean noperm) { }
                });
            }
        }
        if (food.needGps() && !food.noperm && !food.locating) locateForFood();
        final boolean wasLoaded = food.loaded;
        final String json = food.request(ShellCore.CAP, true);
        if (food.ctr != null && food.needData()) fetchFoodData(my, v);          // 중심을 이미 알면(지난번 화면) 엔진 첫 왕복을 기다리지 않고 원자료를 곧장 받는다(두 통신이 동시에 간다)
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/food", json, 12000);
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
                final FoodCore.Parsed fpar = txt.length() > 0 ? FoodCore.parseScreen(txt) : null;          // 큰 화면 읽기는 통신 스레드에서
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqFood || txt.length() == 0) { if (txt.length() == 0 && my == seqFood && !(keep && v.itemCount() > 0)) toast("맛집 화면을 받지 못했어요"); return; }
                    if (!wasLoaded && food.loaded && foodFetching == my && foodSu.equals(food.ctr == null ? "" : food.serverUrl())) return;      // 원자료가 먼저 와서 완성 화면이 이미 올라갔다(이 답은 "받는 중" 화면이다) — 덮지 않는다
                    food.apply(fpar);
                    if (!(keep && food.needData())) foodPresent(v, txt, keep);          // 캐시 화면이 떠 있으면 "받는 중" 중간 화면으로 덮지 않는다(깜빡임)
                    if (food.needData() && (foodFetching != my || !foodSu.equals(food.ctr == null ? "" : food.serverUrl()))) fetchFoodData(my, v);
                } });
            }
        }, "shell-food").start();
    }
    private int foodFetching = -1, foodStageSeq; private String foodSu = "";
    /** 서버 맛집 + 공공데이터(최대 3쪽)를 받아 FoodCore 에 넣고 엔진에 다시 묻는다. */
    /** (스레드 안) 맛집 원자료 — 서버 가게와 공공데이터 쪽을 받아 읽는다. */
    private FoodCore.Data foodDataNow(final String su, final String[] pu) {
        // 서버 가게와 공공데이터 쪽을 동시에 받는다(차례로 받으면 느린 공공 서버 3쪽이 30초까지 늘어진다) — 늦게 온 쪽 때문에 먼저 온 쪽이 기다리지 않는다.
        final NetPost.Res[] res = new NetPost.Res[1 + pu.length];
        Thread[] th = new Thread[res.length];
        for (int i = 0; i < res.length; i++) {
            final int ii = i;
            th[i] = new Thread(new Runnable() { @Override public void run() { res[ii] = ii == 0 ? NetPost.get(su, 8000) : NetPost.get(pu[ii - 1], 10000); } }, "shell-foodpart");
            th[i].start();
        }
        for (Thread t : th) { try { t.join(13000L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; } }
        List<String> pubs = new ArrayList<String>();
        for (int i = 1; i < res.length; i++) {
            NetPost.Res pr = res[i];
            String t = pr != null && pr.status == 200 ? pr.body : "";
            pubs.add(t);
            if (FoodCore.pageCount(t) < FoodCore.PUB_PAGE_SIZE) break;
        }
        return FoodCore.parseData(res[0] != null && res[0].status == 200 ? res[0].body : "", pubs);
    }
    /** 맛집 원자료: 서버 가게가 먼저 오면 그것으로 곧바로 한 번 그리고(대개 1초 안), 느린 공공데이터 쪽이 오면 그것까지 합쳐 다시 그린다 — 가장 느린 통신을 기다리지 않는다. */
    private void fetchFoodData(final int my, final ScreenView v) {
        if (food.ctr == null) return;
        foodFetching = my;
        final String su = food.serverUrl();
        foodSu = su;
        final String[] pu = new String[FoodCore.PUB_PAGES];
        for (int i = 0; i < pu.length; i++) pu[i] = food.publicUrl(i + 1);
        new Thread(new Runnable() {
            @Override public void run() {
                final NetPost.Res[] res = new NetPost.Res[1 + pu.length];
                Thread[] th = new Thread[res.length];
                for (int i = 0; i < res.length; i++) {
                    final int ii = i;
                    th[i] = new Thread(new Runnable() { @Override public void run() { res[ii] = ii == 0 ? NetPost.get(su, 8000) : NetPost.get(pu[ii - 1], 10000); } }, "shell-foodpart");
                    th[i].start();
                }
                long t0 = System.currentTimeMillis();
                try { th[0].join(9000L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                boolean allDone = true;
                for (int i = 1; i < th.length; i++) if (th[i].isAlive()) allDone = false;
                if (!allDone && res[0] != null && res[0].status == 200 && res[0].body != null) foodStage(my, v, su, FoodCore.parseData(res[0].body, new ArrayList<String>()));      // 1단계: 서버 가게만으로 먼저
                for (int i = 1; i < th.length; i++) { try { th[i].join(Math.max(1L, 13000L - (System.currentTimeMillis() - t0))); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; } }
                List<String> pubs = new ArrayList<String>();
                for (int i = 1; i < res.length; i++) {
                    NetPost.Res pr = res[i];
                    String t = pr != null && pr.status == 200 ? pr.body : "";
                    pubs.add(t);
                    if (FoodCore.pageCount(t) < FoodCore.PUB_PAGE_SIZE) break;
                }
                foodStage(my, v, su, FoodCore.parseData(res[0] != null && res[0].status == 200 && res[0].body != null ? res[0].body : "", pubs));      // 2단계: 공공데이터까지 합쳐
            }
        }, "shell-fooddata").start();
    }
    /** 받은 원자료를 상태기에 넣고 엔진에 다시 물어 화면을 올린다(통신 스레드에서 부른다). 더 새 요청이 시작됐거나 중심이 달라졌으면 버린다. */
    private void foodStage(final int my, final ScreenView v, final String su, final FoodCore.Data data) {
        main.post(new Runnable() { @Override public void run() {
            if (my != seqFood || food.ctr == null || !su.equals(food.serverUrl())) return;
            food.setData(data);
            final int st = ++foodStageSeq;
            final String json = food.request(ShellCore.CAP, true);
            new Thread(new Runnable() {
                @Override public void run() {
                    NetPost.Res r2 = NetPost.post(ShellCore.BASE + "/screen/food", json, 20000);
                    final String txt2 = r2.status == 200 ? r2.body : ""; warm(txt2);
                    final FoodCore.Parsed fpar2 = txt2.length() > 0 ? FoodCore.parseScreen(txt2) : null;
                    main.post(new Runnable() { @Override public void run() {
                        if (my != seqFood || st != foodStageSeq) return;
                        if (txt2.length() == 0) { toast("맛집 화면을 받지 못했어요"); return; }
                        food.apply(fpar2); foodPresent(v, txt2, true);
                    } });
                }
            }, "shell-food2").start();
        } });
    }
    private void reloadFood() { if (ShellCore.S_FOOD.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadFood(body, true, false); }

    private void foodAct(ScreenCore.Act a) {
        if ("refresh".equals(a.a)) { loadFood(body, true, true); return; }
        if ("cat".equals(a.a)) {
            if (food.pickChip(a.v)) foodPresent(body, food.altOf(food.flt), false); else loadFood(body, false, false);
            return;
        }
        if (!"call".equals(a.a)) return;
        switch (food.act(a.v)) {
            case FoodCore.R_PANEL: foodPanelRound(); break;
            case FoodCore.R_UNPANEL: case FoodCore.R_CLOSE: food.closePanel(); foodRedraw(); break;
            case FoodCore.R_LINK: {
                String[] ln = food.sheetLink(a.v);
                if (ln != null && "fm.ki".equals(a.v)) openKakaoPlace(ln); else if (ln != null) openExternal(ln[0], ln[1]);
                break;
            }
            default: break;
        }
    }
    /** 목록 화면 글을 보이되, 가게 지도가 펼쳐져 있으면 엔진이 만든 펼침을 그 카드 뒤에 끼운다(캐시에는 펼침 없는 글만 남는다). */
    private String foodBase = "";
    private int seqFoodP; private Runnable foodAfter;          // 끼운 글이 올라온 직후 한 번 할 일(펼침이 보이게 스크롤)
    private void foodPresent(final ScreenView v, final String txt, final boolean keep) {
        if (txt == null || txt.length() == 0) { present(v, txt, keep); return; }
        if (!isNotMod(txt)) foodBase = txt;
        if (food.openKey.length() == 0 || isNotMod(txt)) { present(v, txt, keep); return; }
        final int my = ++seqFoodP;
        final String base = foodBase;
        ioExec.execute(new Runnable() { @Override public void run() {                       // 목록 화면에 펼침을 끼우는 읽기·글 만들기는 주 스레드 밖에서
            final String withP = food.withPanel(base);
            ScreenCore.Screen pre = null;
            if (!withP.equals(base)) { try { pre = parsedGet(withP); } catch (Throwable e) { pre = null; } }        // 읽기까지 여기서
            final ScreenCore.Screen scr = pre;
            main.post(new Runnable() { @Override public void run() {
                if (my != seqFoodP) return;
                if (scr != null) { v.setScreen(scr, keep); shownJson.put(v, withP); Runnable fa = foodAfter; foodAfter = null; if (fa != null) fa.run(); return; }
                present(v, txt, keep);
            } });
        } });
    }
    private void foodRedraw() { if (foodBase.length() > 0) foodPresent(body, foodBase, true); }
    private int seqPanel;
    /** 가게 지도 펼침: 엔진에 펼침을 묻고(작은 요청 — 목록 원자료는 보내지 않는다) 끼운다. 경로 주소를 더 받아 오라고 하면 받아 와서 다시 묻는다(끝은 엔진이 정한다). */
    private void foodPanelRound() {
        final int my = ++seqPanel;
        final String key = food.openKey, json = food.panelRequest(ShellCore.CAP);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/food", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqPanel || !key.equals(food.openKey)) return;
                    final boolean first = food.panelNodes == null;
                    if (!food.onPanel(txt)) { if (food.panelNodes == null) { food.closePanel(); toast("가게 지도를 열지 못했어요"); } return; }
                    if (first) foodAfter = new Runnable() { @Override public void run() { body.revealBelow("fm." + key); } };
                    foodRedraw();
                    final java.util.List<String[]> need = new java.util.ArrayList<String[]>(food.panelNeed);
                    if (need.isEmpty()) return;
                    for (final String[] nd : need) {
                        new Thread(new Runnable() { @Override public void run() {
                            NetPost.Res nr = NetPost.get(nd[1], 9000);
                            final String got = nr.status == 200 ? nr.body : "";
                            main.post(new Runnable() { @Override public void run() {
                                if (my != seqPanel || !key.equals(food.openKey)) return;
                                food.panelGot(nd[0], got);
                                foodPanelRound();
                            } });
                        } }, "shell-footroute").start();
                    }
                } });
            }
        }, "shell-foodpanel").start();
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
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
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
    private boolean hasLocPerm() { return checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED; }
    private void saveLoc(Location l) { if (l != null) { ShellCore.lastLocPut(store, l.getLatitude(), l.getLongitude(), System.currentTimeMillis()); warmBus(l.getLatitude(), l.getLongitude()); } }
    /** 위치를 잡는 순간 뒤에서 '주변 정류장' 화면을 미리 받아 둔다 — 버스 탭에 들어가면 뼈대만 오래 보이지 않고 곧바로 정류장이 내려앉는다(요청이 같을 때만 쓴다). */
    private volatile String warmBusJson = "", warmBusTxt = ""; private volatile long warmBusAt; private double[] warmBusLL;
    private void warmBus(final double la, final double lo) {
        try {
            if (!"bus".equals(map.mode()) || !MapCore.VW_NEAR.equals(map.busView()) || "map".equals(ShellCore.currentTab(store))) return;
            long now = System.currentTimeMillis();
            if (warmBusLL != null && now - warmBusAt < 90000L && Math.abs(warmBusLL[0] - la) < BUS_MOVE_DEG && Math.abs(warmBusLL[1] - lo) < BUS_MOVE_DEG) return;
            warmBusLL = new double[] { la, lo }; warmBusAt = now;
            final MapCore w = new MapCore(store); w.modeOverride = "bus"; w.setBusLoc(la, lo);
            final String json = w.bodyRequest(ShellCore.CAP, ShellCore.theme(store));
            new Thread(new Runnable() { @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 12000);
                if (r.status == 200 && r.body != null && r.body.length() > 0) { warmBusTxt = r.body; warmBusJson = json; warmBusAt = System.currentTimeMillis(); }
            } }, "shell-buswarm").start();
        } catch (Throwable ignored) { }
    }
    /** 켤 때: 권한이 이미 있으면 기기가 기억하는 마지막 위치를 조용히 저장한다(권한 안내를 띄우지 않는다). */
    private void captureLastLoc() {
        if (!hasLocPerm()) return;
        ioExec.execute(new Runnable() { @Override public void run() {            // 위치 서비스 호출(프로세스 간 통신)도 주 스레드에서 하지 않는다
            try {
                LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
                Location best = null;
                for (String pv : lm.getProviders(true)) { Location l = lm.getLastKnownLocation(pv); if (l != null && (best == null || l.getTime() > best.getTime())) best = l; }
                if (best != null) saveLoc(best);
            } catch (Throwable ignored) { }
        } });
    }
    /** 권한이 이미 있을 때만 위치를 조용히 새로 받는다(없으면 아무것도 안 한다 — 권한 안내는 사용자가 위치 단추를 눌렀을 때만). */
    private void locateQuiet(LocCb cb) { if (hasLocPerm()) locateOnce(REQ_MAP_LOC, cb); }
    private static boolean farFrom(double[] a, Location l) { return farFrom(a, l, 0.003); }
    private static boolean farFrom(double[] a, Location l, double deg) { return a == null || Math.abs(a[0] - l.getLatitude()) > deg || Math.abs(a[1] - l.getLongitude()) > deg; }
    /** 버스 정류장 탐색의 위치 차이 기준 — 약 55m(반경 300m 안의 정류장 집합이 달라질 만큼). 거리는 언제나 진짜 좌표로 다시 잰다. */
    private static final double BUS_MOVE_DEG = 0.0005;
    private LocCb pendingLoc;
    private void locateOnce(final int reqCode, final LocCb cb0) {
        final LocCb cb = new LocCb() {
            @Override public void fix(Location l) { saveLoc(l); cb0.fix(l); }
            @Override public void fail(boolean noperm) { cb0.fail(noperm); }
        };
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            pendingLoc = cb;
            locGate(new Runnable() { @Override public void run() { requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION }, reqCode); } },
                new Runnable() { @Override public void run() { LocCb c = pendingLoc; pendingLoc = null; if (c != null) c.fail(true); } });
            return;
        }
        locateFast(8000L, cb);
    }
    // ── 현재 위치(마지막으로 알려진 위치는 쓰지 않는다): 고정밀 현재 위치 + 네트워크 위치를 동시에 · 먼저 오는 것을 바로 반영 · GPS 가 더 정확하면 한 번 더. 화면이 켜져 있는 동안은 가볍게 이어 받는다.
    private LocFused locf;
    private Location liveLoc; private long liveAt;
    private static final long LIVE_FRESH_MS = 20000L;
    private void liveSet(Location l) { if (l != null) { liveLoc = l; liveAt = System.currentTimeMillis(); saveLoc(l); hcFixFrom(l.getLatitude(), l.getLongitude()); if (resumed && (locf == null || !locf.tracking())) trackStart(); } }
    /** 방금(20초 안) 받은 현재 위치의 좌표(없으면 null) — 오래된 위치는 절대 돌려주지 않는다. */
    private double[] liveLL() { return liveLoc != null && System.currentTimeMillis() - liveAt < 60000L ? new double[] { liveLoc.getLatitude(), liveLoc.getLongitude() } : null; }
    /** 같은 때 들어온 위치 요청은 한 번의 요청을 같이 쓴다(켤 때 · 탭 · 위치감지가 겹쳐도 위성/네트워크 요청은 하나). */
    private static final class LocBatch { final java.util.ArrayList<LocCb> ws = new java.util.ArrayList<LocCb>(); long endAt; }
    private LocBatch locBatch;
    private void locateFast(final long waitMs, final LocCb cb) { locateNow(waitMs, 1000L, LIVE_FRESH_MS, 30000L, cb); }
    /** 현재 위치: maxAge 안에 받은 연속 위치가 있으면 그것을 바로, 아니면 고정밀 현재 위치(fastMs)+네트워크 위치를 동시에 요청한다. */
    private void locateNow(final long waitMs, final long fastMs, final long maxAge, final LocCb cb) { locateNow(waitMs, fastMs, maxAge, 0L, cb); }
    /** lkMs > 0 이면 기기가 그 안(ms)에 알던 위치(Play 서비스 합친 값)를 0.1초 안에 먼저 알리고, 곧이어 새 위치(fastMs ≈ 1초)로 바로잡는다. */
    private void locateNow(final long waitMs, final long fastMs, final long maxAge, final long lkMs, final LocCb cb) {
        if (liveLoc != null && System.currentTimeMillis() - liveAt < maxAge) { cb.fix(liveLoc); return; }
        if (locBatch != null && System.currentTimeMillis() < locBatch.endAt) { locBatch.ws.add(cb); return; }
        if (locf == null) locf = new LocFused(this);
        final LocBatch b = new LocBatch(); b.ws.add(cb); b.endAt = System.currentTimeMillis() + waitMs + 500L; locBatch = b;
        final boolean[] got = { false };
        locf.current(fastMs, waitMs, new LocFused.Cb() {
            @Override public void fix(Location l) { got[0] = true; liveSet(l); for (LocCb c : new java.util.ArrayList<LocCb>(b.ws)) c.fix(l); }
            @Override public void fail() { if (locBatch == b) locBatch = null; if (got[0]) return; for (LocCb c : new java.util.ArrayList<LocCb>(b.ws)) c.fail(false); }
        });
        if (lkMs > 0L) locf.lastKnown(lkMs, new LocFused.Cb() {              // 새 위치를 기다리는 동안 기기가 방금 알던 위치로 먼저 — 새 위치가 먼저 왔으면 버린다
            @Override public void fix(Location l) { if (got[0]) return; got[0] = true; hcFixFrom(l.getLatitude(), l.getLongitude()); for (LocCb c : new java.util.ArrayList<LocCb>(b.ws)) c.fix(l); }
            @Override public void fail() { }
        });
    }
    /** 방금(maxAge 안) 받은 현재 위치가 있으면 그것, 없으면 null — 오래된 위치는 돌려주지 않는다. */
    private Location liveRecent(long maxAge) { return liveLoc != null && System.currentTimeMillis() - liveAt < maxAge ? liveLoc : null; }
    /** 앱을 켜는 순간: 권한이 있으면 곧바로 현재 위치를 잡고, 주변 버스 정류장과 노선 정보를 뒤에서 미리 받아 둔다(지도 탭이 열려 있으면 바로 그린다). */
    private void launchLocate() {
        if (!hasLocPerm()) return;
        if (pfMap == null) pfMap = new MapCore(store);
        locateNow(10000L, 1000L, 0L, 120000L, new LocCb() {
            private double[] last;
            @Override public void fix(Location l) {
                if (last != null && Math.abs(last[0] - l.getLatitude()) < 0.0003 && Math.abs(last[1] - l.getLongitude()) < 0.0003) return;       // 같은 자리의 다듬기는 다시 받지 않는다
                last = new double[] { l.getLatitude(), l.getLongitude() };
                final double[] ll = last;
                final String theme = ShellCore.theme(store);
                final boolean onBusNow = "map".equals(ShellCore.currentTab(store)) && "bus".equals(map.mode());
                if (farFrom(map.busLL, l, BUS_MOVE_DEG)) { if (onBusNow && resumed) busMove(ll[0], ll[1]); else map.setBusLoc(ll[0], ll[1]); }
                if (!onBusNow) pfAdd(0, new PfJob() { @Override public boolean run() throws Exception { return pfBusRun(ll, theme); } });
            }
            @Override public void fail(boolean noperm) { }
        });
    }
    /** 앞에 있는 동안만: 15초 · 30m 마다 현재 위치를 이어 받고, 버스 정류장 탐색이 이동을 따라가게 한다. onPause 에서 즉시 해제. */
    private void trackStart() {
        if (!hasLocPerm() || !resumed) return;
        if (locf == null) locf = new LocFused(this);
        locf.track(new LocFused.Cb() {
            @Override public void fix(Location l) {
                liveSet(l);
                if (!resumed || !"bus".equals(map.mode()) || !"map".equals(ShellCore.currentTab(store)) || map.busLL == null) return;
                if (Math.abs(map.busLL[0] - l.getLatitude()) > 0.0008 || Math.abs(map.busLL[1] - l.getLongitude()) > 0.0008) {
                    final double la = l.getLatitude(), lo = l.getLongitude();          // 90m 넘게 움직였다 — 위치가 연달아 와도 멈춘 뒤 한 번만 새 자리의 정류장을 받는다(디바운스)
                    deb.trailing("busloc", Debounce.TYPE_MS, new Runnable() { @Override public void run() {
                        if (!resumed || !"bus".equals(map.mode()) || !"map".equals(ShellCore.currentTab(store)) || map.busLL == null) return;
                        busMove(la, lo);
                    } });
                }
            }
            @Override public void fail() { }
        });
    }
    private void trackStop() { if (locf != null) locf.untrack(); }                       // 한 번짜리 요청은 제한 시간(최대 12초)에 스스로 끝난다 — 연속 요청만 즉시 해제
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
        final String hk = typed.length() > 0 ? "maph|q" : ShellCore.cacheKey(ShellCore.S_MAPH, store);       // 찾기(글자 검색)는 캐시와 따로
        new Thread(new Runnable() {
            @Override public void run() {
                final String txt = screenCall(hk, false, ShellCore.BASE + "/screen/map", json, null, 8000); warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapH) return;
                    present(v, txt, keep);
                    if (txt.length() > 0) { if (!isNotMod(txt)) map.onScreen(txt); if (after != null) after.run(); }
                } });
            }
        }, "shell-maph").start();
    }
    private void loadMapBody(final ScreenView v, final boolean keep) { if (busRefreshing) map.restoreArrivals(); busRefreshing = false; loadMapBodyRound(v, keep, 0); }
    /**
     * 탭에 들어올 때 · 앱을 켤 때(콜드 스타트)의 버스 본문: 정류장 뼈대는 이미 그려졌다(캐시) — 도착정보(실시간 분·초)만 곧장 gildongmu-bus 로 받는다(엔진 왕복 없이).
     * 옛 도착 숫자는 엔진에 넣지 않는다(보여 줄 옛 화면이 없으면 비운다). 지난번 도착정보 주소를 모르면 평소 길(엔진에게 묻기).
     */
    private void loadMapBodyFast(final ScreenView v, final boolean keep) {
        if (busRefreshing) map.restoreArrivals(); busRefreshing = false;
        if (v == body && "bus".equals(map.mode())) {
            preconnectBus();
            if (!keep) map.clearArrivals();
            List<String[]> sp = map.speculativeNeed();
            if (!sp.isEmpty()) {
                map.busNeed.clear(); map.busNeed.addAll(sp);
                busAt = System.currentTimeMillis();
                fetchBusNeed(v, keep, 0, ++seqMapB, false);
                return;
            }
        }
        loadMapBodyRound(v, keep, 0);
    }
    // ── 네트워크 사전 연결: 버스 서버로 연결(DNS · TLS · HTTP/2)을 미리 맺어 둔다 — 실제 도착정보 요청이 그 연결을 이어 쓴다(NetPost 는 연결을 끊지 않는다) ──
    private long preConnAt;
    private void preconnectBus() {
        long now = System.currentTimeMillis();
        if (now - preConnAt < 20000L) return;
        preConnAt = now;
        new Thread(new Runnable() { @Override public void run() { try { NetPost.get(ShellCore.BUS_BASE + "/health", 4000); } catch (Throwable ignored) { } } }, "shell-preconn").start();
    }
    // ── 정류장 뼈대 저장: 정류장을 다 받은 뒤, 같은 정류장 목록을 도착정보 없이 엔진에 한 번 더 그리게 해(백그라운드) 저장한다 — 다음에 켜자마자 정류장 카드가 바로 뜬다 ──
    private String skelSig = "";
    private void saveBusSkeleton() {
        if (!"bus".equals(map.mode()) || !MapCore.VW_NEAR.equals(map.busView()) || map.stopCount() == 0) return;
        final String cell = map.stopsCell(), sig = cell + "|" + map.stopSig();
        if (cell.length() == 0 || sig.equals(skelSig)) return;
        skelSig = sig;
        final String json = map.bodyRequest(ShellCore.CAP, ShellCore.theme(store), true), key = ShellCore.busSkelKey(store);
        ioExec.execute(new Runnable() { @Override public void run() {
            NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
            final String txt = r.status == 200 && r.body != null ? r.body : "";
            if (txt.length() == 0) { skelSig = ""; return; }
            warm(txt);
            main.post(new Runnable() { @Override public void run() { store.put("bsk_cell", cell); cachePut(key, txt); } });
        } });
    }
    /** 버스는 엔진이 "이 주소들을 받아 와라" 하면 받아서 다시 묻는다(위치 → 정류장 → 도착정보, 최대 3번). */
    private void loadMapBodyRound(final ScreenView v, final boolean keep, final int round) {
        final int my = ++seqMapB;
        map.svb = busRefreshing ? 2500 : 300;                                                    // 처음 그리기는 서버가 도착정보를 오래 기다리지 않는다(정류장부터 먼저 · 도착정보는 이어서) · 조용한 갱신은 넉넉히
        final String json = map.bodyRequest(ShellCore.CAP, ShellCore.theme(store));
        final String modeNow = map.mode();
        final String wtxt = round == 0 && "bus".equals(modeNow) && json.equals(warmBusJson) && System.currentTimeMillis() - warmBusAt < 45000L ? warmBusTxt : "";          // 위치를 잡을 때 뒤에서 미리 받아 둔 정류장 화면이 있으면 기다리지 않고 바로
        if (wtxt.length() > 0) warmBusJson = "";
        new Thread(new Runnable() {
            @Override public void run() {
                String got0;
                if (wtxt.length() > 0) got0 = wtxt;
                else { NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, "bus".equals(modeNow) ? 12000 : 8000); got0 = r.status == 200 && r.body != null ? r.body : ""; }          // 버스는 서버가 정류장·도착정보를 한 번에 받아 오므로 조금 더 기다린다
                final String txt = got0; warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapB) return;
                    if (txt.length() == 0 && busRefreshing) { busFail(); return; }                    // 8초 갱신이 실패 — 화면은 그대로 두고(1초 카운트다운 계속) 다음 박자에 다시
                    if (txt.length() > 0) map.onScreen(txt);
                    if (busRefreshing && map.svFail > 0 && round == 0 && map.fillFromStash() > 0) { loadMapBodyRound(v, true, 1); return; }      // 서버가 몇 곳을 못 받았다 — 그 곳만 보던 값으로 채워 한 번 더 그린다(한 곳 때문에 전체 갱신이 막히지 않게)
                    final boolean shownNow = !(keep && txt.length() > 0 && !map.busNeed.isEmpty());
                    if (shownNow) { v.setSourceAge(map.arrAge()); present(v, txt, keep); }          // 버스 도착정보를 더 받아야 하면 캐시 화면을 중간 화면으로 덮지 않는다
                    syncMapView();
                    if ("bus".equals(map.view)) { if (round == 0) busAt = System.currentTimeMillis(); startBusTick(); if (txt.length() > 0 && map.stopCount() > 0) map.saveStopsCache(); }
                    if (txt.length() > 0 && !map.busNeed.isEmpty() && round < 3) fetchBusNeed(v, keep, round, my, shownNow && !busRefreshing);
                    else { if (busRefreshing) busOk(); if (txt.length() > 0 && "bus".equals(map.view) && map.busNeed.isEmpty()) { brPrefetch(); saveBusSkeleton(); }
                        if ((map.svFail > 0 || busBadFetch > 0) && !busRefreshing && busShowing() && busRetryN < 3) {            // 몇 곳이 비었다 — 1.5 · 3 · 4.5초 뒤 그 곳만 다시(세 번까지, 사람이 탭 · 보기를 바꾸면 처음부터)
                            busRetryN++; final long wait = 1500L * busRetryN;
                            main.postDelayed(new Runnable() { @Override public void run() { if (busShowing() && !busRefreshing) busRefresh(); } }, wait);
                        } else if (map.svFail == 0 && busBadFetch == 0) busRetryN = 0;
                        busBadFetch = 0; }     // 처음 그릴 때 몇 곳이 비었으면 곧바로 한 번 더(8초 박자를 기다리지 않는다)
                } });
            }
        }, "shell-mapb").start();
    }
    // ── 노선 정류장 목록 미리 받기: 도착정보가 뜬 가장 가까운 정류장의 앞 몇 개 노선은 목록을 기기에 7일 두어, 누르면 바로 그린다(정류장 목록은 거의 안 바뀐다) ──
    private long brPfAt; private String brPfSig = "";
    private void brPrefetch() { brPrefetch(map); }
    private void brPrefetch(final MapCore src) {
        if (src.routeCount(0) == 0) return;
        String sig = src.busView() + "|" + src.rtsSig();
        long now = System.currentTimeMillis();
        if (sig.equals(brPfSig) && now - brPfAt < 600000L) return;
        brPfSig = sig; brPfAt = now;
        final List<MapCore> jobs = new ArrayList<MapCore>();
        for (int ri = 0, n = Math.min(4, src.routeCount(0)); ri < n; ri++) {
            MapCore m = src.routeClone(0, ri);
            if (m != null && brCacheGet(m.brRid) == null) jobs.add(m);
        }
        if (jobs.isEmpty()) return;
        final String th = ShellCore.theme(store);
        new Thread(new Runnable() {
            @Override public void run() {
                for (final MapCore m : jobs) {
                    try {
                        for (int round = 0; round < 3 && m.brStnJson.length() == 0; round++) {
                            NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", m.brRequest(ShellCore.CAP, th), 8000);
                            if (r.status != 200) break;
                            m.onBr(r.body);
                            if (m.brStnJson.length() > 0) break;
                            boolean any = false;
                            for (String[] nd : new ArrayList<String[]>(m.brNeed)) {
                                if (!nd[0].endsWith("s")) continue;                                   // 목록만(위치는 열 때 새로 받는다)
                                String u = MapCore.busFetchUrl(nd[1]);
                                NetPost.Res g = u.length() == 0 ? null : NetPost.get(u, 9000);
                                m.addBrRes(nd[0], g != null && g.status == 200 && g.body != null ? g.body : ""); any = true;
                            }
                            if (!any) break;
                        }
                    } catch (Throwable ignored) { }
                    if (m.brStnJson.length() > 0) main.post(new Runnable() { @Override public void run() { brCachePut(m); } });
                }
            }
        }, "shell-brpf").start();
    }
    private boolean busPaintFly, busPaintDirty;
    /** 정류장마다 도착정보가 오는 대로 그 카드만 채운다(웹처럼 병렬로 받고 먼저 온 곳부터 보인다) — 아직 못 받은 카드는 엔진이 '불러오는 중'으로 그린다. 계산은 엔진, 앱은 그리기만. */
    private void busPaint(final ScreenView v, final int my) {
        if (busPaintFly) { busPaintDirty = true; return; }
        busPaintFly = true;
        final String json = map.bodyRequest(ShellCore.CAP, ShellCore.theme(store));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 && r.body != null ? r.body : ""; warm(txt);          // 해석은 IO 스레드에서 — 주 스레드는 그리기만
                main.post(new Runnable() { @Override public void run() {
                    busPaintFly = false;
                    if (my == seqMapB && txt.length() > 0 && !busRefreshing && busShowing()) { v.setSourceAge(map.arrAge()); present(v, txt, true); }          // 그 사이 다음 통신·탭 이동이 있었으면 버린다(최종 그림이 곧 온다)
                    if (busPaintDirty) { busPaintDirty = false; if (my == seqMapB) busPaint(v, my); }
                } });
            }
        }, "shell-buspaint").start();
    }
    private void fetchBusNeed(final ScreenView v, final boolean keep, final int round, final int my, final boolean partial) {
        final List<String[]> need = new ArrayList<String[]>(map.busNeed);
        new Thread(new Runnable() {
            @Override public void run() {
                final String[] got = new String[need.size()];
                Thread[] ts = new Thread[need.size()];
                for (int i = 0; i < need.size(); i++) {
                    final int k = i;
                    ts[i] = new Thread(new Runnable() { @Override public void run() {
                        String u = MapCore.busFetchUrl(need.get(k)[1]);
                        String body = "";
                        for (int a = 0; a < 3 && u.length() > 0 && body.length() == 0; a++) {          // 한 곳이 느려 전체가 9초 걸리지 않게: 5초 안에 못 받으면 한 번 더(빨리 실패했을 때만 — 느린 서버에 또 매달리지 않는다). 공공 API 의 일시적 빈 응답은 0.3초 뒤 한 번 더
                            long t0 = System.currentTimeMillis();
                            NetPost.Res r = NetPost.get(u, a == 0 ? 5000 : 4000);
                            body = r.status == 200 && r.body != null ? r.body : "";
                            if (body.length() == 0 && System.currentTimeMillis() - t0 > 2500L) break;
                            if (body.length() == 0 && a < 2) { try { Thread.sleep(300L); } catch (InterruptedException ie) { break; } }
                        }
                        got[k] = body;
                        if (partial && body.length() > 0) main.post(new Runnable() { @Override public void run() {          // 먼저 온 정류장부터 바로 보인다
                            if (my != seqMapB || busRefreshing) return;
                            map.addBusRes(need.get(k)[0], got[k]);
                            busPaint(v, my);
                        } });
                    } });
                    ts[i].start();
                }
                for (Thread t : ts) { try { t.join(12000); } catch (InterruptedException e) { /* 무시 */ } }
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapB) return;
                    if (busRefreshing) {                                                          // 새로 받는 중인 도착정보가 하나라도 비면 이번 갱신은 버린다(옛 값을 섞지 않는다) — 화면은 1초 카운트다운으로 이어진다
                        boolean bad = false;
                        for (int i = 0; i < need.size(); i++) if (got[i] == null || got[i].length() == 0) bad = true;
                        if (bad) { busFail(); return; }
                    }
                    int badN = 0;
                    for (int i = 0; i < need.size(); i++) if (got[i] == null || got[i].length() == 0) badN++;
                    busBadFetch = badN;
                    for (int i = 0; i < need.size(); i++) map.addBusRes(need.get(i)[0], got[i] == null ? "" : got[i]);
                    map.rememberNeed(need);                                                       // 다음 갱신은 이 주소들을 엔진에게 묻지 않고 곧장 받는다
                    map.busNeed.clear();
                    loadMapBodyRound(v, true, round + 1);
                } });
            }
        }, "shell-mapbus").start();
    }
    /** 버스 방식 노선도: 위치를 기다리지 않고 마지막 위치로 먼저 그리고, 권한이 있으면 새 위치를 조용히 받아 바뀌었을 때만 다시 그린다. */
    private void seedMapLoc() {
        if (!"bus".equals(map.mode()) || map.busLL != null) return;
        double[] seed = liveLL();
        if (seed == null) seed = ShellCore.lastLocFresh(store, 30L * 60000L, System.currentTimeMillis());       // 기다리지 않고 바로 그린다(30분 안에 안 위치) — 새 위치가 오면 바로잡는다
        if (seed != null) map.setBusLoc(seed[0], seed[1]);
        else if (hasLocPerm()) {                                                                             // 기기가 방금 알던 위치(Play 서비스가 합친 값)를 비동기로 즉시 — 새 위치보다 먼저 오면 그것으로 먼저 그린다
            if (locf == null) locf = new LocFused(this);
            locf.lastKnown(5L * 60000L, new LocFused.Cb() {
                @Override public void fix(Location l) {
                    if (map.busLL != null || !"bus".equals(map.mode()) || !"map".equals(ShellCore.currentTab(store))) return;
                    map.setBusLoc(l.getLatitude(), l.getLongitude()); loadMapBody(body, true);
                }
                @Override public void fail() { }
            });
        }
        locateQuiet(new LocCb() {
            @Override public void fix(Location l) {
                if (!"bus".equals(map.mode()) || !"map".equals(ShellCore.currentTab(store))) return;
                if (farFrom(map.busLL, l, BUS_MOVE_DEG)) busMove(l.getLatitude(), l.getLongitude());
            }
            @Override public void fail(boolean noperm) { }
        });
        // 위치도 마지막 위치도 없고 권한이 아직 없으면, 지도를 보러 온 사람에게 앱을 켠 뒤 한 번 권한을 묻는다(받으면 바로 지도와 정류장을 그린다)
        if (map.busLL == null && !mapPermAsked && locOk == null && pendingLoc == null && checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            mapPermAsked = true;
            locateOnce(REQ_MAP_LOC, new LocCb() {
                @Override public void fix(Location l) { map.setBusLoc(l.getLatitude(), l.getLongitude()); loadMapBody(body, true); }
                @Override public void fail(boolean noperm) { }
            });
        }
    }
    private boolean mapPermAsked;
    /** 웹처럼 30초마다 버스 도착정보를 다시 받는다(지도 탭이 보이고 버스 화면일 때만; 정류장 목록·내 위치는 그대로). 계산은 엔진이 한다. */
    private boolean busShowing() {
        return resumed && "bus".equals(map.view) && "bus".equals(map.mode()) && map.busLL != null && "map".equals(ShellCore.currentTab(store)) && ShellCore.S_MAPB.equals(slots.length > 1 ? slots[1] : "");
    }
    private long busAt = 0L;
    private static final long BUS_POLL_MS = 60000L;                     // 실시간 도착정보 갱신 박자(1분에 한 번 — 그 사이 초는 기기에서 줄어든다, 화면은 깜박이지 않는다)
    private boolean busRefreshing; private long busRefAt;                // 갱신 한 번이 오가는 중인가(느린 통신이 다음 박자에 끊기지 않게 · 20초가 지나면 포기)
    private void busEnd() { busRefreshing = false; startBusTick(); }
    private void busFail() { map.restoreArrivals(); busEnd(); }                               // 받기 실패: 보던 도착정보를 그대로 돌려놓고 다음 박자에
    private void busOk() { map.commitArrivals(); busEnd(); }
    /** 도착정보만 새로 받는다: 성공하면 새 값으로 바로 덮고(카운트다운 시작점도 새로), 실패하면 아무것도 건드리지 않는다. */
    /** 주변 정류장 카드를 끌어서 순서를 바꿨다 — 새 순서를 저장하고(이미 받은 도착정보는 번호를 옮겨 둔다) 엔진이 그 순서로 곧장 다시 그린다(도착정보를 다시 받지 않는다). */
    private void reorderBusNear(String[] keys, int[] perm) {
        if (!"map".equals(ShellCore.currentTab(store)) || !"bus".equals(map.mode()) || !MapCore.VW_NEAR.equals(map.busView())) return;
        if (!map.reorderNear(keys, perm)) return;
        loadMapBody(body, true);
    }
    // ── 위치가 바뀌었을 때: 보던 정류장 · 도착정보를 비우지 않는다. 뒤에서 새 자리의 정류장 · 도착정보를 끝까지 받은 뒤 한 번에 바꿔 끼운다(중간에 사라지거나 깜박이지 않는다) ──
    private boolean busQuiet; private long busQuietAt;
    private void busMove(final double la, final double lo) {
        final boolean quiet = busShowing() && map.stopCount() > 0 && MapCore.VW_NEAR.equals(map.busView());
        if (!quiet) { map.setBusLoc(la, lo); loadMapBody(body, true); return; }
        long now = System.currentTimeMillis();
        if (busQuiet && now - busQuietAt < 25000L) return;
        if (now - busQuietAt < 15000L) return;                                                  // 위치가 연달아 와도 15초에 한 번만
        busQuiet = true; busQuietAt = now;
        final String theme = ShellCore.theme(store), curSig = map.stopSig();
        final double[] from = map.busLL == null ? null : map.busLL.clone();
        new Thread(new Runnable() {
            @Override public void run() {
                String fin = ""; String sig = ""; final List<String[]> arrNeed = new ArrayList<String[]>(); final java.util.Map<String, String> res = new java.util.LinkedHashMap<String, String>();
                try {
                    MapCore w = new MapCore(store); w.modeOverride = "bus"; w.svb = 2500; w.setBusLoc(la, lo);
                    for (int round = 0; round < 4 && fin.length() == 0; round++) {
                        NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", w.bodyRequest(ShellCore.CAP, theme), 12000);
                        if (r.status != 200 || r.body == null || r.body.length() == 0) break;
                        w.onScreen(r.body);
                        if (w.busNeed.isEmpty()) { if (w.svFail == 0 && w.stopCount() > 0) fin = r.body; break; }
                        List<String[]> need = new ArrayList<String[]>(w.busNeed);
                        String[] got = fetchAll(need, 5000, 4000);
                        boolean bad = false;
                        for (int i = 0; i < need.size(); i++) { if (got[i] == null || got[i].length() == 0) bad = true; w.addBusRes(need.get(i)[0], got[i] == null ? "" : got[i]); }
                        for (String[] n : need) arrNeed.add(n);
                        w.busNeed.clear();
                        if (bad) break;                                                         // 한 곳이라도 못 받았으면 보던 화면을 그대로 둔다
                    }
                    if (fin.length() > 0) { sig = w.stopSig(); res.putAll(w.busRes); }
                } catch (Throwable ignored) { }
                final String txt = fin, nsig = sig;
                main.post(new Runnable() { @Override public void run() {
                    busQuiet = false;
                    if (txt.length() == 0 || !busShowing() || !MapCore.VW_NEAR.equals(map.busView()) || busRefreshing) return;      // 못 받았거나 그 사이 화면이 바뀜 — 아무것도 건드리지 않는다(다음 위치 때 다시)
                    if (from != null && map.busLL != null && (map.busLL[0] != from[0] || map.busLL[1] != from[1])) return;       // 그 사이 다른 곳으로 이미 옮겨졌다
                    seqMapB++;                                                                  // 이 받기보다 먼저 시작한 화면 응답은 버린다
                    map.setBusLoc(la, lo);
                    for (java.util.Map.Entry<String, String> e : res.entrySet()) map.addBusRes(e.getKey(), e.getValue());
                    if (!arrNeed.isEmpty()) map.rememberNeed(arrNeed);
                    map.onScreen(txt);
                    body.setSourceAge(map.arrAge());
                    present(body, txt, true);                                                   // 같은 정류장이면 값만 바뀌고, 다른 정류장이면 새 정류장이 차례로 내려앉는다
                    busAt = System.currentTimeMillis();
                    syncMapView();
                    if (map.stopCount() > 0) map.saveStopsCache();
                } });
            }
        }, "shell-busmove").start();
    }
    private void busRefresh() {
        if (busRefreshing && System.currentTimeMillis() - busRefAt < 20000L) return;
        busRefreshing = true; busRefAt = System.currentTimeMillis(); busAt = busRefAt;
        map.dropArrivals();
        final List<String[]> spec = map.speculativeNeed();
        if (spec.isEmpty()) { loadMapBodyRound(body, true, 0); return; }                                       // 지난번 도착정보 주소를 모르면 엔진에게 묻는다(주소를 아는 한 기기가 gildongmu-bus 로 곧장 받는다 — 서버 경유보다 빠르다)
        busSpeculate(spec);
    }
    /** 엔진 왕복 하나를 건너뛴다: 지난번 도착정보 주소들을 곧장 받고(병렬) 한 번에 그린다. 하나라도 비면 평소 길(엔진에게 묻기)로 돌아간다. */
    private void busSpeculate(final List<String[]> spec) {
        final int sq = seqMapB;
        new Thread(new Runnable() {
            @Override public void run() {
                final String[] got = fetchAll(spec, 5000, 4000);
                main.post(new Runnable() { @Override public void run() {
                    if (sq != seqMapB) return;                                                    // 그 사이 다른 요청이 시작됐다
                    boolean bad = false;
                    for (String g : got) if (g == null || g.length() == 0) bad = true;
                    if (bad) { loadMapBodyRound(body, true, 0); return; }
                    for (int i = 0; i < spec.size(); i++) map.addBusRes(spec.get(i)[0], got[i]);
                    loadMapBodyRound(body, true, 1);
                } });
            }
        }, "shell-busspec").start();
    }
    /** 주소들을 동시에 받는다(한 곳이 느려도 전체가 늦지 않게 5초 → 빨리 실패했을 때만 한 번 더). */
    private String[] fetchAll(final List<String[]> need, final int firstMs, final int retryMs) {
        final String[] got = new String[need.size()];
        Thread[] ts = new Thread[need.size()];
        for (int i = 0; i < need.size(); i++) {
            final int k = i;
            ts[i] = new Thread(new Runnable() { @Override public void run() {
                String u = MapCore.busFetchUrl(need.get(k)[1]), b = "";
                for (int a = 0; a < 2 && u.length() > 0 && b.length() == 0; a++) {
                    long t0 = System.currentTimeMillis();
                    NetPost.Res r = NetPost.get(u, a == 0 ? firstMs : retryMs);
                    b = r.status == 200 && r.body != null ? r.body : "";
                    if (b.length() == 0 && System.currentTimeMillis() - t0 > 2500L) break;
                }
                got[k] = b;
            } });
            ts[i].start();
        }
        for (Thread t : ts) { try { t.join(12000); } catch (InterruptedException e) { /* 무시 */ } }
        return got;
    }
    private final Runnable busTick = new Runnable() { @Override public void run() {
        busTicking = false;
        if (!busShowing()) { if (busRefreshing) map.restoreArrivals(); busRefreshing = false; return; }
        if (busRefreshing && System.currentTimeMillis() - busRefAt < 20000L) { startBusTick(); return; }
        busRefresh(); startBusTick();
    } };
    /** 앞으로 돌아왔을 때: 마지막으로 받은 지 8초가 넘었으면 바로 다시 받는다(박자를 기다리지 않는다). */
    private void busResume() {
        if (!busShowing()) return;
        if (System.currentTimeMillis() - busAt > BUS_POLL_MS) busRefresh();
        startBusTick();
    }
    private boolean busTicking;
    /** 다른 탭에 갔다 버스 탭으로 돌아왔다(위치가 그대로라 정류장 목록이 같다): 기억해 둔 화면을 지난 시간만큼 줄여 바로 보이고, 정류장 · 엔진 왕복 없이 도착정보만 뒤에서 새로 받아
     *  숫자만 조용히 바꾼다(새 버스 줄만 스프링으로 내려온다). 기억해 둔 정류장이 없으면 false — 평소 길로 받는다. */
    private boolean busReturnQuiet() {
        if (!busShowing() || map.stopCount() == 0 || map.speculativeNeed().isEmpty()) return false;
        if (System.currentTimeMillis() - busAt > BUS_POLL_MS) busRefresh();
        startBusTick();
        syncMapView();
        return true;
    }
    private void startBusTick() { if (!busTicking) { busTicking = true; main.postDelayed(busTick, BUS_POLL_MS); } }
    private void reloadMap(boolean headToo) {
        seedMapLoc();
        if (headToo) { keyedShow(head, ShellCore.S_MAPH); loadMapHead(head, true, null, null); }
        boolean shown = keyedShow(body, ShellCore.S_MAPB);
        if (!shown) showSkeleton(body, ShellCore.S_MAPB);                                   // 새 화면이 올 때까지 옛 모드의 화면(노선도 · 다른 정류장)을 두지 않는다 — 눌렀는데 아무 일도 없는 것처럼 보이지 않게
        syncMapView();
        busRetryN = 0;
        if (shown && busShowing() && System.currentTimeMillis() - busAt > BUS_POLL_MS) busRefresh();        // 버스 탭에 들어오면 캐시 화면을 먼저 보이고, 도착정보는 곧장(엔진 왕복 없이) 새로 받는다
        else loadMapBodyFast(body, shown);
        if (shown) syncMapView();
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
        if (a.v != null && (a.v.equals("mp.all") || a.v.matches("mp\\.f[0-9]+"))) {          // 정류장 지도 크게 보기(핀은 엔진이 정한 값)
            int fi = -1;
            if (a.v.startsWith("mp.f")) { try { fi = Integer.parseInt(a.v.substring(4)); } catch (NumberFormatException e) { fi = -1; } }
            openTileMap(src.tmapPins(), fi);
            return;
        }
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
            case MapCore.R_BUS_VIEW: reloadMap(false); break;                                  // 주변 ↔ 즐겨찾기: 본 적 있으면 그 화면을 먼저 올리고 새로 받는다
            case MapCore.R_BUS_REF: loadMapBody(body, true); break;                            // 즐겨찾기 새로고침: 도착정보를 다시 받는다
            case MapCore.R_BUS_SEL: {
                loadMapBody(body, true);
                if (map.toast.length() > 0) { toast(map.toast); map.toast = ""; }
                break;
            }
            case MapCore.R_ALIAS: openAliasDialog(); break;
            case MapCore.R_BR_OPEN: openBusRoute(); break;
            default: break;
        }
    }
    /** 정류장 이름 설정(웹 _busEditAlias): 이름 + 입력칸(10자) + 삭제(있을 때)·취소·저장. 저장하면 엔진에 다시 그려 달라고 한다. */
    private void openAliasDialog() {
        closeSheet();
        final String key = map.aliasKey, cur = map.aliasCur;
        final int[] pal = ShellCore.palette(ShellCore.theme(store));
        final android.app.Dialog dlg = new android.app.Dialog(this, android.R.style.Theme_Material_Light_Dialog_NoActionBar);
        android.widget.LinearLayout box = new android.widget.LinearLayout(this);
        box.setOrientation(android.widget.LinearLayout.VERTICAL);
        int pd = Math.round(18 * dpr);
        box.setPadding(pd, Math.round(20 * dpr), pd, pd);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(pal[ScreenView.R_CARD]); bg.setCornerRadius(16 * dpr); bg.setStroke(Math.max(1, Math.round(dpr)), pal[ScreenView.R_BORDER]);
        box.setBackground(bg);
        android.widget.TextView t1 = new android.widget.TextView(this); t1.setText("정류장 이름 설정"); t1.setTextSize(15); t1.setTypeface(ScreenView.face(true)); t1.setTextColor(pal[ScreenView.R_TEXT]);
        android.widget.TextView t2 = new android.widget.TextView(this); t2.setText(map.aliasName); t2.setTextSize(12); t2.setTextColor(pal[ScreenView.R_SUB]); t2.setPadding(0, Math.round(4 * dpr), 0, Math.round(12 * dpr));
        final android.widget.EditText ed = new android.widget.EditText(this);
        ed.setText(cur); ed.setSelection(cur.length()); ed.setHint("예: 출근, 퇴근, 친구집"); ed.setSingleLine(true); ed.setTextSize(14);
        ed.setFilters(new android.text.InputFilter[] { new android.text.InputFilter.LengthFilter(10) });
        ed.setTextColor(pal[ScreenView.R_TEXT]); ed.setHintTextColor(pal[ScreenView.R_SUB]);
        android.graphics.drawable.GradientDrawable eb = new android.graphics.drawable.GradientDrawable();
        eb.setColor(pal[ScreenView.R_BG]); eb.setCornerRadius(10 * dpr); eb.setStroke(Math.max(1, Math.round(dpr)), pal[ScreenView.R_BORDER2]);
        ed.setBackground(eb); ed.setPadding(Math.round(11 * dpr), Math.round(11 * dpr), Math.round(11 * dpr), Math.round(11 * dpr));
        android.widget.LinearLayout row = new android.widget.LinearLayout(this);
        row.setPadding(0, Math.round(14 * dpr), 0, 0);
        if (cur.length() > 0) row.addView(aliasBtn("삭제", 0xFFFF5B5B, 0, pal, 1f, new Runnable() { @Override public void run() { map.setAlias(key, ""); dlg.dismiss(); loadMapBody(body, true); } }));
        row.addView(aliasBtn("취소", pal[ScreenView.R_SUB], 0, pal, 1f, new Runnable() { @Override public void run() { dlg.dismiss(); } }));
        row.addView(aliasBtn("저장", 0xFF121214, pal[ScreenView.R_GOLD], pal, 2f, new Runnable() { @Override public void run() { map.setAlias(key, String.valueOf(ed.getText())); dlg.dismiss(); loadMapBody(body, true); } }));
        box.addView(t1); box.addView(t2); box.addView(ed); box.addView(row);
        dlg.setContentView(box);
        try {
            android.view.Window w = dlg.getWindow();
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
            w.setLayout(Math.round(Math.min(340 * dpr, getResources().getDisplayMetrics().widthPixels - 48 * dpr)), ViewGroup.LayoutParams.WRAP_CONTENT);
            w.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
            dlg.show();
        } catch (Throwable t) { toast("이름 설정을 열지 못했어요"); }
    }
    private android.widget.TextView aliasBtn(String label, int fg, int fill, int[] pal, float weight, final Runnable on) {
        android.widget.TextView b = new android.widget.TextView(this);
        b.setText(label); b.setTextSize(13); b.setTypeface(ScreenView.face(true)); b.setTextColor(fg); b.setGravity(android.view.Gravity.CENTER);
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setCornerRadius(10 * dpr);
        if (fill != 0) g.setColor(fill); else { g.setColor(0); g.setStroke(Math.max(1, Math.round(dpr)), pal[ScreenView.R_BORDER2]); }
        b.setBackground(g);
        android.widget.LinearLayout.LayoutParams lp = new android.widget.LinearLayout.LayoutParams(0, Math.round(44 * dpr), weight);
        lp.rightMargin = Math.round(8 * dpr);
        b.setLayoutParams(lp);
        b.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { on.run(); } });
        return b;
    }
    private static final int S_STN_H = 276, S_TT_H = -58;

    /** 타일 지도를 화면 가득 크게 연다(끌기 · 두 손가락 확대 · 핀 누르면 이름). pinsEnc 는 엔진이 준 핀 글, focus 는 처음 가운데 둘 핀(없으면 -1 = 전체). */
    private void openTileMap(String pinsEnc, int focus) {
        final List<TileMapCore.Pin> pins = TileMapCore.parsePins(pinsEnc);
        if (pins.isEmpty()) { toast("지도에 찍을 곳이 없어요"); return; }
        closeSheet();
        sheetName = "tmap";
        final android.app.Dialog dlg = new android.app.Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        TileMapView mv = new TileMapView(this, pins, focus >= 0 && focus < pins.size() ? focus : -1, dpr);
        mv.setListener(new TileMapView.Listener() {
            @Override public void onClose() { closeSheet(); }
            @Override public void onPin(int index) { }
        });
        dlg.setContentView(mv);
        sheet = dlg;
        try {
            android.view.Window w = dlg.getWindow();
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            dlg.show();
        } catch (Throwable t) { toast("지도를 열지 못했어요"); sheet = null; sheetName = ""; }
    }

    // 노선도 View: 수도권 지하철일 때만 본문 위에 얹는다
    private void syncMapView() {
        boolean want = "metro".equals(map.view) && ShellCore.S_MAPB.equals(slots.length > 1 ? slots[1] : "");
        if (!want) { if (mapView != null) mapView.setVisibility(View.INVISIBLE); return; }          // 숨겨도 그려 둔 그림을 쥔다 — 다시 열 때 바로 보인다
        if (mapView != null) { mapView.setVisibility(View.VISIBLE); mapView.setFilter(map.flt()); return; }
        ensureMetro();
    }
    /** 노선도 자료를 읽고(통신 스레드) 숨긴 채로 만들어 둔다 — 앱을 켠 직후 한가할 때 한 번 해 두면 노선도 탭은 그린 그림을 바로 보여 준다. */
    private void ensureMetro() {
        if (mapView != null || mapDataLoading) return;
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
        if (mapView != null) mapView.setVisibility(View.INVISIBLE);
    }

    /** 아래에서 올라오는 팝업(역 정보·시간표). hDp > 0 이면 그 높이(dp), 음수면 화면 높이의 -hDp %. */
    private void openMapSheet(int hDp) {
        closeSheet();
        sheetName = ShellCore.S_MAPSTN;
        sheetView = new ScreenView(this);
        final ScreenView sv = sheetView;
        sv.setDpr(dpr);
        int[] pal = ShellCore.palette(ShellCore.theme(store));
        sv.setPalette(pal);
        sv.setListener(new SheetHost());
        sv.setParentIntercept(true);                                                // 팝업 어디를 잡아도 위아래로 끌면 박스가 가져간다(시간표 · 닫기)
        final String json = map.stnRequest(ShellCore.CAP, ShellCore.theme(store));
        final String cached = stnCache.get(json);                         // 본 적 있는 역이면 시트가 올라오기 전에 내용을 먼저 채워 둔다(올라오면서 이미 채워져 있다)
        boolean filled = false;
        if (cached != null) {
            try { map.onStn(cached); map.setLinesFromStn(cached); sv.setScreen(parsedGet(cached), false); filled = true; } catch (Throwable e) { filled = false; }
        }
        final boolean wasFilled = filled;
        final boolean[] slid = new boolean[1];
        final Runnable startSlide = new Runnable() { @Override public void run() { if (slid[0]) return; slid[0] = true; slideIn(sv); } };
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_Dialog_NoActionBar);
        if (hDp == S_STN_H) sheet.setContentView(stnSheetBox(sv, pal)); else sheet.setContentView(sv);
        sv.setScrollHook(new Runnable() { @Override public void run() { playScroll(); } });     // 시간표 머리줄이 글과 함께 올라가면 놀이터(캐릭터)도 같이 올라간다
        try {
            android.view.Window w = sheet.getWindow();
            int hpx = hDp > 0 ? Math.round(hDp * dpr) : Math.round(getResources().getDisplayMetrics().heightPixels * (-hDp) / 100f);
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, hpx);
            if (mapView != null) mapView.setCover(hpx);                                      // 시트가 덮은 만큼을 뺀 보이는 영역에 역이 오게
            w.setGravity(android.view.Gravity.BOTTOM);
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(pal[ScreenView.R_BG]));
            w.clearFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            w.setWindowAnimations(android.R.style.Animation_InputMethod);
            sheet.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() { @Override public void onDismiss(android.content.DialogInterface d) { map.ttSeq++; } });
            if (!wasFilled) { sv.setAlpha(0f); sv.setTranslationY(56f * dpr); }              // 아직 빈 시트 — 내용이 오는 대로(최대 0.45초) 올린다. 빈 채로 올라오지 않게
            sheet.show();
            if (wasFilled) { startSlide.run(); sv.post(new Runnable() { @Override public void run() { if (sv == sheetView) playPlace(); } }); }
            else main.postDelayed(startSlide, 450L);
        } catch (Throwable t) { toast("역 정보를 열지 못했어요"); return; }
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    if (sheet == null || sv != sheetView || !sheet.isShowing() || !ShellCore.S_MAPSTN.equals(sheetName)) return;
                    if (txt.length() == 0) { if (!wasFilled) closeSheet(); return; }          // 역이 아닌 글자 — 조용히 닫는다(이미 보이는 내용이 있으면 그대로)
                    stnCachePut(json, txt);
                    if (!wasFilled || !txt.equals(cached)) { map.onStn(txt); map.setLinesFromStn(txt); present(sv, txt, false); }
                    startSlide.run();
                    playPlace();
                    if (mapView != null) mapView.ensureVisible(map.stn);
                } });
            }
        }, "shell-mapstn").start();
    }
    private final java.util.LinkedHashMap<String, String> stnCache = new java.util.LinkedHashMap<String, String>();
    private void stnCachePut(String key, String txt) {
        if (key == null || txt == null || txt.length() == 0 || txt.length() > 80000) return;
        stnCache.remove(key); stnCache.put(key, txt);
        while (stnCache.size() > 40) { java.util.Iterator<String> it = stnCache.keySet().iterator(); it.next(); it.remove(); }
    }

    // ── 캐릭터 놀이터(웹 _RC.playStart): 역 팝업 이름 오른쪽 · 시간표 제목 오른쪽 빈 칸. 팝업 → 시간표로 올라올 땐 같은 장면이 이어진다 ──
    private PlayView playView;
    private void playPlace() {
        final PlayView pv = playView;
        if (pv == null || sheetView == null || sheet == null || !sheet.isShowing()) return;
        boolean tt = ShellCore.S_MAPTT.equals(sheetName);
        if (!tt && !ShellCore.S_MAPSTN.equals(sheetName)) return;
        float[] a = sheetView.playAnchor(tt ? ScreenCore.K_BAR : ScreenCore.K_TEXT);
        float w = sheetView.getWidth() / dpr;
        float[] h = a == null || w <= 0f ? null : (tt ? PlayCore.ttHost(a[4], a[5], a[0], a[2], a[6]) : PlayCore.popupHost(w, a[0], a[0], a[2], a[1], a[3]));
        if (h == null) { pv.end(); return; }                                         // 이름이 길어 빈 칸이 없으면 놀이터는 없다(웹과 같다)
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) pv.getLayoutParams();
        int wp = Math.round(h[2] * dpr), hp = Math.round(h[3] * dpr), lx = Math.round(h[0] * dpr), ty = Math.round(Math.max(0f, h[1]) * dpr);
        if (lp.width != wp || lp.height != hp || lp.leftMargin != lx || lp.topMargin != ty) { lp.width = wp; lp.height = hp; lp.leftMargin = lx; lp.topMargin = ty; pv.setLayoutParams(lp); }
        boolean reduce = false;
        try { reduce = android.provider.Settings.Global.getFloat(getContentResolver(), android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f; } catch (Throwable ignored) { }
        PlayCore.Snap snap = tt ? pv.snap() : null;                                  // 시간표로 올라오면 팝업에서 놀던 그대로
        pv.begin(wp, hp, ShellCore.theme(store).equals("dark"), reduce, snap);
        playScrollY = a[7] > 0f ? 1f : 0f;
        playScroll();
    }
    private float playScrollY;                                                       // 1 이면 놀이터 칸이 본문 안에 있어 스크롤을 따라 움직인다
    /** 본문이 스크롤되면 놀이터 그림도 같은 만큼 옮긴다(위치만 바꾸는 가벼운 일 — 그림 박자는 그대로). */
    private void playScroll() {
        PlayView pv = playView; ScreenView sv = sheetView;
        if (pv == null || sv == null) return;
        pv.setTranslationY(playScrollY > 0f ? -sv.scrollPos() * dpr : 0f);
    }

    /** 웹 .nmp 역 팝업의 손잡이(40x4, 위 16)와 아래로 밀어 닫기 — 화면 글은 엔진이 그리고 손잡이는 뷰가 맨 위에 얹는다. */
    private android.view.View stnSheetBox(ScreenView sv, int[] pal) {
        FrameLayout box = new FrameLayout(this) {
            // 웹 svgShowPopup · _nmDragDismiss: 팝업 어디서든 위로 끌면 시간표가 손가락을 따라 자라 오르고(놓으면 이어서 올라가거나 되돌아간다), 아래로 끌면 시트가 손가락을 따라 내려가다 놓으면 닫힌다(또는 제자리).
            // 단추·알약 누르기는 그대로 — 세로로 10dp 이상 끌려(세로가 가로의 1.2배 이상) 끌기가 확정된 순간에만 가로채고, 그 전에는 건드리지 않는다. 손가락 따라가기는 창 높이(위로)와 창 이동(아래로)뿐이라 새 객체가 없다.
            private float dx0, dy0, base; private boolean fired, top0, busy, up; private android.view.VelocityTracker vt;
            private int curH; private float swapOff;                                      // swapOff = 끌다가 시간표가 역 팝업으로 바뀐 순간까지 내려온 거리(그 뒤로는 팝업이 손가락을 따라간다)
            @Override public boolean onInterceptTouchEvent(android.view.MotionEvent e) {
                int a = e.getActionMasked();
                if (busy) return true;
                if (a == android.view.MotionEvent.ACTION_DOWN) {
                    dx0 = e.getRawX(); dy0 = e.getRawY(); fired = false; swapOff = 0f; top0 = sheetView == null || sheetView.scrollPos() <= 0.5f;
                    if (vt == null) vt = android.view.VelocityTracker.obtain(); else vt.clear();
                    vt.addMovement(e);
                } else if (a == android.view.MotionEvent.ACTION_MOVE && !fired) {
                    if (vt != null) vt.addMovement(e);
                    float dy = e.getRawY() - dy0, dx = e.getRawX() - dx0;
                    boolean vert = Math.abs(dy) > Math.abs(dx) * 1.2f && Math.abs(dy) > 10f * dpr;
                    boolean stn = ShellCore.S_MAPSTN.equals(sheetName), tt = ShellCore.S_MAPTT.equals(sheetName);
                    if (vert && (stn || (tt && top0 && dy > 0f))) {
                        fired = true; up = dy < 0f; base = e.getRawY(); curH = Math.round(S_STN_H * dpr);
                        return true;
                    }
                }
                return false;
            }
            @Override public boolean onTouchEvent(android.view.MotionEvent e) {
                if (!fired || busy) return true;
                if (vt != null) vt.addMovement(e);
                int a = e.getActionMasked();
                final android.view.Window w = sheet == null ? null : sheet.getWindow();
                if (w == null) return true;
                final int from = Math.round(S_STN_H * dpr), to = Math.round(getResources().getDisplayMetrics().heightPixels * 0.62f);
                float d = e.getRawY() - base;
                if (a == android.view.MotionEvent.ACTION_MOVE) {
                    if (up && ShellCore.S_MAPSTN.equals(sheetName)) {
                        int h = Math.max(from, Math.min(to, from + Math.round(-d)));
                        if (Math.abs(h - curH) >= 2) { curH = h; try { w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, h); } catch (Throwable ignored) { } }
                    } else if (!up) {
                        if (swapOff == 0f && ShellCore.S_MAPTT.equals(sheetName) && d >= to - from && stationNow(d - (to - from))) swapOff = to - from;      // 시간표가 팝업 높이까지 내려오면 그 자리에서 역 팝업을 다시 만들어 손가락을 이어 따라간다
                        w.getDecorView().setTranslationY(Math.max(0f, d - swapOff));
                    }
                } else if (a == android.view.MotionEvent.ACTION_UP || a == android.view.MotionEvent.ACTION_CANCEL) {
                    float vy = 0f;
                    if (vt != null) { vt.computeCurrentVelocity(1000); vy = vt.getYVelocity(); }
                    boolean cancel = a == android.view.MotionEvent.ACTION_CANCEL;
                    if (up && ShellCore.S_MAPSTN.equals(sheetName)) {
                        if (!cancel && (curH - from >= 28f * dpr || vy < -700f * dpr)) { busy = true; openTimetable(curH, new Runnable() { @Override public void run() { busy = false; } }); }
                        else if (curH > from) { busy = true; animSheetH(curH, from, 180L, new Runnable() { @Override public void run() { busy = false; } }); }
                    } else if (!up) {
                        final android.view.View dv = w.getDecorView();
                        float ty = dv.getTranslationY();
                        boolean tt = ShellCore.S_MAPTT.equals(sheetName);
                        if (!cancel && tt && (ty >= 56f * dpr || vy > 600f * dpr)) {
                            busy = true; backToStation(dv, new Runnable() { @Override public void run() { busy = false; } });          // 웹: 시간표를 내리면 역 팝업이 되돌아온다
                        } else if (!cancel && (ty >= (tt ? 56f : 40f) * dpr || vy > 600f * dpr)) {
                            busy = true;
                            final android.app.Dialog me = sheet;
                            dv.animate().translationY(dv.getHeight() + 40f * dpr).setDuration(Math.round(160f + 80f * Math.max(0f, 1f - ty / Math.max(1f, dv.getHeight())))).setInterpolator(new android.view.animation.PathInterpolator(0.4f, 0f, 0.2f, 1f))
                                .withEndAction(new Runnable() { @Override public void run() { busy = false; if (sheet == me) closeSheet(); } }).start();       // 웹 _NM_SHEET_OUT(.24초 · 0.4,0,0.2,1)
                        } else if (ty > 0f) {
                            busy = true;
                            dv.animate().translationY(0f).setDuration(180L).setInterpolator(new android.view.animation.PathInterpolator(0f, 0f, 0.58f, 1f))
                                .withEndAction(new Runnable() { @Override public void run() { busy = false; } }).start();                     // 웹 _nmFullSnap(.18초 · 0,0,.58,1)
                        }
                    }
                    fired = false;
                }
                return true;
            }
        };
        box.addView(sv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        playView = new PlayView(this, dpr);                                           // 역 이름 옆 빈 칸의 캐릭터 놀이터(웹 #nmPopPlay · #nmTtPlay) — 화면 글 위에 얹고, 만져지지 않는다
        box.addView(playView, new FrameLayout.LayoutParams(1, 1, android.view.Gravity.TOP | android.view.Gravity.LEFT));
        final android.view.View hd = new android.view.View(this);
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setColor(ShellCore.theme(store).equals("dark") ? 0xFF555555 : 0xFFC3D6E6); g.setCornerRadius(2f * dpr);
        hd.setBackground(g);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Math.round(40f * dpr), Math.round(4f * dpr), android.view.Gravity.TOP | android.view.Gravity.CENTER_HORIZONTAL);
        lp.topMargin = Math.round(16f * dpr);
        box.addView(hd, lp);
        final float[] y0 = new float[1];
        android.view.View grab = new android.view.View(this);                         // 손잡이 둘레(위 44dp)에서 아래로 끌면 닫힌다
        grab.setOnTouchListener(new android.view.View.OnTouchListener() {
            @Override public boolean onTouch(android.view.View v, android.view.MotionEvent e) {
                if (e.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) { y0[0] = e.getRawY(); return true; }
                if (e.getActionMasked() == android.view.MotionEvent.ACTION_MOVE && e.getRawY() - y0[0] > 40f * dpr) { y0[0] = Float.MAX_VALUE; closeSheet(); return true; }
                return true;
            }
        });
        box.addView(grab, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(44f * dpr), android.view.Gravity.TOP));
        return box;
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
    private void openTimetable() { openTimetable(Math.round(S_STN_H * dpr), null); }
    /** 시간표로 커진다. fromPx = 지금 창 높이(손가락이 끌어 올린 만큼에서 이어서 올라간다), done = 끝난 뒤 할 일. */
    private void openTimetable(int fromPx, final Runnable done) {
        if (sheet == null) { if (done != null) done.run(); return; }
        final int to = Math.round(getResources().getDisplayMetrics().heightPixels * 0.62f);
        int span = Math.max(1, to - Math.round(S_STN_H * dpr));
        float rest = Math.max(0f, Math.min(1f, (to - fromPx) / (float) span));
        animSheetH(fromPx, to, Math.round(120f + 180f * rest), done);
        if (mapView != null) { mapView.setCover(to); mapView.ensureVisible(map.stn); }          // 시간표가 더 높이 덮으니 역이 그 위 영역 안에 오게(웹은 지도 사각형을 시트 끝까지로 줄인다)                    // 남은 거리에 비례(전부 남았으면 .3초 — 웹 시트 올라오기)
        sheetName = ShellCore.S_MAPTT;
        ttRender();
        ttFetch();
    }
    /**
     * 시간표를 아래로 내리면 역 팝업이 되돌아온다(웹 nmTtOpen 의 backOK). 시간표는 손가락이 놓인 자리에서 팝업 자리까지 내려가며 옅어지고(.2초),
     * 그 자리에서 창을 팝업 높이로 줄여 본 역 화면(캐시)을 채운 뒤 또렷하게 나타난다. 캐시가 없으면 팝업을 새로 연다. done = 끝난 뒤 할 일.
     */
    private void backToStation(final android.view.View dv, final Runnable done) {
        final android.app.Dialog me = sheet; final ScreenView sv = sheetView;
        if (me == null || sv == null) { if (done != null) done.run(); return; }
        final String json = map.stnRequest(ShellCore.CAP, ShellCore.theme(store));
        final String cached = stnCache.get(json);
        if (cached == null) { if (done != null) done.run(); closeSheet(); openMapSheet(S_STN_H); return; }
        map.ttSeq++;                                                                       // 늦게 오는 시간표 답이 이 화면을 덮지 않게
        final int from = Math.round(S_STN_H * dpr), to = Math.round(getResources().getDisplayMetrics().heightPixels * 0.62f);
        final android.view.animation.PathInterpolator ez = new android.view.animation.PathInterpolator(0.4f, 0f, 0.2f, 1f);
        sv.animate().alpha(0f).setDuration(200L).setInterpolator(ez).start();
        dv.animate().translationY(Math.max(0, to - from)).setDuration(200L).setInterpolator(ez).withEndAction(new Runnable() {
            @Override public void run() {
                try {
                    if (sheet != me || sheetView != sv) return;
                    map.onStn(cached); map.setLinesFromStn(cached); sv.setScreen(parsedGet(cached), false);
                    sheetName = ShellCore.S_MAPSTN;
                    me.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, from);
                    dv.setTranslationY(0f);
                    if (mapView != null) { mapView.setCover(from); mapView.ensureVisible(map.stn); }
                    sv.animate().alpha(1f).setDuration(160L).setInterpolator(ez).start();
                    sv.post(new Runnable() { @Override public void run() { if (sv == sheetView) playPlace(); } });
                } catch (Throwable t) { if (sheet == me) closeSheet(); }
                finally { if (done != null) done.run(); }
            }
        }).start();
    }
    /** 끄는 도중 시간표를 그 자리에서 역 팝업으로 바꾼다(손가락 밑 위쪽 가장자리는 그대로 — 창을 팝업 높이로 줄이고 그만큼 덜 내려 놓는다). 캐시가 없으면 false(놓을 때 새로 연다). */
    private boolean stationNow(float tr) {
        final android.app.Dialog me = sheet; final ScreenView sv = sheetView;
        if (me == null || sv == null) return false;
        final String cached = stnCache.get(map.stnRequest(ShellCore.CAP, ShellCore.theme(store)));
        if (cached == null) return false;
        try {
            final int from = Math.round(S_STN_H * dpr);
            map.ttSeq++;                                                                   // 늦게 오는 시간표 답이 이 화면을 덮지 않게
            map.onStn(cached); map.setLinesFromStn(cached); sv.setScreen(parsedGet(cached), false);
            sheetName = ShellCore.S_MAPSTN;
            me.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, from);
            me.getWindow().getDecorView().setTranslationY(Math.max(0f, tr));
            if (mapView != null) { mapView.setCover(from); mapView.ensureVisible(map.stn); }
            sv.setAlpha(0.35f); sv.animate().alpha(1f).setDuration(140L).setInterpolator(new android.view.animation.PathInterpolator(0.4f, 0f, 0.2f, 1f)).start();
            sv.post(new Runnable() { @Override public void run() { if (sv == sheetView) playPlace(); } });
            return true;
        } catch (Throwable t) { return false; }
    }
    /** 시트 창 높이를 부드럽게 바꾼다(웹 시트 곡선). 창이 바뀌었거나 닫혔으면 조용히 멈춘다. */
    private void animSheetH(int a, int b, long ms, final Runnable done) {
        final android.app.Dialog me = sheet;
        if (me == null || a == b) { if (done != null) done.run(); return; }
        try {
            final android.view.Window w = me.getWindow();
            final android.animation.ValueAnimator va = android.animation.ValueAnimator.ofInt(a, b);
            va.setDuration(ms); va.setInterpolator(new android.view.animation.PathInterpolator(0.32f, 0.72f, 0f, 1f));
            va.addUpdateListener(new android.animation.ValueAnimator.AnimatorUpdateListener() { @Override public void onAnimationUpdate(android.animation.ValueAnimator x) { if (sheet != me) { va.cancel(); return; } try { w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, (Integer) x.getAnimatedValue()); } catch (Throwable ignored) { va.cancel(); } } });
            va.addListener(new android.animation.AnimatorListenerAdapter() { @Override public void onAnimationEnd(android.animation.Animator x) { if (done != null) done.run(); } });
            va.start();
        } catch (Throwable ignored) { if (done != null) done.run(); }
    }
    private void ttRender() {
        final String json = map.ttRequest(ShellCore.CAP, ShellCore.theme(store));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    if (sheet == null || !sheet.isShowing() || !ShellCore.S_MAPTT.equals(sheetName) || txt.length() == 0) return;
                    map.onTt(txt);
                    present(sheetView, txt, true);
                    playPlace();
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


    // ═════════════ 노선 상세(웹 busRouteModal): 정류장 줄 + 지금 버스 위치 ═════════════
    // 정류장 목록은 한 번 받으면 7일 동안 기기에 두고(바로 그린다), 버스 위치는 항상 새로 받은 값만 보인다(8초마다 · 이 화면이 앞에 있을 때만).
    // 새 화면이 와도 모양이 같으면 바뀐 줄만 다시 그린다(ScreenView.dirtyOnly). 화면을 벗어나거나 앱이 뒤로 가면 타이머는 즉시 멈춘다.
    private static final long BR_POLL_MS = 8000L, BR_CACHE_MS = 7L * 24L * 3600000L;
    private volatile int brGen; private boolean brShown, brBusy, brTicking, brKeep; private long brAt, brBusyAt;
    private boolean brAlive(int gen) { return gen == brGen && sheet != null && sheet.isShowing() && ShellCore.S_MAPBR.equals(sheetName); }
    private boolean brShowing() { return resumed && brAlive(brGen); }
    private void brStop() { main.removeCallbacks(brTick); brTicking = false; brBusy = false; brGen++; }
    private final Runnable brTick = new Runnable() { @Override public void run() {
        brTicking = false;
        if (!brShowing()) return;                                                       // 앞에 없으면 다시 걸지 않는다 — 돌아오면 brResume 이 건다
        if (brBusy && System.currentTimeMillis() - brBusyAt < 20000L) { brArm(); return; }
        brPoll(); brArm();
    } };
    private void brArm() { if (!brTicking && brShowing()) { brTicking = true; main.postDelayed(brTick, BR_POLL_MS); } }
    private void brResume() {
        if (!brShowing()) return;
        if (System.currentTimeMillis() - brAt > BR_POLL_MS) brPoll();
        brArm();
    }
    private void brPoll() { map.dropPositions(); brBusy = true; brBusyAt = System.currentTimeMillis(); brAt = brBusyAt; brFlight.remove("gp"); brFlight.remove("tp"); brRound(brGen, true); }
    private String[] brCacheGet(String rid) {
        try {
            String raw = store.get("brc_" + rid, "");
            if (raw.length() == 0) return null;
            Object o = ScreenCore.parse(raw);
            if (!(o instanceof Map)) return null;
            Map<?, ?> m = (Map<?, ?>) o;
            Object t = m.get("t");
            if (!(t instanceof Double) || System.currentTimeMillis() - ((Double) t).longValue() > BR_CACHE_MS || !(m.get("s") instanceof java.util.List)) return null;
            return new String[] { HomeSearchCore.toJson(m.get("s")), BoardCore.s(m.get("v"), 6), BoardCore.s(m.get("c"), 4) };
        } catch (Throwable e) { return null; }
    }
    private void brCachePut(MapCore m) {
        String rid = m.brRid;
        if (m.brStnJson.length() == 0 || m.brStnJson.length() > 120000 || rid.length() == 0 || rid.length() > 40) return;
        final String key = "brc_" + rid, val = "{\"t\":" + System.currentTimeMillis() + ",\"v\":" + ShellCore.q(m.brVia) + ",\"c\":" + ShellCore.q(m.brCc) + ",\"s\":" + m.brStnJson + "}";
        if (val.equals(store.get(key, ""))) return;
        String idx = store.get("brc_idx", "");
        java.util.List<String> ids = new ArrayList<String>(java.util.Arrays.asList(idx.length() == 0 ? new String[0] : idx.split(",")));
        ids.remove(rid); ids.add(rid);
        while (ids.size() > 8) store.put("brc_" + ids.remove(0), "");                    // 최근 8개 노선만
        store.put(key, val); store.put("brc_idx", android.text.TextUtils.join(",", ids));
    }
    private void openBusRoute() {
        closeSheet();
        sheetName = ShellCore.S_MAPBR; brShown = false; brKeep = false;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        int[] pal = ShellCore.palette(ShellCore.theme(store));
        sheetView.setPalette(pal);
        sheetView.setListener(new SheetHost());
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_Dialog_NoActionBar);
        sheet.setContentView(sheetView);
        try {
            android.view.Window w = sheet.getWindow();
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            w.setGravity(android.view.Gravity.BOTTOM);
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(pal[ScreenView.R_BG]));
            w.clearFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            w.setWindowAnimations(android.R.style.Animation_InputMethod);
            sheet.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() { @Override public void onDismiss(android.content.DialogInterface d) { brLeft(); } });
            sheet.show(); slideIn(sheetView);
        } catch (Throwable t) { toast("노선도를 열지 못했어요"); return; }
        final int gen = ++brGen;
        double[] seed = liveLL();
        if (seed != null) map.setRouteMe(seed[0], seed[1]);
        String[] c = brCacheGet(map.brRid);
        if (c != null) map.useCachedStations(c[0], c[1], c[2]);                          // 정류장은 기기에 둔 것으로 바로 — 위치는 아래에서 새로 받는다
        brBusy = true; brBusyAt = System.currentTimeMillis(); brAt = brBusyAt; brFlight.clear(); brCached = ""; brRetryN = 0;
        brRound(gen, false);
        brArm();
    }
    /** 화면을 벗어났다(뒤로 · 닫기 · 다른 곳으로): 출발지만 정하고 끝내 도착지를 못 정했으면 고르기 전 상태로 되돌린다(웹 _pickAbandon). */
    private void brLeft() {
        main.removeCallbacks(brTick); brTicking = false; brBusy = false;
        boolean keep = brKeep; brKeep = false;
        if (map.pkName.length() > 0) { if (!keep) home.pickRestore(map.pkName); map.brPickClear(); }
    }
    private int brRetryN;                                                           // 노선 상세를 처음 못 받았을 때 자동으로 다시 해 본 횟수
    private int busRetryN;                                                          // 정류장 도착정보가 비었을 때 자동으로 다시 해 본 횟수(사람이 탭 · 보기를 바꾸면 처음부터)
    private volatile int busBadFetch;                                               // 이번에 받은 도착정보 주소 중 응답이 빈 곳 수
    private volatile int brReq;                                                     // 가장 최근 엔진 요청 번호(늦게 온 옛 답이 새 답을 덮지 않게)
    private final java.util.HashSet<String> brFlight = new java.util.HashSet<String>();     // 지금 받는 중인 주소 열쇠(같은 것을 두 번 받지 않는다)
    private String brCached = "";
    /** 엔진에 지금 상태를 보내 화면을 받는다. 더 받아야 할 주소는 각각 따로 받아, 오는 대로 바로 다시 그린다(정류장 목록이 오면 위치를 기다리지 않고 그린다). */
    private void brRound(final int gen, final boolean poll) {
        final int my = ++brReq;
        final String json = map.brRequest(ShellCore.CAP, ShellCore.theme(store));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    if (!brAlive(gen)) return;
                    if (txt.length() == 0) {
                        if (my == brReq && brFlight.isEmpty()) brBusy = false;
                        if (!brShown && sheetView != null) {                                  // 처음 한 번 못 받았다고 빈 시트로 두지 않는다 — 0.4 · 1.2 · 2.5초 뒤 조용히 다시(세 번까지), 그래도 안 되면 알린다
                            if (brRetryN < 3) { final long wait = brRetryN == 0 ? 400L : brRetryN == 1 ? 1200L : 2500L; brRetryN++; main.postDelayed(new Runnable() { @Override public void run() { if (brAlive(gen) && !brShown) { brBusy = true; brRound(gen, false); } } }, wait); }
                            else toast("노선 정보를 받지 못했어요");
                        }
                        return;
                    }
                    brRetryN = 0;      // 갱신이 실패하면 보던 화면을 그대로 둔다
                    if (my != brReq) return;                                                // 더 새 요청이 이미 나갔다 — 그 답이 이 내용까지 담는다
                    map.onBr(txt);
                    final List<String[]> need = new ArrayList<String[]>(map.brNeed);
                    map.brNeed.clear();
                    if (!(poll && !need.isEmpty())) { present(sheetView, txt, brShown); brShown = true; }       // 위치를 새로 받는 중이면 옛 위치가 그려진 화면 위에 중간 화면을 덮지 않는다
                    for (String[] nd : need) if (brFlight.add(nd[0])) brFetchOne(gen, nd[0], nd[1], poll);
                    if (need.isEmpty() && brFlight.isEmpty()) {
                        brBusy = false;
                        if (!map.brRid.equals(brCached) && map.brStnJson.length() > 0) { brCached = map.brRid; brCachePut(map); }
                    }
                } });
            }
        }, "shell-brr").start();
    }
    private void brFetchOne(final int gen, final String k, final String url, final boolean poll) {
        new Thread(new Runnable() {
            @Override public void run() {
                String u = MapCore.busFetchUrl(url), body = "";
                boolean pos = k.endsWith("p");
                for (int a = 0; a < (pos ? 5 : 2) && u.length() > 0 && body.length() == 0; a++) {        // 웹처럼: 위치는 실패하면 0.8초 뒤 다시(최대 4번 더) · 목록은 빨리 실패했을 때만 한 번 더
                    if (a > 0) { try { Thread.sleep(pos ? 800 : 300); } catch (InterruptedException e) { break; } }
                    if (gen != brGen) return;                                                  // 화면을 벗어났다 — 더 받지 않는다
                    long t0 = System.currentTimeMillis();
                    NetPost.Res r = NetPost.get(u, pos ? 6000 : 9000);
                    body = r.status == 200 && r.body != null ? r.body : "";
                    if (body.length() == 0 && !pos && System.currentTimeMillis() - t0 > 3000L) break;      // 느리게 실패했으면 또 기다리지 않는다
                }
                final String got = body;
                main.post(new Runnable() { @Override public void run() {
                    brFlight.remove(k);
                    if (!brAlive(gen)) return;
                    if (poll && got.length() == 0) { if (brFlight.isEmpty()) brBusy = false; return; }      // 8초 갱신이 비면 버린다 — 보던 위치를 그대로
                    map.addBrRes(k, got);
                    brRound(gen, poll);
                } });
            }
        }, "shell-brf").start();
    }
    private void brRender() { if (sheet != null && brAlive(brGen)) brRound(brGen, false); }
    private void brSheetAct(String v) {
        switch (map.brAct(v)) {
            case MapCore.R_BR_CLOSE: closeSheet(); break;
            case MapCore.R_BR_REFRESH: brBusy = true; brBusyAt = System.currentTimeMillis(); brAt = brBusyAt; brFlight.clear(); brRound(brGen, false); break;
            case MapCore.R_BR_RENDER: brRender(); break;
            case MapCore.R_BR_SAME: toast("출발지와 다른 정류장을 눌러 주세요"); break;
            case MapCore.R_BR_START: {
                String[] r = map.brPicked();
                if (r == null) break;
                home.pickSnap();
                home.setBusStop(HomeCore.START, r[2], r[1], map.brCc, Double.parseDouble(r[4]), Double.parseDouble(r[5]));
                map.brPickStart();
                toast("\uD83D\uDCCD 출발지로 설정되었습니다 · " + r[2]);
                brRender();
                break;
            }
            case MapCore.R_BR_CANCEL:
                home.pickRestore(map.pkName); map.brPickClear(); brRender();
                break;
            case MapCore.R_BR_FINISH: {
                String[] r = map.brPicked();
                if (r == null) break;
                home.setBusStop(HomeCore.DEST, r[2], r[1], map.brCc, Double.parseDouble(r[4]), Double.parseDouble(r[5]));
                home.pickDone(); brKeep = true;
                closeSheet();
                store.put(ShellCore.K_TAB, "home"); showTab("home");
                toast("\uD83C\uDFC1 도착지로 설정되었습니다 · " + r[2]);
                if (home.bothSet()) main.postDelayed(new Runnable() { @Override public void run() { goRoute(); } }, 400);
                break;
            }
            case MapCore.R_BR_TOSTN:
                brKeep = true;
                closeSheet();
                map.cat("m:subway"); reloadMap(true);
                toast("\uD83C\uDFC1 도착지로 설정할 역을 누르세요");
                break;
            default: break;
        }
    }

    private void closeSheet() { if (mapView != null) mapView.setCover(0f); detLoading = null; brStop(); main.removeCallbacks(walkTick); if (playView != null) { playView.end(); playView = null; } try { if (sheet != null) sheet.dismiss(); } catch (Throwable ignored) { } sheet = null; sheetView = null; sheetName = ""; }

    private final class SheetHost implements ScreenView.Listener {
        @Override public void onAction(ScreenCore.Act a) {
            if (ShellCore.S_MAPSTN.equals(sheetName) || ShellCore.S_MAPTT.equals(sheetName)) { if ("call".equals(a.a)) mapSheetAct(a.v); return; }
            if (ShellCore.S_MAPBR.equals(sheetName)) { if ("call".equals(a.a)) brSheetAct(a.v); return; }
            if (ShellCore.S_SETPG.equals(sheetName)) { setPageAct(a.a, a.v, a.key, false); return; }
            if (!"call".equals(a.a)) return;
            if (ShellCore.S_FAV.equals(sheetName)) { favAct(a.v, sheetView == null ? null : sheetView.fields()); return; }
            if (ShellCore.S_DETAIL.equals(sheetName)) { detailAct(a.v); return; }
            if (ShellCore.S_WALK.equals(sheetName)) { walkAct(a.v); return; }
            if ("wr.close".equals(a.v) || "fm.close".equals(a.v)) { closeSheet(); return; }
            if ("wr.submit".equals(a.v)) { submitWrite(); return; }
            String[] ln = food.sheetLink(a.v);
            if (ln != null && "fm.ki".equals(a.v)) { openKakaoPlace(ln); return; }
            if (ln != null) openExternal(ln[0], ln[1]);
        }
        @Override public void onSet(ScreenCore.Act a, boolean on) {
            if (ShellCore.S_SETPG.equals(sheetName)) setPageAct(a.a, a.v, a.key, on);
            else if (ShellCore.S_DETAIL.equals(sheetName) && a != null && "call".equals(a.a)) home.actDetail(a.v);          // 구간 펼침은 화면이 바로 했다 — 펼친 번호만 적어 둔다(다시 그리지 않는다)
        }
        @Override public void onSearch(ScreenCore.Act a, String q) { if (ShellCore.S_SETPG.equals(sheetName) && "cm".equals(setPage) && "call".equals(a.a)) cmAct("call", a.v, null, false, q); }
        @Override public void onInputFocus(boolean on) { }
        @Override public void onFirstDraw() { }
        @Override public void onText(String key, String value, String kind) {
            if (ShellCore.S_SETPG.equals(sheetName) && "cm".equals(setPage)) { if ("cmq".equals(key) && "edit".equals(kind)) { final String cq = value; deb.trailing("cmq", Debounce.TYPE_MS, new Runnable() { @Override public void run() { cmQuery(cq); } }); } return; }
            if (!ShellCore.S_FAV.equals(sheetName)) return;
            if ("blur".equals(kind)) {                                   // 후보 줄을 누르는 동안 잠깐 기다렸다 닫는다
                main.postDelayed(new Runnable() { @Override public void run() { if (ShellCore.S_FAV.equals(sheetName) && fav.endActive()) { fav.sync(sheetView == null ? null : sheetView.fields()); loadFav(); } } }, 250);
                return;
            }
            if (fav.onText(key, value, kind)) { fav.sync(sheetView == null ? null : sheetView.fields()); fav.fs = "fvs".equals(key) ? value : fav.fs; fav.fd = "fvd".equals(key) ? value : fav.fd; if ("edit".equals(kind)) deb.trailing("favq", Debounce.TYPE_MS, new Runnable() { @Override public void run() { if (ShellCore.S_FAV.equals(sheetName)) loadFav(); } }); else loadFav(); }
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
        final boolean chip = homeChip; homeChip = false;
        final String themeNow = ShellCore.theme(store);
        final String resKey = home.dataRev + ":" + home.resTab + ":" + themeNow;
        final java.util.LinkedHashMap<String, String> otherBodies = new java.util.LinkedHashMap<String, String>();               // 다른 탭 결과를 뒤에서 미리 받는다(칩을 누르면 바로 바뀌게)
        if (hasRes && !home.riding()) for (String tb : HomeCore.RTABS) {              // 탑승 중엔 추적이 자주 바뀌므로 미리 받지 않는다
            if ("longdist".equals(tb) || tb.equals(home.resTab)) continue;
            String k2 = home.dataRev + ":" + tb + ":" + themeNow;
            if (resGet(k2) == null) otherBodies.put(k2, tb);                          // 요청 본문은 뒤 스레드에서 만든다(주 스레드에서 큰 글을 여러 번 잇지 않는다)
        }
        final String curTab = home.resTab;
        final long nowH = System.currentTimeMillis();
        hc.ensureNext(nowH);
        hc.rideScene = RideService.running ? RideService.liveScene : "";
        hc.share = RideService.running && RideService.liveShare != null;
        final String hKey = hc.key(home.resRev, home.resTab, nowH, chat.talkCount(), chat.talkMark());
        final String hBody = hKey.equals(hcKey) ? "" : hc.request(ShellCore.CAP, ShellCore.theme(store), homeEnv(), home.resultFacts(homeEnv(), ShellCore.theme(store)), chat.recentTalksJson(8));
        new Thread(new Runnable() {
            @Override public void run() {
                // 경로 결과 · 홈 카드는 홈 화면 응답을 기다리지 않고 함께 받는다(셋이 차례로 걸리던 시간을 가장 느린 하나로)
                final boolean staleCards = hBody.length() > 0 && hcJson.length() > 0;                              // 지난 카드가 있으면 그것을 0초에 먼저 그리고, 새 카드는 뒤에서 받아 바뀐 것만 다시 그린다(SWR)
                final String cachedRes = resGet(resKey), cachedHome = chip ? lruGet(homeCache, json) : null;
                final String[] rsBox = { cachedRes == null ? "" : cachedRes }, cjBox = { hBody.length() == 0 || staleCards ? hcJson : "" };
                Thread tr = null, tc = null;
                if (hasRes && rsBox[0].length() == 0) {
                    tr = new Thread(new Runnable() { @Override public void run() {
                        NetPost.Res rr = NetPost.post(ShellCore.BASE + "/screen/result", resBody, 15000);
                        rsBox[0] = rr.status == 200 && rr.body != null ? rr.body : "";
                        if (rsBox[0].length() > 0) resPut(resKey, rsBox[0]);
                    } }, "shell-home-res");
                    tr.start();
                }
                for (final java.util.Map.Entry<String, String> ob : otherBodies.entrySet()) {
                    synchronized (resFly) { if (!resFly.add(ob.getKey())) continue; }
                    final String pat = ",\"tab\":\"" + curTab + "\",\"a\":";
                    final int at = resBody.lastIndexOf(pat);
                    if (at < 0) { synchronized (resFly) { resFly.remove(ob.getKey()); } continue; }
                    final String body2 = resBody.substring(0, at) + ",\"tab\":\"" + ob.getValue() + "\",\"a\":" + resBody.substring(at + pat.length());          // 같은 사실에 탭만 바꾼다
                    new Thread(new Runnable() { @Override public void run() {
                        try {
                            NetPost.Res rr = NetPost.post(ShellCore.BASE + "/screen/result", body2, 15000);
                            if (rr.status == 200 && rr.body != null && rr.body.length() > 0) resPut(ob.getKey(), rr.body);
                        } finally { synchronized (resFly) { resFly.remove(ob.getKey()); } }
                    } }, "shell-home-res-pre").start();
                }
                if (hBody.length() > 0) {
                    tc = new Thread(new Runnable() { @Override public void run() {
                        NetPost.Res cr = NetPost.post(ShellCore.BASE + "/screen/hcards", hBody, 15000);
                        String nj = cr.status == 200 && cr.body != null ? cr.body : "";
                        if (staleCards) {
                            if (nj.length() > 0) { boolean same = nj.equals(hcJson); hcKey = hKey; hcJson = nj; if (!same) main.post(new Runnable() { @Override public void run() { if (homeVisible()) reloadHome(); } }); }
                            return;
                        }
                        cjBox[0] = nj;
                        if (cjBox[0].length() > 0) { hcKey = hKey; hcJson = cjBox[0]; }
                    } }, "shell-home-cards");
                    tc.start();
                }
                String txt;
                if (cachedHome != null) txt = cachedHome;                                                     // 칩만 바꿨다 — 검색 영역은 그대로라 서버에 다시 묻지 않는다
                else {
                    NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/home", json, 8000);
                    txt = r.status == 200 && r.body != null ? r.body : "";
                    if (txt.length() > 0) lruPut(homeCache, json, txt, 6);
                }
                try { if (tr != null) tr.join(16000); if (tc != null && !staleCards) tc.join(16000); } catch (InterruptedException ignored) { }
                if (hasRes && txt.length() > 0) {
                    String rs = rsBox[0];
                    if (rs.length() > 0) { final String rsf = rs; txt = ShellCore.mergeBodies(txt, rs); main.post(new Runnable() { @Override public void run() { home.onResult(rsf); chat.routeSec = home.resSec; maybeFetchNotes(); } }); }
                    else main.post(new Runnable() { @Override public void run() { toast("경로 결과를 그리지 못했어요"); } });
                }
                if (txt.length() > 0 && cjBox[0].length() > 0) txt = ShellCore.mergeBodies(txt, cjBox[0]);        // 홈 카드 3장(AI 승무원 · 혼잡도 · 실시간 대화)
                final String fin = txt; warm(fin);
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
        if (sh == null) { dlgPopSh("경로를 먼저 탐색해 주세요", "탐색한 경로의 내 위치와 도착 예정을\n친구에게 보낼 수 있어요"); return; }      // 웹 _shareLoc 과 같은 안내(엔진 카드)
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
    /** 홈 카드(AI 승무원 브리핑)의 '내 위치': 0초에 저장된 위치로 먼저 채우고, 곧이어 Play 서비스가 아는 위치(0.1초) → 새 위치(약 1초)로 바로잡는다.
     *  처음 채워질 때와 300m 넘게 움직였을 때만 홈을 다시 그린다. */
    private void hcFixFrom(double la, double lo) {
        long now = System.currentTimeMillis();
        boolean first = hc.fix == null, far = !first && (Math.abs(hc.fix[0] - la) > 0.003 || Math.abs(hc.fix[1] - lo) > 0.003);
        if (!first && !far) { hc.fixAt = now; return; }
        hc.setFix(la, lo, now);
        if (homeVisible()) reloadHome();
    }
    private void quietFix() {
        long now = System.currentTimeMillis();
        if (hc.fix != null && now - hc.fixAt < 10 * 60000L) return;
        double[] seed = liveLL();
        if (seed == null) seed = ShellCore.lastLocFresh(store, 6L * 3600000L, now);        // 몇 시간 안에 안 위치면 우선 그것으로 브리핑을 채운다(곧 새 위치로 바로잡힌다)
        if (seed != null && hc.fix == null) { hc.setFix(seed[0], seed[1], now - 9 * 60000L); }            // 처음 그릴 때 이미 들어가 있게(다시 그리지 않는다) — 1분 뒤 새로 확인
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        locateNow(8000L, 1000L, 60000L, 120000L, new LocCb() {
            @Override public void fix(Location l) { hcFixFrom(l.getLatitude(), l.getLongitude()); }
            @Override public void fail(boolean noperm) { }
        });
    }
    private void reloadHome() { if (ShellCore.S_HOME.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadHome(body, true); }

    private void homeText(final String key, String value, String kind) {
        final int f = "dest".equals(key) ? HomeCore.DEST : HomeCore.START;
        if ("blur".equals(kind)) {                       // 후보 줄을 누르는 동안 잠깐 기다렸다 닫는다
            main.postDelayed(new Runnable() { @Override public void run() { home.endActive(f); reloadHome(); } }, 250);
            return;
        }
        if (!home.onText(key, value, kind)) return;
        if ("edit".equals(kind)) {                       // 글자를 치는 동안은 기다렸다가, 멈춘 뒤 한 번만 후보를 받고 다시 그린다(디바운스)
            deb.trailing("homeq", Debounce.TYPE_MS, new Runnable() { @Override public void run() { fetchCands(); reloadHome(); } });
            return;
        }
        fetchCands();
        reloadHome();
    }

    /** 눌려 있는 칸의 글자에 대한 버스정류장·장소 후보를 받아 온다(글이 같으면 다시 받지 않는다). */
    private void fetchCands() {
        final String q = home.wantQuery();
        if (q.length() == 0) return;
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res rb = NetPost.get(HomeSearchCore.busUrl(HomeSearchCore.BUS_BASE, q), 6000);
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
        deb.cancel("homeq");                             // 후보를 고르거나 버튼을 눌렀다 — 기다리던 입력 갱신은 필요 없다
        int r = home.act(v, fields);
        switch (r) {
            case HomeCore.R_RESULT: homeChip = true; reloadHome(); break;
            case HomeCore.R_FAV: openFavSheet(); break;
            case HomeCore.R_LD: ldReselect(); break;
            case HomeCore.R_ROOM: goRoom(); break;
            case HomeCore.R_DETAIL: openDetailSheet(); break;
            case HomeCore.R_STOP: stopRide(); break;
            case HomeCore.R_SLOT: rideSlot(); break;
            case HomeCore.R_CONFIRM: startRide(); break;
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
        if (!deb.gate("gps", 1200L)) return;               // 내 위치 버튼 연타 — 한 번만(권한을 받는 순간은 막지 않는다)
        home.gps = true; reloadHome();
        Location recent = liveRecent(30000L);
        if (recent != null) gotGps(recent);                                      // 방금 받은 현재 위치는 0초에 먼저 채우고
        locateNow(12000L, 1000L, 2500L, 60000L, new LocCb() {                     // 곧바로 새로 받은 현재 위치(약 1초)로 바로잡는다
            @Override public void fix(Location l) { gotGps(l); }
            @Override public void fail(boolean noperm) { if (!home.gps) return; home.gps = false; toast("현재 위치를 찾지 못했어요"); reloadHome(); }
        });
    }
    private void gotGps(Location l) {
        saveLoc(l);
        HomeCore.Loc cur = home.loc[HomeCore.START];
        if (!home.gps) {                                                               // 이미 내 위치로 잡혀 있다 — 더 정확한 위치가 90m 넘게 다를 때만 다시 잡는다
            if (cur == null || !"gps".equals(cur.type) || (Math.abs(cur.lat - l.getLatitude()) < 0.0008 && Math.abs(cur.lng - l.getLongitude()) < 0.0008)) return;
        }
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
        if (ok) { startGps(); launchLocate(); } else toast("위치 권한이 필요해요");
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
    // ───────────── 엔진이 그리는 가운데 안내 카드(웹 _ndlg: 종료 확인 · 신고 확인 · 권한 안내 · 작은 알림) ─────────────
    // 글 · 단추 이름 · 카드 크기/위치/흐림/모서리는 엔진(/screen/dlg)이 정한다. 앱은 받은 카드를 띄우고 단추(dl.ok · dl.no · dl.close)를 되돌려 줄 뿐이다.
    // 고정 카드(exit · report · perm)는 켜자마자 미리 받아 두고(prefetch), 없으면 이전 방식(시스템 확인창 · 바로 닫기)으로 대신한다 — 눌렀을 때 기다리지 않는다.
    private final java.util.concurrent.ConcurrentHashMap<String, String> dlgJson = new java.util.concurrent.ConcurrentHashMap<String, String>();
    private android.app.Dialog dlgD;
    private ScreenView dlgV;
    private Runnable dlgOk, dlgNo, dlgAuto;
    private boolean dlgFetch(String kind) {
        if (dlgJson.containsKey(kind)) return false;
        NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/dlg", "{\"cap\":" + ShellCore.CAP + ",\"f\":{\"kind\":" + ShellCore.q(kind) + "}}", 8000);
        if (r.status == 200 && r.body != null && r.body.length() > 2) dlgJson.put(kind, r.body);
        return true;
    }
    /** 미리 받아 둔 고정 카드를 띄운다. 못 띄웠으면(아직 못 받음 · 이미 떠 있음) false — 부르는 쪽이 이전 방식으로 대신한다. */
    private boolean dlgKind(String kind, Runnable ok, Runnable no) {
        String js = dlgJson.get(kind);
        if (js == null) { final String k = kind; Thread t = new Thread(new Runnable() { @Override public void run() { dlgFetch(k); } }, "shell-dlg"); t.setDaemon(true); t.start(); return false; }
        return dlgOpen(js, ok, no, 0L);
    }
    private int dlgColor(String c, int[] pal) {
        if ("card".equals(c) || c == null || c.length() == 0) return pal[ScreenView.R_CARD];
        if ("bg".equals(c)) return pal[ScreenView.R_BG];
        if ("card2".equals(c)) return pal[ScreenView.R_CARD2];
        return ScreenCore.color(c, pal[ScreenView.R_CARD]);
    }
    private boolean dlgOpen(String json, Runnable ok, Runnable no, long autoMs) {
        if (isFinishing() || (dlgD != null && dlgD.isShowing())) return false;
        try {
            final ScreenCore.Screen sc = parsedGet(json);
            final ScreenCore.Dlg dg = sc.dlg;
            if (dg == null) return false;
            final int[] pal = ShellCore.palette(ShellCore.theme(store));
            final ScreenView v = new ScreenView(this);
            v.setDpr(dpr); v.setPalette(pal);
            final android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
            final float sw = dm.widthPixels / dpr, sh = dm.heightPixels / dpr;
            final float maxW = Math.max(120f, Math.min(dg.w, sw - 2f * dg.mx));
            final android.app.Dialog d = new android.app.Dialog(this, android.R.style.Theme_Material_Light_Dialog_NoActionBar);
            final android.view.Window w = d.getWindow();
            v.setListener(new ScreenView.Listener() {
                @Override public void onAction(ScreenCore.Act a) { dlgAct(a == null ? "" : a.v, d); }
                @Override public void onSet(ScreenCore.Act a, boolean on) { }
                @Override public void onSearch(ScreenCore.Act a, String q) { }
                @Override public void onInputFocus(boolean on) { }
                @Override public void onFirstDraw() { }
                @Override public void onText(String key, String value, String kind) { }
                @Override public void onContentH(final float dp) {
                    main.post(new Runnable() { @Override public void run() {
                        try {
                            if (dlgV != v || dp <= 0f) return;
                            float ww = dg.fit && v.fitWidthDp() > 0f ? Math.min(maxW, v.fitWidthDp()) : maxW, hh = Math.min(dp, sh * dg.maxh);
                            android.view.WindowManager.LayoutParams lp = w.getAttributes();
                            lp.width = Math.round(ww * dpr); lp.height = Math.round(hh * dpr);
                            if (Math.abs(dg.top - 0.5f) < 0.01f) { lp.gravity = android.view.Gravity.CENTER; lp.y = 0; }            // 화면 가운데
                            else { lp.gravity = android.view.Gravity.TOP | android.view.Gravity.CENTER_HORIZONTAL; lp.y = Math.round((sh * dg.top - hh / 2f) * dpr); }
                            w.setAttributes(lp);
                        } catch (Throwable ignored) { }
                    } });
                }
            });
            FrameLayout box = new FrameLayout(this);
            android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
            g.setColor(dlgColor(dg.fill, pal)); g.setCornerRadius(dg.r * dpr);
            box.setBackground(g);
            if (Build.VERSION.SDK_INT >= 21) box.setClipToOutline(true);
            box.addView(v, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            d.setContentView(box);
            final boolean tapOut = dg.tap != null || autoMs > 0L;
            d.setCancelable(true); d.setCanceledOnTouchOutside(tapOut);
            d.setOnCancelListener(new android.content.DialogInterface.OnCancelListener() { @Override public void onCancel(android.content.DialogInterface di) { dlgAct("dl.no", d); } });
            w.setLayout(Math.round(maxW * dpr), Math.round(100f * dpr));                       // 높이 · 너비는 엔진 화면이 정한 글 크기로 곧 맞춘다(onContentH)
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0x00000000));
            if (dg.dim > 0f) { w.addFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND); w.setDimAmount(dg.dim); }
            else w.clearFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            dlgV = v; dlgD = d; dlgOk = ok; dlgNo = no;
            v.setScreen(sc, false);
            d.show();
            if (autoMs > 0L) { dlgAuto = new Runnable() { @Override public void run() { dlgAct("dl.close", d); } }; main.postDelayed(dlgAuto, autoMs); }
            return true;
        } catch (Throwable t) { dlgD = null; dlgV = null; return false; }
    }
    /** 카드의 단추: dl.ok → 확인 쪽 · 그 밖(dl.no · dl.close · 바깥 · 뒤로)은 취소 쪽. 한 번만 처리한다. */
    private void dlgAct(String v, android.app.Dialog d) {
        if (d != dlgD) return;
        Runnable ok = "dl.ok".equals(v) ? dlgOk : null, no = "dl.ok".equals(v) ? null : dlgNo;
        if (dlgAuto != null) { main.removeCallbacks(dlgAuto); dlgAuto = null; }
        dlgD = null; dlgV = null; dlgOk = null; dlgNo = null;
        try { d.dismiss(); } catch (Throwable ignored) { }
        if (ok != null) ok.run(); else if (no != null) no.run();
    }
    /** 값이 정해진 작은 알림(웹 _pickPop · 이 기능은 글만 바뀐다): 엔진에서 받아 잠깐 띄우고, 못 받으면 시스템 확인창. */
    private void dlgPopSh(final String msg, final String sub) {
        new Thread(new Runnable() { @Override public void run() {
            NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/dlg", "{\"cap\":" + ShellCore.CAP + ",\"f\":{\"kind\":\"pop\",\"msg\":" + ShellCore.q(msg) + ",\"sub\":" + ShellCore.q(sub) + ",\"cls\":\"sh\"}}", 6000);
            final String txt = r.status == 200 && r.body != null ? r.body : "";
            main.post(new Runnable() { @Override public void run() {
                if (txt.length() > 2 && dlgOpen(txt, null, null, 2800L)) return;
                try { new AlertDialog.Builder(ShellActivity.this, android.R.style.Theme_Material_Light_Dialog_Alert).setTitle(msg).setMessage(sub).setPositiveButton("확인", null).show(); } catch (Throwable ignored) { }
            } });
        } }, "shell-dlg-pop").start();
    }

    // ───────────── 경로 탐색 로딩 카드(웹 #transitLoading) ─────────────
    // 카드 모양 · 글은 엔진(/screen/dlg kind:rload)이 정하고 뛰어가는 캐릭터는 ScreenView 의 runner 노드가 그린다. 앱은 보이고 숨기기만 한다.
    // 새로 받는 통신이 있고 보여 줄 옛 결과가 없을 때만 뜬다(SWR 로 이미 보이면 뜨지 않는다). 못 받았으면 카드 없이 기존 안내(토스트)만.
    private volatile String rloadJson = "";
    private android.app.Dialog rloadDlg;
    private ScreenView rloadView;
    private int rloadSeq;
    private boolean rloadFetch() {
        if (rloadJson.length() > 0) return false;
        NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/dlg", "{\"cap\":" + ShellCore.CAP + ",\"f\":{\"kind\":\"rload\"}}", 8000);
        if (r.status == 200 && r.body != null && r.body.length() > 2) rloadJson = r.body;
        return true;
    }
    private final Runnable rloadSafety = new Runnable() { @Override public void run() { rloadHide(); reloadHome(); } };
    private void rloadShow() {
        String js = rloadJson;
        if (js.length() == 0) { Thread t = new Thread(new Runnable() { @Override public void run() { rloadFetch(); } }, "shell-rload"); t.setDaemon(true); t.start(); return; }   // 이번엔 카드 없이 — 다음부터
        if (isFinishing() || (rloadDlg != null && rloadDlg.isShowing())) return;
        try {
            final int[] pal = ShellCore.palette(ShellCore.theme(store));
            final ScreenView v = new ScreenView(this);
            v.setDpr(dpr); v.setPalette(pal);
            v.setListener(new ScreenView.Listener() {
                @Override public void onAction(ScreenCore.Act a) { }
                @Override public void onSet(ScreenCore.Act a, boolean on) { }
                @Override public void onSearch(ScreenCore.Act a, String q) { }
                @Override public void onInputFocus(boolean on) { }
                @Override public void onFirstDraw() { }
                @Override public void onText(String key, String value, String kind) { }
                @Override public void onContentH(final float dp) {
                    main.post(new Runnable() { @Override public void run() {
                        try { if (rloadDlg != null && rloadView == v && dp > 0f) rloadDlg.getWindow().setLayout(Math.round(296f * dpr), Math.round(dp * dpr)); } catch (Throwable ignored) { }
                    } });
                }
            });
            final android.app.Dialog d = new android.app.Dialog(this, android.R.style.Theme_Material_Light_Dialog_NoActionBar);
            FrameLayout box = new FrameLayout(this);
            android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
            g.setColor(pal[ScreenView.R_CARD]); g.setCornerRadius(20f * dpr);
            box.setBackground(g);
            if (Build.VERSION.SDK_INT >= 21) box.setClipToOutline(true);
            box.addView(v, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            d.setContentView(box);
            d.setCancelable(false); d.setCanceledOnTouchOutside(false);
            android.view.Window w = d.getWindow();
            w.setLayout(Math.round(296f * dpr), Math.round(RUN_CARD_H * dpr));                     // 높이는 엔진 화면이 정한 글 높이로 곧 맞춘다(onContentH)
            w.setGravity(android.view.Gravity.CENTER);
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0x00000000));
            w.addFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            w.setDimAmount(0.7f);                                                                  // 웹 rgba(0,0,0,.7)
            rloadView = v; rloadDlg = d;
            v.setScreen(parsedGet(js), false);
            d.show();
            main.removeCallbacks(rloadSafety); main.postDelayed(rloadSafety, 50000L);           // 통신이 어떻게 끝나든 50초 뒤에는 반드시 닫는다
        } catch (Throwable t) { rloadDlg = null; rloadView = null; }
    }
    private static final float RUN_CARD_H = 24f + ScreenCore.RUN_H + 22f;
    private void rloadHide() {
        main.removeCallbacks(rloadSafety);
        home.routing = false;
        android.app.Dialog d = rloadDlg; rloadDlg = null; rloadView = null;
        if (d != null) { try { d.dismiss(); } catch (Throwable ignored) { } RunnerArt.release(); }
    }

    private void goRoute() {
        final boolean picked = home.baseMs >= 0;
        final long base = picked ? home.baseMs : System.currentTimeMillis();
        final String qs = HomeCore.routeQuery(home.loc[HomeCore.START], home.loc[HomeCore.DEST], base, picked);
        if (qs == null) { toast("출발지와 도착지를 목록에서 골라 주세요"); return; }
        final String url = HomeCore.routeUrl(qs), a = home.text[HomeCore.START], b = home.text[HomeCore.DEST];
        final long bt = picked ? base : -1, rb = System.currentTimeMillis();
        if (!deb.gate("route", 800L)) return;                                       // 검색 버튼 연타 — 한 번만
        final String sk = HomeCore.routeSwrKey(qs, picked, base);
        // SWR: 같은 출발·도착을 다시 찾으면 지난 결과를 0초에 먼저 보인다. 8초 안이면 그대로 쓰고, 지났으면 뒤에서 새로 받아 조용히 바꾼다.
        final Swr.Hit hit = routeSwr.get(sk, rb, ROUTE_FRESH_MS, ROUTE_STALE_MS);
        boolean shown0 = false;
        if (hit.state != Swr.MISS) {
            int nl = hit.body.indexOf('\n'); long rb0 = rb;
            if (nl > 0) { try { rb0 = Long.parseLong(hit.body.substring(0, nl)); } catch (NumberFormatException ignored) { nl = -1; } }
            if (nl > 0 && home.setRoute(hit.body.substring(nl + 1), a, b, bt, rb0)) { shown0 = true; reloadHome(); } else routeSwr.drop(sk);
        }
        final boolean shown = shown0;
        if (shown && hit.state == Swr.FRESH) { home.lastQs = qs; return; }          // 방금 받은 결과 — 통신 없이 끝
        final int my = ++seqRoute;
        home.lastQs = qs;
        if (!shown) { if (rloadJson.length() == 0) toast("경로를 찾는 중이에요"); home.routing = true; reloadHome(); rloadShow(); }       // 찾는 동안만 단추가 돈다(엔진이 그린다)
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r1 = NetPost.get(RouteFetchCore.liveZero(url), 15000);
                String b1 = (r1.status == 200 && r1.body != null) ? r1.body : "";
                Map<String, Object> fo = RouteFetchCore.extractFollow(b1);
                boolean draw = b1.length() > 2 && RouteFetchCore.draws(fo);
                boolean full1 = draw && !RouteFetchCore.wantsFull(fo);
                if (draw && (full1 || !shown)) postRoute(my, b1, a, b, bt, rb, full1 ? sk : null);       // 옛 결과가 떠 있으면 근사 결과로 덮지 않고 전체를 기다린다
                if (!draw || RouteFetchCore.wantsFull(fo)) {
                    NetPost.Res r2 = NetPost.get(url, 30000);
                    String b2 = (r2.status == 200 && r2.body != null) ? r2.body : "";
                    if (b2.length() > 2) { postRoute(my, b2, a, b, bt, rb, sk); fo = RouteFetchCore.extractFollow(b2); }
                    else if (!draw) { postFail(my, shown); return; }
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
                    if (b.length() > 2 && b.charAt(0) == '{' && b.charAt(b.length() - 1) == '}') { home.ld2Raw = b; home.touch(); reloadHome(); }
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
                    final boolean inDetail = sheet != null && sheet.isShowing() && ShellCore.S_DETAIL.equals(sheetName);
                    toast(HomeCore.optName(home.resTab) + " 경로로 확정했어요");                    // 웹 confirmSelectedRoute 토스트
                    ovlHintOnce();
                    if (inDetail) {                                                              // 웹: 단추가 초록 '확정됨' 으로 바뀌고 0.6초 뒤 시트가 닫힌다
                        loadDetail();
                        main.postDelayed(new Runnable() { @Override public void run() { if (sheet != null && ShellCore.S_DETAIL.equals(sheetName)) closeSheet(); } }, 600L);
                    } else closeSheet();
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
    /** 웹 _pipArmNow: 오버레이 권한이 없으면 한 번만 알려 준다(다른 앱을 보면서도 내 위치를 보려면 필요). */
    private void ovlHintOnce() {
        try {
            if (RideOverlay.supported() && !RideOverlay.allowed(this) && "1".equals(store.get(ShellCore.K_OVL, "0")) && !"1".equals(store.get(ShellCore.K_OVLHINT, "0"))) {
                store.put(ShellCore.K_OVLHINT, "1");
                main.postDelayed(new Runnable() { @Override public void run() { toast("다른 앱을 보면서도 내 위치를 보려면 설정 > '다른 앱 위에 표시'를 켜세요"); } }, 1800L);
            }
        } catch (Throwable ignored) { }
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
    /** 경로 카드 버튼 줄 오른쪽 칸(탑승 · 환승 · 도착): 칸의 뜻은 엔진이 정했다. 탑승·환승 = 탑승 시트의 [탑승]과 같은 확정, 도착 = 안내 종료. */
    private void rideSlot() {
        String sl = RideService.liveRowSlot;
        if ("arrive".equals(sl)) { stopRide(); return; }
        if (!RideService.running || !("board".equals(sl) || "transfer".equals(sl))) return;
        if (RideService.liveRowCan) { RideService.rsAct("press"); if (tabs != null) tabs.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP); }
        else toast("앞 구간을 내린 뒤에 눌러 주세요");
    }
    private void stopRide() {
        store.put(ShellCore.K_RIDESNAP, "");
        RideService.stop(this);
        rideGraceUntil = 0L;
        home.setRide("", "");
        reloadHome();
        toast("탑승 안내를 끝냈어요");
        main.postDelayed(new Runnable() { @Override public void run() { openWalkSheet("arrive"); } }, 1200L);        // 웹 _tryWalkAutoArrive: 하차 1.2초 뒤 도보 안내
    }
    /** 서비스가 엔진에게서 받은 상태(상주 글 · 내 위치)를 결과 카드에 옮긴다. */
    private void pollRide() {
        if (!home.riding()) return;
        if (!RideService.running && System.currentTimeMillis() < rideGraceUntil) return;       // 서비스가 막 켜지는 중
        if (home.setRide(RideService.liveRide, RideService.liveLv)) reloadHome();
    }

    // ───────────── 도보 안내 시트(웹 walkModal) ─────────────
    // 거리 · 시간 · 기준 시각 · 길안내 주소는 엔진(/screen/dlg kind:walk)이 정한다. 여기는 내 위치를 받아 보내고 받은 화면을 그린다. 30초마다 다시 받는다.
    private final WalkCore walk = new WalkCore();
    private int walkSeq;
    private final Runnable walkTick = new Runnable() { @Override public void run() { if (walkOpen()) walkRefresh(); } };
    private boolean walkOpen() { return sheet != null && sheet.isShowing() && ShellCore.S_WALK.equals(sheetName); }
    private void openWalkSheet(String mode) {
        HomeCore.Loc d = home.loc[HomeCore.DEST];
        if (d == null || d.name.length() == 0 || isFinishing()) return;
        closeSheet();
        walk.open(mode, d.name, d.lat, d.lng);
        sheetName = ShellCore.S_WALK;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        final int[] pal = ShellCore.palette(ShellCore.theme(store));
        sheetView.setPalette(pal);
        sheetView.setListener(new SheetHost());
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_Dialog_NoActionBar);
        FrameLayout box = new FrameLayout(this);                                       // 웹 카드: 위쪽 모서리 20 · 너비 520 까지
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setColor(pal[ScreenView.R_CARD]); float r = 20f * dpr; g.setCornerRadii(new float[] { r, r, r, r, 0f, 0f, 0f, 0f });
        box.setBackground(g);
        if (Build.VERSION.SDK_INT >= 21) box.setClipToOutline(true);
        box.addView(sheetView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        sheet.setContentView(box);
        try {
            android.view.Window w = sheet.getWindow();
            int wpx = Math.min(getResources().getDisplayMetrics().widthPixels, Math.round(520f * dpr));
            w.setLayout(wpx, Math.round(WALK_SHEET_H * dpr));
            w.setGravity(android.view.Gravity.BOTTOM);
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0x00000000));
            w.addFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            w.setDimAmount(0.8f);
            w.setWindowAnimations(android.R.style.Animation_InputMethod);
            sheet.show(); slideIn(sheetView);
        } catch (Throwable t) { toast("도보 안내를 열지 못했어요"); sheet = null; sheetView = null; sheetName = ""; return; }
        walkRefresh();
    }
    private static final int WALK_SHEET_H = 262;
    /** 내 위치를 받아(권한이 없거나 못 받으면 - 로 그린다 — 옛 위치는 쓰지 않는다) 엔진에게 다시 그려 달라고 한다. 같은 때 겹쳐도 가장 나중 것만 쓴다. */
    private void walkRefresh() {
        final int seq = ++walkSeq;
        main.removeCallbacks(walkTick);
        if (!hasLocPerm()) { walkLoad(seq); return; }          // 옛 위치는 쓰지 않는다 — 위치가 없으면 엔진이 - 로 그린다
        locateNow(8000L, 2000L, 20000L, new LocCb() {
            @Override public void fix(Location l) { if (seq != walkSeq) return; walk.setMe(l.getLatitude(), l.getLongitude()); walkLoad(seq); }
            @Override public void fail(boolean noperm) { if (seq != walkSeq) return; walkLoad(seq); }
        });
    }
    private void walkLoad(final int seq) {
        if (!walkOpen()) return;
        HomeCore.Env e = homeEnv();
        final String body = walk.request(ShellCore.CAP, e.nowMs, e.tzoMin, ShellCore.theme(store));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/dlg", body, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (seq != walkSeq || !walkOpen()) return;
                    if (txt.length() > 0) { walk.onScreen(txt); present(sheetView, txt, false); }
                    else if (!walk.hasMe) toast("도보 안내를 받지 못했어요");
                    main.postDelayed(walkTick, walk.refreshMs);
                } });
            }
        }, "shell-walk").start();
    }
    private void walkAct(String v) {
        switch (walk.act(v)) {
            case WalkCore.W_CLOSE: closeSheet(); break;
            case WalkCore.W_KAKAO: if (walk.navKakao != null) openNav(walk.navKakao); else toast(walk.msg.length() > 0 ? walk.msg : "목적지 좌표를 찾을 수 없습니다"); break;
            case WalkCore.W_NAVER: if (walk.navNaver != null) openNav(walk.navNaver); else toast(walk.msg.length() > 0 ? walk.msg : "목적지 좌표를 찾을 수 없습니다"); break;
            default: break;
        }
    }

    // ───────────── 세부경로 시트 ─────────────
    private android.widget.TextView detLoading;
    private final java.util.LinkedHashMap<String, String> detCache = new java.util.LinkedHashMap<String, String>();
    /** 웹 transitDetailModal 과 같은 틀: 화면 전체를 0.82 로 어둡게 · 시트는 아래 탭바 위에 떠서 위쪽 모서리 20 · 너비 520 까지 · 머리를 아래로 120dp 넘게 끌면 닫힌다(.25초). 안의 글·단추는 엔진이 정한다. */
    private void openDetailSheet() {
        closeSheet();
        final String json = home.detailRequest(homeEnv(), ShellCore.CAP, ShellCore.theme(store));
        if (json.length() == 0) return;
        sheetName = ShellCore.S_DETAIL;
        final int[] pal = ShellCore.palette(ShellCore.theme(store));
        final ScreenView sv = new ScreenView(this);
        sheetView = sv;
        sv.setDpr(dpr);
        sv.setPalette(pal);
        sv.setListener(new SheetHost());
        sv.setParentIntercept(true);
        boolean filled = false;
        final String cached = detCache.get(json);                                      // 본 적 있는 경로면 시트가 올라오기 전에 먼저 채워 둔다
        if (cached != null) { try { home.onDetail(cached); sv.setScreen(parsedGet(cached), false); filled = true; } catch (Throwable e) { filled = false; } }
        final FrameLayout root = new FrameLayout(this);
        root.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { closeSheet(); } });       // 웹: 어두운 바깥을 누르면 닫힌다
        final FrameLayout box = new FrameLayout(this) {
            private float rawY0, rawX0; private boolean drag, atTop; private final int slop = android.view.ViewConfiguration.get(ShellActivity.this).getScaledTouchSlop();
            @Override public boolean onInterceptTouchEvent(android.view.MotionEvent e) {
                int a = e.getActionMasked();
                if (a == android.view.MotionEvent.ACTION_DOWN) { rawY0 = e.getRawY(); rawX0 = e.getRawX(); drag = false; atTop = e.getY() < 64f * dpr || sv.scrollPos() <= 0.5f; return false; }
                if (a == android.view.MotionEvent.ACTION_MOVE && !drag && atTop) {                                                 // 머리 어디서든 · 목록이 맨 위면 어디를 잡아도 아래로 끌면 시트가 따라 내려간다
                    float dy = e.getRawY() - rawY0, dx = e.getRawX() - rawX0;
                    if (dy > slop && dy > Math.abs(dx) * 1.2f) { drag = true; return true; }
                }
                return false;
            }
            @Override public boolean onTouchEvent(android.view.MotionEvent e) {
                int a = e.getActionMasked();
                if (!drag) return true;
                if (a == android.view.MotionEvent.ACTION_MOVE) { setTranslationY(Math.max(0f, e.getRawY() - rawY0)); return true; }
                if (a == android.view.MotionEvent.ACTION_UP || a == android.view.MotionEvent.ACTION_CANCEL) {
                    drag = false;
                    float dy = e.getRawY() - rawY0;
                    android.view.animation.PathInterpolator ease = new android.view.animation.PathInterpolator(0.25f, 0.1f, 0.25f, 1f);       // CSS ease
                    if (a == android.view.MotionEvent.ACTION_UP && dy > 120f * dpr) {
                        animate().translationY(getHeight()).setDuration(250L).setInterpolator(ease).start();
                        main.postDelayed(new Runnable() { @Override public void run() { if (sheet != null && ShellCore.S_DETAIL.equals(sheetName)) closeSheet(); } }, 200L);
                    } else animate().translationY(0f).setDuration(250L).setInterpolator(ease).start();
                }
                return true;
            }
        };
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setColor(pal[ScreenView.R_CARD]); float rr = 20f * dpr; g.setCornerRadii(new float[] { rr, rr, rr, rr, 0f, 0f, 0f, 0f });
        box.setBackground(g);
        if (Build.VERSION.SDK_INT >= 21) box.setClipToOutline(true);
        box.addView(sv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (!filled) {                                                                  // 웹 '경로를 불러오는 중...'
            android.widget.TextView tv = new android.widget.TextView(this);
            tv.setText("경로를 불러오는 중..."); tv.setTextSize(13f); tv.setTextColor(pal[ScreenView.R_SUB]); tv.setGravity(android.view.Gravity.CENTER);
            box.addView(tv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, android.view.Gravity.CENTER));
            detLoading = tv;
        }
        box.setClickable(true);
        box.setAlpha(0f);
        root.addView(box, new FrameLayout.LayoutParams(1, 1, android.view.Gravity.TOP | android.view.Gravity.CENTER_HORIZONTAL));
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        sheet.setContentView(root);
        try {
            android.view.Window w = sheet.getWindow();
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0x00000000));
            w.addFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            w.setDimAmount(0.82f);
            w.setWindowAnimations(android.R.style.Animation_InputMethod);
            sheet.show();
        } catch (Throwable t) { toast("세부경로를 열지 못했어요"); sheet = null; sheetView = null; sheetName = ""; return; }
        root.post(new Runnable() { @Override public void run() {                        // 웹: 높이 = 화면 - 탭바 56 - 위 안전영역 - 10 · 탭바 위에 떠 있다
            if (sheet == null || sv != sheetView) return;
            int[] ro = new int[2]; root.getLocationOnScreen(ro);
            int rootH = root.getHeight(), rootW = root.getWidth();
            int tabsTop = rootH - Math.round(56f * dpr);
            if (tabs != null && tabs.getHeight() > 0) { int[] tl = new int[2]; tabs.getLocationOnScreen(tl); tabsTop = tl[1] - ro[1]; }
            int sb = 0; int rid = getResources().getIdentifier("status_bar_height", "dimen", "android"); if (rid > 0) sb = getResources().getDimensionPixelSize(rid);
            int top = Math.max(0, sb - ro[1]) + Math.round(10f * dpr);
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) box.getLayoutParams();
            lp.width = Math.min(rootW, Math.round(520f * dpr)); lp.height = Math.max(Math.round(200f * dpr), tabsTop - top); lp.topMargin = top;
            box.setLayoutParams(lp);
            slideIn(box);
        } });
        loadDetail();
    }
    private void loadDetail() {
        final String json = home.detailRequest(homeEnv(), ShellCore.CAP, ShellCore.theme(store));
        if (json.length() == 0) { closeSheet(); return; }
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/result", json, 8000);
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    if (sheet == null || !sheet.isShowing() || !ShellCore.S_DETAIL.equals(sheetName)) return;
                    if (txt.length() == 0) { toast("세부경로를 받지 못했어요"); return; }
                    if (txt.length() < 80000) { detCache.remove(json); detCache.put(json, txt); while (detCache.size() > 12) { java.util.Iterator<String> it = detCache.keySet().iterator(); it.next(); it.remove(); } }
                    home.onDetail(txt);
                    present(sheetView, txt, true);
                    if (detLoading != null) { detLoading.setVisibility(View.GONE); detLoading = null; }
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
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
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
                NetPost.Res rb = NetPost.get(HomeSearchCore.busUrl(HomeSearchCore.BUS_BASE, q.trim()), 6000);
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
            final Runnable openSet = new Runnable() { @Override public void run() {
                try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); } catch (Throwable t) { /* 기기가 못 열면 안내 글만 남는다 */ }
            } };
            if (!dlgKind("perm", openSet, null)) { toast("설정에서 '다른 앱 위에 표시'를 허용해 주세요"); openSet.run(); }      // 웹처럼 "설정 화면을 열까요?"(엔진 카드) — 못 받았으면 안내 글 + 바로 연다
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
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
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
    /** sk: 이 결과를 SWR 보관함에 남길 열쇠(null 이면 남기지 않는다 — 근사 결과). 읽을 수 있는 결과만 남긴다. */
    private void postRoute(final int my, final String raw, final String a, final String b, final long bt, final long rb, final String sk) {
        main.post(new Runnable() { @Override public void run() {
            if (my != seqRoute) return;
            rloadHide();
            if (home.setRoute(raw, a, b, bt, rb)) { if (sk != null) routeSwr.put(sk, rb + "\n" + raw, System.currentTimeMillis()); reloadHome(); } else toast("경로 응답을 읽지 못했어요");
        } });
    }
    /** quiet: 옛 결과가 이미 떠 있다 — 뒤에서 새로 받다 실패해도 알림 없이 옛 결과를 그대로 둔다. */
    private void postFail(final int my, final boolean quiet) {
        main.post(new Runnable() { @Override public void run() { if (my != seqRoute) return; rloadHide(); reloadHome(); if (!quiet) toast("경로를 받지 못했어요"); } });
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

    /** 기사 고유 id(링크, 없으면 제목)로 상세를 연다: 지금 가진 기사 줄에서 같은 것을 찾아 전부 보내고, 없으면(목록이 바뀌어 사라졌으면) 눌린 줄의 제목 · 링크만으로 엔진에 묻는다. */
    private void openNewsById(String id, String title, int ix) {
        final ShellCore.NewsRows rows = lastNews;
        final String json = ShellCore.newsDetailBody(rows.rowJsonById(id, title, ix));
        int ri = rows.indexById(id, title, ix);
        final String link = ri >= 0 ? rows.rows.get(ri)[1] : (id.startsWith("http") ? id : "");        // 기사 id 가 제목이면 링크는 그 줄에서 — 이것이 비면 원문 보기 단추가 사라진다
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/news", json, 8000);
                final ShellCore.Detail d = r.status == 200 ? ShellCore.parseDetail(r.body, link) : null;
                main.post(new Runnable() { @Override public void run() { if (d == null) toast("기사 내용을 받지 못했어요"); else showDetail(d); } });
            }
        }, "shell-news").start();
    }

    /** 기사 상세(웹 _openNewsDetail): 앱 테마 색으로 아래에서 올라오는 시트 — 분류 칩 · 제목 · 시각 · 요약 · 출처 안내 · [언론사 원문 보기 ›] · 닫기. 문구는 전부 엔진이 준다. */
    private void showDetail(final ShellCore.Detail d) {
        final int[] pal = ShellCore.palette(ShellCore.theme(store));
        final android.app.Dialog dg = new android.app.Dialog(this, android.R.style.Theme_Material_Light_Dialog_NoActionBar);
        try {
            final android.widget.LinearLayout col = new android.widget.LinearLayout(this);
            col.setOrientation(android.widget.LinearLayout.VERTICAL);
            int pad = (int) (20 * dpr);
            col.setPadding(pad, (int) (12 * dpr), pad, (int) (16 * dpr));
            android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
            bg.setColor(pal[ScreenView.R_CARD]);
            float rd = 20 * dpr; bg.setCornerRadii(new float[] { rd, rd, rd, rd, 0, 0, 0, 0 });
            col.setBackground(bg);
            android.view.View grip = new android.view.View(this);
            android.graphics.drawable.GradientDrawable gb = new android.graphics.drawable.GradientDrawable();
            gb.setColor(pal[ScreenView.R_BORDER2]); gb.setCornerRadius(2 * dpr); grip.setBackground(gb);
            android.widget.LinearLayout.LayoutParams gp = new android.widget.LinearLayout.LayoutParams((int) (36 * dpr), (int) (4 * dpr));
            gp.gravity = android.view.Gravity.CENTER_HORIZONTAL; gp.bottomMargin = (int) (16 * dpr);
            col.addView(grip, gp);
            android.widget.ScrollView sv = new android.widget.ScrollView(this);
            sv.setVerticalScrollBarEnabled(false);
            android.widget.LinearLayout in = new android.widget.LinearLayout(this);
            in.setOrientation(android.widget.LinearLayout.VERTICAL);
            sv.addView(in, new android.view.ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            if (d.cat.length() > 0) {
                android.widget.TextView chip = detailText(d.cat, 11, true, pal[ScreenView.R_ONGOLD], 0);
                chip.setPadding((int) (9 * dpr), (int) (3 * dpr), (int) (9 * dpr), (int) (3 * dpr));
                android.graphics.drawable.GradientDrawable cb = new android.graphics.drawable.GradientDrawable();
                cb.setColor(pal[ScreenView.R_GOLD]); cb.setCornerRadius(6 * dpr); chip.setBackground(cb);
                android.widget.LinearLayout.LayoutParams cp = new android.widget.LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                cp.bottomMargin = (int) (10 * dpr);
                in.addView(chip, cp);
            }
            in.addView(detailText(d.title, 18, true, pal[ScreenView.R_TEXT], 1.45f), detailLp(8));
            if (d.meta.length() > 0) in.addView(detailText(d.meta, 12, false, pal[ScreenView.R_SUB], 0), detailLp(16));
            android.widget.TextView body = detailText(d.body, 14, false, d.bodyIsEmpty ? pal[ScreenView.R_SUB] : pal[ScreenView.R_TEXT], d.bodyIsEmpty ? 1.7f : 1.75f);
            in.addView(body, detailLp(8));
            if (d.notice.length() > 0) {
                android.text.SpannableString sp = new android.text.SpannableString(d.notice);
                int ix = d.src.length() > 0 ? d.notice.indexOf(d.src) : -1;
                if (ix >= 0) sp.setSpan(new android.text.style.StyleSpan(android.graphics.Typeface.BOLD), ix, ix + d.src.length(), android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                android.widget.TextView nt = detailText("", 11, false, pal[ScreenView.R_SUB], 1.6f);
                nt.setText(sp);
                int np = (int) (10 * dpr);
                nt.setPadding(np, np, np, np);
                android.graphics.drawable.GradientDrawable nb = new android.graphics.drawable.GradientDrawable();
                nb.setColor(pal[ScreenView.R_CARD2]); nb.setCornerRadius(9 * dpr); nt.setBackground(nb);
                in.addView(nt, detailLp(18));
            }
            col.addView(sv, new android.widget.LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
            if (d.open) {
                android.widget.TextView ob = detailText(d.btn.length() > 0 ? d.btn : "원문 보기 ›", 15, true, pal[ScreenView.R_ONGOLD], 0);
                ob.setGravity(android.view.Gravity.CENTER);
                ob.setPadding(0, (int) (14 * dpr), 0, (int) (14 * dpr));
                android.graphics.drawable.GradientDrawable ab = new android.graphics.drawable.GradientDrawable();
                ab.setColor(pal[ScreenView.R_GOLD]); ab.setCornerRadius(12 * dpr); ob.setBackground(ab);
                ob.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { openInApp(d.link, pal[ScreenView.R_BG]); } });
                android.widget.LinearLayout.LayoutParams op = new android.widget.LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                op.topMargin = (int) (4 * dpr);
                col.addView(ob, op);
            }
            android.widget.TextView cl = detailText(d.close, 14, true, pal[ScreenView.R_SUB], 0);
            cl.setGravity(android.view.Gravity.CENTER);
            cl.setPadding(0, (int) (12 * dpr), 0, (int) (12 * dpr));
            cl.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { dg.dismiss(); } });
            android.widget.LinearLayout.LayoutParams clp = new android.widget.LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            clp.topMargin = (int) (8 * dpr);
            col.addView(cl, clp);
            dg.setContentView(col);
            android.view.Window w = dg.getWindow();
            final int maxH = (int) (getResources().getDisplayMetrics().heightPixels * 0.85f);
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            w.setGravity(android.view.Gravity.BOTTOM);
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
            w.setDimAmount(0.6f);
            w.setWindowAnimations(android.R.style.Animation_InputMethod);
            col.setMinimumHeight(0);
            sv.setMinimumHeight(0);
            dg.setCanceledOnTouchOutside(true);
            dg.show();
            if (col.getHeight() > maxH) w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, maxH);
            else col.post(new Runnable() { @Override public void run() { try { if (col.getHeight() > maxH) dg.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, maxH); } catch (Throwable ignored) { } } });
        } catch (Throwable t) { toast(d.title); }
    }
    private android.widget.TextView detailText(String s, float sp, boolean bold, int color, float lineMul) {
        android.widget.TextView t = new android.widget.TextView(this);
        t.setText(s); t.setTextSize(sp); t.setTypeface(ScreenView.face(bold)); t.setTextColor(color);
        t.setIncludeFontPadding(false);
        if (lineMul > 0f) t.setLineSpacing(0f, lineMul / 1.2f);
        return t;
    }
    private android.widget.LinearLayout.LayoutParams detailLp(int bottomDp) {
        android.widget.LinearLayout.LayoutParams p = new android.widget.LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.bottomMargin = (int) (bottomDp * dpr);
        return p;
    }
    /** 앱을 벗어나지 않고 원문을 연다(웹 _newsOpenInApp): 크롬 맞춤 탭 — 앱 테마색 막대 · 닫으면 바로 앱. 맞춤 탭을 못 쓰는 기기는 기본 브라우저. */
    private void openInApp(String url, int bar) {
        if (!ShellCore.linkOk(url)) return;
        try {
            Intent it = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            android.os.Bundle ex = new android.os.Bundle();
            ex.putBinder("android.support.customtabs.extra.SESSION", null);
            it.putExtras(ex);
            it.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", bar | 0xFF000000);
            it.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 1);
            startActivity(it);
        } catch (ActivityNotFoundException e) { toast("열 수 있는 앱이 없어요"); }
    }
}
