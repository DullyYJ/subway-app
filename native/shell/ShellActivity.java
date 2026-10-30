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
    private RsSheetView rs, rsF;                      // rs = 하단 탭 아래에 올라오는 탑승 시트, rsF = 탭 위에 뜨는 대기 알약 · 되돌리기 캡슐
    private final Runnable rsApply = new Runnable() { @Override public void run() { rerouteAsk(); legAsk(); if (rs == null) return; OvCore.Ov o = RideService.running ? RideService.liveOv : null; rs.setOv(o); rsF.setOv(o); } };       // 오버레이는 앱을 내렸을 때만 뜨므로(RideService.appFront) 앱 안에서는 탑승 시트가 항상 그 줄을 그린다
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
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, String> e) { boolean over = size() > 180; if (over) scrKeys.remove(e.getKey()); return over; }       // 오래 안 본 화면부터 버린다(메모리 한도 — 미리 받는 화면(탭 · 분류 · 호선 방 · 지역)이 40을 넘어 앞의 것이 밀려나 스와이프가 느려지던 것을 막으려 120)
    };
    private final java.util.HashMap<ScreenView, String> viewKey = new java.util.HashMap<ScreenView, String>();
    private final java.util.HashMap<ScreenView, String> shownJson = new java.util.HashMap<ScreenView, String>();       // 칸이 지금 보여 주는 글(같은 글이면 다시 그리지 않는다)
    private final java.util.HashMap<ScreenView, String> shownKey = new java.util.HashMap<ScreenView, String>();         // 칸이 지금 보여 주는 화면의 캐시 열쇠(같은 화면에서 분류만 바꿔 옛 분류가 남아 있는 때를 알아보려고)
    private void shownKeyPut(ScreenView v) { String k = viewKey.get(v); if (k != null) shownKey.put(v, k); else shownKey.remove(v); }
    // 검증을 마친 화면 객체: 받는 스레드에서 미리 읽어 두면(warm) 올릴 때 주 스레드가 글을 다시 읽지 않는다
    private final java.util.LinkedHashMap<String, ScreenCore.Screen> parsedScr = new java.util.LinkedHashMap<String, ScreenCore.Screen>(16, 0.75f, true);
    private long parsedChars = 0L;                                           // 읽어 둔 화면 글자 수 합(메모리 한도). s277: 48칸 → 100칸 · 600만 글자 — 미리 받은 화면(분류 · 방)이 100개가 넘어 48칸은 오래된 것부터 다 밀려나, 돌아올 때 주 스레드가 다시 읽었다
    private static final int PARSED_MAX = 100; private static final long PARSED_CHARS = 6000000L;
    private void parsedTrim() {                                              // parsedScr 잠금 안에서
        java.util.Iterator<java.util.Map.Entry<String, ScreenCore.Screen>> it = parsedScr.entrySet().iterator();
        while (it.hasNext() && (parsedScr.size() > PARSED_MAX || parsedChars > PARSED_CHARS) && parsedScr.size() > 1) { parsedChars -= it.next().getKey().length(); it.remove(); }
    }
    private ScreenCore.Screen parsedGet(String json) throws ScreenCore.ParseError {
        synchronized (parsedScr) { ScreenCore.Screen c = parsedScr.get(json); if (c != null) return c; }
        ScreenCore.Screen sc = ScreenCore.load(json);
        synchronized (parsedScr) { if (parsedScr.put(json, sc) == null) parsedChars += json.length(); parsedTrim(); }
        return sc;
    }
    /** s277: 방금 올린 커뮤니티·쇼핑·뉴스 화면의 이웃 분류(엔진이 sw.t 표에 담은 왼쪽·오른쪽)를 뒤에서 미리 읽고 '배치'까지 해 둔다 — 밀었다가 돌아올 때 주 스레드가 큰 화면을 다시 읽고 재지 않는다. 글·표는 엔진 것, 앱은 준비만. */
    private void neighborPre(ScreenView v, ScreenCore.Screen sc, String ck) {
        try {
            if (v != body || ck == null || sc == null || sc.swT == null || sc.swK == null) return;
            int bar = ck.indexOf('|'); if (bar <= 0) return;
            String sl = ck.substring(0, bar);
            if (!ShellCore.S_SHOP.equals(sl) && !ShellCore.S_NEWS.equals(sl) && !ShellCore.S_CHAT.equals(sl)) return;
            ScreenCore.Act[] e = sc.swT.get(sc.swK);
            if (e == null) return;
            final ArrayList<String> js = new ArrayList<String>();
            for (ScreenCore.Act a : e) {
                if (a == null || !"cat".equals(a.a) || a.v == null || a.v.length() == 0) continue;
                String c = cacheGet(sl + "|" + a.v, false);
                if (c != null && !isNotMod(c)) js.add(c);
            }
            if (js.isEmpty()) return;
            ioExec.execute(new Runnable() { @Override public void run() {
                for (String c : js) {
                    try {
                        final ScreenCore.Screen n = parsedGet(c);
                        main.post(new Runnable() { @Override public void run() { try { body.preLayout(n); } catch (Throwable ignored) { } } });
                    } catch (Throwable ignored) { }
                }
            } });
        } catch (Throwable ignored) { }
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
    private volatile String hcKey = "", hcJson = "", hcFor = "";                  // hcFor = 그 홈 카드를 받은 때의 경로 상태(경로 없음 / 몇 번째 탐색 · 고른 탭) — 다른 상태의 옛 카드를 먼저 보이지 않으려는 표시
    private FavCore fav;                                   // 즐겨찾기 시트(저장 목록·엔진이 돌려준 새 목록)
    private final FoodCore food = new FoodCore();         // 맛집 탭(도착지·기기 위치·받은 원자료)
    private int seqFood = 0;
    private ChatCore chat;
    private final Latest chatLatest = new Latest();                           // 소통방 화면 받기: 가장 나중에 시작한 것만 올린다(s291 · 예전 순번표 seqChat 를 대신한다)
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
    private final java.util.LinkedHashMap<String, String> finCache = new java.util.LinkedHashMap<String, String>();      // 합쳐 둔 홈 화면(홈 + 결과 + 홈 카드) — 열쇠는 세 글의 해시
    private static String finKey(String home0, String res, String cards) { return home0.hashCode() + ":" + home0.length() + "|" + res.hashCode() + ":" + res.length() + "|" + cards.hashCode() + ":" + cards.length(); }
    /** 미리 받아 둔 탭들의 홈 화면을 뒤에서 미리 합쳐 읽어 둔다(주 스레드에서 열쇠만 모으고 합치기는 뒤 스레드). 탭을 밀면 통신도 합치기도 없이 바로 그린다. */
    private void premerge() {
        if (!home.hasRoute() || home.riding()) return;
        final String th = ShellCore.theme(store);
        final String hj = lruGet(homeCache, ShellCore.homeKey(home.request(homeEnv(), ShellCore.CAP)));
        if (hj == null || hj.length() == 0) return;
        final java.util.ArrayList<String[]> jobs = new java.util.ArrayList<String[]>();
        for (String tb : new java.util.ArrayList<String>(home.resHas)) {
            if (tb.equals(home.resTab)) continue;
            String rs = resGet(home.dataRev + ":" + tb + ":" + th), cj = lruGet(hcTab, hc.tabKey(home.dataRev, tb, chat.talkCount(), chat.talkMark()));
            if (rs == null || cj == null || rs.length() == 0 || cj.length() == 0) continue;
            if (lruGet(finCache, finKey(hj, rs, cj)) != null) continue;
            jobs.add(new String[] { rs, cj });
        }
        if (jobs.isEmpty()) return;
        new Thread(new Runnable() { @Override public void run() {
            for (String[] j : jobs) {
                try {
                    String f = ShellCore.mergeBodies(ShellCore.mergeBodies(hj, j[0]), j[1]);
                    if (f.length() > 0) { lruPut(finCache, finKey(hj, j[0], j[1]), f, 8); warm(f); }
                } catch (Throwable ignored) { }
            }
        } }, "shell-premerge").start();
    }
    private final java.util.LinkedHashMap<String, String> hcTab = new java.util.LinkedHashMap<String, String>();      // 탭마다 미리 받은 홈 카드(브리핑 포함) — 결과 카드를 밀어 탭을 바꿀 때 바로 보이게
    private final java.util.HashMap<String, Long> hcTabAt = new java.util.HashMap<String, Long>();
    private final java.util.HashSet<String> hcFly = new java.util.HashSet<String>();
    /** s343: 브리핑이 어느 경로·어느 편·어느 탭의 것인지 가리키는 이름표. 장거리에서 다른 편을 골라도(ld2Raw 가 바뀜) 이름표가 달라져 앞 편의 브리핑이 그대로 남지 않는다. */
    private String hcSigOf(String tab) { return (home.hasRoute() ? "r" + home.routeId + "#" + home.ld2Raw.hashCode() : "n") + ":" + tab; }
    private final java.util.LinkedHashMap<String, String> hcLast = new java.util.LinkedHashMap<String, String>();      // 이름표(hcSigOf)마다 가장 최근에 받은 브리핑 — 채팅·시각이 바뀌어 정확한 열쇠는 못 찾아도 '그 경로·그 탭'의 브리핑을 먼저 보이고 뒤에서 갱신한다
    private void hcTabPut(String k, String v) { lruPut(hcTab, k, v, 12); synchronized (hcTabAt) { hcTabAt.put(k, System.currentTimeMillis()); if (hcTabAt.size() > 64) hcTabAt.clear(); } }
    private boolean hcTabFresh(String k, long ms) { Long at; synchronized (hcTabAt) { at = hcTabAt.get(k); } return at != null && System.currentTimeMillis() - at < ms && lruGet(hcTab, k) != null; }
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
        ScreenView.trainFeed = new ScreenView.TrainFeed() { @Override public String pos() { return RideService.running ? RideService.livePos : ""; } };      // 객실 장면(혼잡도 카드 둘째 쪽)이 쓰는 탑승 시각표
        store = new PrefStore(getSharedPreferences(PREFS, Context.MODE_PRIVATE));      // 설정 파일 읽기는 시스템이 따로 시작한다 — 아래 일을 하는 동안 저절로 끝난다
        dpr = getResources().getDisplayMetrics().density;
        if (b == null) store.put(ShellCore.K_TAB, ShellCore.DEFAULT_TAB);            // 껐다 켜면 늘 홈부터(웹과 같다) — 화면 회전 같은 다시 만들기(b != null)는 보던 탭 그대로
        preloadDisk();                                                               // 모든 탭의 마지막 화면을 IO 스레드가 읽고 해석해 둔다(주 스레드는 파일을 열지 않는다)
        preconnectBus();                                                             // 버스 서버 연결을 켜자마자(홈에서도) 미리 맺어 둔다 — 버스 탭을 누를 때 DNS · TLS 시간이 없다
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
        hostHead = new Host(0);
        head.setListener(hostHead);
        root.addView(head, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(44f * dpr)));
        holder = new FrameLayout(this);                 // 본문 칸의 검색 입력칸이 붙을 부모
        body = new ScreenView(this);
        body.setDpr(dpr);
        hostBody = new Host(1);
        body.setListener(hostBody);
        body.setSwipeHost(new ScreenView.SwipeHost() { @Override public boolean onSwipe(ScreenView v, int dir) { return commSwipe(dir); } @Override public boolean canSwipe() { String ct = ShellCore.currentTab(store); if ("home".equals(ct)) { ScreenCore.Screen hs = body.currentScreen(); return hs != null && (hs.swL != null || hs.swR != null) && home.hasRoute() && !home.riding(); } return "community".equals(ct) || "shop".equals(ct) || "food".equals(ct) || "map".equals(ct); } });          // 커뮤니티 · 쇼핑 · 맛집 · 노선도(버스 ↔ 지하철) 좌우 밀기(웹 _commSwipeStep)
        body.setPullHost(new ScreenView.PullHost() {                  // 아래로 당겨 새로고침(YJ: 버스가 계속 안 나올 때 · 스프링처럼 튀어오르며) — 노선도 버스 · 맛집
            @Override public boolean canPull() { String ct = ShellCore.currentTab(store); return ("map".equals(ct) && "bus".equals(map.mode())) || "food".equals(ct); }
            @Override public void onPull() {
                String ct = ShellCore.currentTab(store);
                ScreenCore.Act a = new ScreenCore.Act();
                if ("food".equals(ct)) { a.a = "refresh"; foodAct(a); return; }
                a.a = "call"; a.v = "mp.rf"; hostBody.handle(a, false);              // 위 🔄 단추와 같은 행동
            }
        });
        body.setHelloFeed(new ScreenView.HelloFeed() { @Override public SceneHello.Plan get() { return helloPlan(); } });          // s340: 홈 장면 3초 꾹 누르기 → 카드가 늘어나 친구들 인사
        body.setReorderHost(new ScreenView.ReorderHost() { @Override public void onReorder(String[] keys, int[] perm) { reorderBusNear(keys, perm); } });      // 주변 정류장 카드 끌어서 순서 바꾸기
        holder.addView(body, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        vec = new VecMap(this, holder, body, dpr);       // 정류장 지도: 웹과 같은 벡터 지도(MapLibre · OpenFreeMap Liberty) — 못 받으면 아래 타일 그림이 그대로
        body.setVecHost(vec);
        root.addView(holder, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        rsF = new RsSheetView(this, false);              // 떠 있는 대기 알약 · 되돌리기 캡슐: 하단 탭 바로 위(웹 .rs-pill · .rs-undo)
        rsF.setHost(new RsSheetView.Act() { @Override public void act(String a) { RideService.rsAct(a); } });
        holder.addView(rsF, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, android.view.Gravity.BOTTOM));      // 알약 · 캡슐은 본문 위에 떠서(자리를 차지하지 않음) 뒤 화면이 비친다
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
        rs = new RsSheetView(this, true);                // 탑승 시트(웹 .rs-sheet): 도착 2분 전 [탑승]/[환승완료]. 하단 탭 아래에서 올라오며 탭이 같이 올라간다. 값은 서비스가 엔진에게서 받아 온다
        rs.setSibling(tabs);
        rs.setHost(new RsSheetView.Act() { @Override public void act(String a) { RideService.rsAct(a); } });
        root.addView(rs, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);

        // 설정 값이 필요한 준비는 칸을 만든 뒤에(그때쯤 설정 파일 읽기가 끝나 있어 기다림이 없다)
        if (CmCore.on(store)) CommuteAlarm.rescheduleAsync(this);                 // 출퇴근 브리핑: 앞으로 4주 창을 다시 민다
        board = new BoardCore(store);
        chat = new ChatCore(store);
        fav = new FavCore(store);
        map = new MapCore(store); map.primary = true;                          // 실제 화면의 버스 상태기 — 위치 칸을 저장소에 적어 화면 캐시 열쇠가 따라가게 한다(s179)
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
        WidgetCore.captureLaunch(getIntent()); CommuteAlarm.captureBrief(getIntent());
        widgetLaunch(); briefLaunch();
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
        if (b == null) showOpening();                                                 // 처음 켤 때만(화면 회전 같은 다시 만들기는 건너뜀): 길동무 친구들의 인사 2초 — 위 준비물은 뒤에서 이미 돌고 있다
    }

    // ── 오프닝(s299): 켜자마자 길동무 친구들이 2초쯤 인사한다. 대본은 엔진이 만든 assets/open.json — 시계의 시(時)에 맞는 칸을 고르고, 나올 친구 셋은 켤 때마다 무작위로 고른다 ──
    private OpenView openV;
    private OpenCore.Script helloScript;
    /** s340: 홈 장면(길동무 친구들 카드)을 3초 꾹 누르면 카드가 늘어나 나머지 친구들이 인사한다(YJ). 대본(시간 · 자리 · 차례 · 인사 글)은 엔진이 만든 assets/open.json 의 hello 와 지금 시(時) 칸. 없으면 null(아무것도 안 한다). */
    private SceneHello.Plan helloPlan() {
        try {
            if (helloScript == null) {
                java.io.InputStream in = getAssets().open("open.json");
                try { java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); helloScript = OpenCore.parse(bo.toString("UTF-8")); } finally { in.close(); }
            }
            if (helloScript == null) return null;
            java.util.Calendar cal = java.util.Calendar.getInstance();
            return OpenCore.helloFor(helloScript, OpenCore.slotFor(helloScript, cal.get(java.util.Calendar.HOUR_OF_DAY) + cal.get(java.util.Calendar.MINUTE) / 60.0));
        } catch (Throwable ignored) { return null; }
    }
    private void showOpening() {
        try {
            OpenCore.Script sc; java.io.InputStream in = getAssets().open("open.json");
            try { java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); sc = OpenCore.parse(bo.toString("UTF-8")); } finally { in.close(); }
            if (sc == null) return;
            java.util.Calendar cal = java.util.Calendar.getInstance();
            double hour = cal.get(java.util.Calendar.HOUR_OF_DAY) + cal.get(java.util.Calendar.MINUTE) / 60.0;
            OpenCore.Slot sl = OpenCore.withWeather(sc, OpenCore.slotFor(sc, hour), OpenWx.read(this));          // 마지막으로 받은 날씨(6시간 안)를 배경에 입힌다 — 없으면 맑은 그림 그대로
            String prev = ""; try { prev = store.get("open_last", ""); } catch (Throwable ignored) { }
            String[] ids = OpenCore.pickIds(sc, System.nanoTime() ^ cal.getTimeInMillis(), prev);          // 켤 때마다 친구 셋이 무작위로(방금 나온 조합은 피한다)
            try { store.put("open_last", ids[0] + "," + ids[1] + "," + ids[2]); } catch (Throwable ignored) { }
            openV = new OpenView(this, sc, sl, OpenCore.cast(sc, sl, ids), new OpenView.Done() { @Override public void onDone() { closeOpening(); } });
            addContentView(openV, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        } catch (Throwable ignored) { openV = null; }                                  // 오프닝이 실패해도 앱은 그대로 연다
    }
    private void closeOpening() {
        OpenView v = openV; openV = null; if (v == null) return;
        try { ViewGroup pr = (ViewGroup) v.getParent(); if (pr != null) pr.removeView(v); } catch (Throwable ignored) { }
    }

    /** 앱을 켜면 출발지를 내 위치로 자동으로 잡는다(이미 경로를 보고 있거나 출발지를 골랐으면 건드리지 않는다). 권한 안내는 처음 한 번만 묻는다. */
    private void autoGps() {
        if (home.hasRoute() || home.loc[HomeCore.START] != null || home.gps || home.text[HomeCore.START].length() > 0) return;
        boolean perm = checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!perm) return;                                                         // 처음 권한 묻기는 '처음 설치 승인 순서'(setupNext)가 알림 다음 차례로 한다 — 두 곳에서 동시에 묻지 않는다
        startGps();
    }

    /** 위젯을 눌러 앱이 (다시) 열렸다. */
    @Override protected void onNewIntent(Intent it) {
        super.onNewIntent(it);
        setIntent(it);
        WidgetCore.captureLaunch(it); CommuteAlarm.captureBrief(it);
        widgetLaunch(); briefLaunch();
    }
    @Override protected void onStart() { super.onStart(); if (vec != null) vec.onStart(); }
    @Override protected void onStop() { RideService.setAppFront(false); if (vec != null) vec.onStop(); super.onStop(); WidgetCore.onAppLeft(this); }
    @Override public void onLowMemory() { super.onLowMemory(); if (vec != null) vec.onLowMemory(); }

    private boolean resumed;
    /** 위젯 본체 → 커뮤니티 탭 · 위젯 [출근하기]/[퇴근하기] → 설정한 출발·도착으로 길찾기(경로는 엔진이 장소 이름으로 찾아 준 좌표). */
    private void widgetLaunch() {
        String tab = WidgetCore.takeTab();
        if ("community".equals(tab)) { closeSheet(); store.put(ShellCore.K_TAB, "community"); showTab("community"); }
        final String go = WidgetCore.takeLaunch(this);
        if (!"morn".equals(go) && !"eve".equals(go)) return;
        startCommuteRoute(go);
    }
    /** 출근/퇴근 단추(위젯 · 알림 · 브리핑 창): 설정한 출발·도착을 엔진이 찾아 준 좌표로 넣고 곧바로 경로탐색 — 그 뒤는 경로탐색 그대로. */
    private void startCommuteRoute(final String go) {
        if (rideLocked()) return;
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
                    home.clearRoute(); chatRouteSync();
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
    @Override protected void onDestroy() { if (live == this) live = null; main.removeCallbacks(chatBg); chatBgOn = false; rloadHide(); if (locf != null) locf.cancelAll(); if (vec != null) vec.onDestroy(); super.onDestroy(); }
    @Override protected void onResume() { super.onResume(); resumed = true; foodWatchStart(); RideService.setAppFront(true); RideService.rsListener = rsApply; ovlAuto(); if (home.riding() || store.get(ShellCore.K_RIDESNAP, "").length() > 2) reviveRide(); rsApply.run(); main.postDelayed(new Runnable() { @Override public void run() { rerouteAsk(); } }, 1500L); if (vec != null) vec.onResume(); trackStart(); resumeLocate(); refreshPower(); if (System.currentTimeMillis() - hdrAt > 300000L) loadHdr(); if (prefetchAt > 0L && System.currentTimeMillis() - prefetchAt > 600000L) prefetchTabs(); busResume(); brResume(); if (ShellCore.S_SETPG.equals(sheetName) && sheet != null && sheet.isShowing()) loadSetPage(); if (ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "")) startChatPoll(); chatBgStart(); setupResume(); }
    @Override protected void onPause() { resumed = false; chatLive.cancel(); chatLiveTok = null; trackStop(); if (vec != null) vec.onPause(); main.removeCallbacks(brTick); brTicking = false; if (RideService.rsListener == rsApply) RideService.rsListener = null; super.onPause(); }

    @Override public void onBackPressed() {
        if (openV != null) { openV.finish(); return; }                                  // 오프닝 중에 뒤로 가기: 오프닝만 닫는다
        String t = ShellCore.currentTab(store);
        if (!ShellCore.DEFAULT_TAB.equals(t)) {
            store.put(ShellCore.K_TAB, ShellCore.DEFAULT_TAB);
            showTab(ShellCore.DEFAULT_TAB);
        } else if (!dlgKind("exit", new Runnable() { @Override public void run() { finish(); } }, null)) super.onBackPressed();      // 웹처럼 한 번 더 확인(엔진 카드) — 못 받았으면 바로 닫는다
    }

    // ───────────── 색 ─────────────
    private int[] lastPal;
    private void applyTheme() {
        int[] pal = ShellCore.palette(ShellCore.theme(store));
        if (lastPal != null && java.util.Arrays.equals(lastPal, pal)) return;          // s277: 분류를 바꿀 때마다 색을 다시 입히며 다섯 화면을 다시 그리던 것 — 색이 그대로면 건너뛴다
        lastPal = pal.clone();
        hdr.setPalette(pal);
        head.setPalette(pal);
        body.setPalette(pal);
        tabs.setPalette(pal);
        if (rs != null) { rs.setPalette(pal); rsF.setPalette(pal); }
        root.setBackgroundColor(pal[ScreenView.R_BG]);
        getWindow().getDecorView().setBackgroundColor(pal[ScreenView.R_BG]);
        try {                                                                      // 상태 표시줄은 늘 검정 + 흰 아이콘
            getWindow().setStatusBarColor(0xFF000000);
            View dv = getWindow().getDecorView();
            dv.setSystemUiVisibility(dv.getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        } catch (Throwable ignored) { }
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
        main.postDelayed(new Runnable() { @Override public void run() { prefetchIfCold(); } }, 1500L);          // 아직 미리 받지 못한 화면이 있으면 지금 채워 둔다(다음에 옮길 때 빈 화면이 없게)
    }
    /** 어느 탭의 화면이 캐시에 없으면(켠 직후 · 오래 지난 뒤) 미리 받기를 한 번 더 돌린다. 이미 돌고 있거나 1분 안에 돌렸으면 건너뛴다. */
    private void prefetchIfCold() {
        try {
            if (prefetchAt == 0L || pfPending.get() > 0 || System.currentTimeMillis() - prefetchAt < 60000L) return;
            for (String t : ShellCore.TABS) {
                if (t.equals(ShellCore.currentTab(store))) continue;
                if (!haveCached("tabs|" + t)) { prefetchTabs(); return; }
            }
        } catch (Throwable ignored) { }
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
    private final ThreadLocal<Boolean> forceNet = new ThreadLocal<Boolean>();
    private String screenCall(final String ck, boolean get, String url, String body, String sig, int timeoutMs) {
        final int sg = (sig != null ? sig : (get ? url : body)).hashCode();
        final ShellCore.Cond c = condOf(ck);
        final boolean fn = Boolean.TRUE.equals(forceNet.get());                 // 강제로 받는다(켠 뒤 첫 미리 받기): 신선 시간 · ETag 로 건너뛰지 않고 전체 글을 받는다
        final boolean have = !fn && c != null && c.etag.length() > 0 && haveCached(ck);
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
    /** 맛집 전용 — 눌렀을 때 펼침을 끼우는 글 만들기(foodRender)와 가게 지도 미리 받기 통신(foodNet)은 디스크 IO 줄과 따로 달린다: 미리 받는 통신이 길어도 누른 카드의 뼈대가 그 뒤에 서지 않는다. */
    private final java.util.concurrent.ExecutorService foodRender = java.util.concurrent.Executors.newSingleThreadExecutor(new java.util.concurrent.ThreadFactory() {
        @Override public Thread newThread(Runnable r) { Thread t = new Thread(r, "shell-foodrender"); t.setDaemon(true); return t; }
    });
    private final java.util.concurrent.ExecutorService foodNet = java.util.concurrent.Executors.newFixedThreadPool(3, new java.util.concurrent.ThreadFactory() {
        @Override public Thread newThread(Runnable r) { Thread t = new Thread(r, "shell-foodnet"); t.setDaemon(true); t.setPriority(Thread.NORM_PRIORITY - 1); return t; }
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
            String sk = shownKey.get(v);
            boolean otherShown = sk != null && !key.equals(sk);           // 같은 화면에서 분류만 바꿔 옛 분류가 남아 있다 — 디스크에서 막 읽은 이 분류를 네트워크를 기다리지 않고 바로 올린다
            if (key.equals(e.getValue()) && v != sheetView && (v.itemCount() == 0 || skelViews.contains(v) || otherShown) && !c.equals(shownJson.get(v))) showCached(v, c);
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
        else if (key.startsWith(ShellCore.S_MAPB + "|bus|") && key.contains("|near|")) trimBusKeys(key);
        if (ShellCore.diskTtl(key) > 0L && !(ShellCore.S_HOME.equals(key) && home.hasRoute())) diskPut(key, json);        // 경로를 보는 중의 홈은 디스크에 두지 않는다(다시 켜면 그 경로 상태가 없다)
    }
    /** 버스 '주변' 화면은 위치 칸마다 열쇠가 달라진다 — 가장 최근 6곳만 두고 오래된 곳의 글 · 파일은 치운다(쌓이지 않게). */
    private final java.util.ArrayList<String> busKeys = new java.util.ArrayList<String>();
    /** 지금 위치 칸(cell)과 같거나 이웃한 칸의 버스 '주변' 화면 열쇠 중 가장 최근 것(10분 신선 시간 안인 것만). 없으면 null. */
    private String nearBusKey(String cell) {
        for (int i = busKeys.size() - 1; i >= 0; i--) {
            String k = busKeys.get(i), c = k.substring(k.lastIndexOf('|') + 1);
            if (MapCore.cellsNear(c, cell, 3) && cacheGet(k, true) != null) return k;
        }
        return null;
    }
    private void trimBusKeys(String key) {
        busKeys.remove(key); busKeys.add(key);
        while (busKeys.size() > 6) {
            String old = busKeys.remove(0);
            scrCache.remove(old); scrKeys.remove(old);
            final File f = diskFile(old); diskIdx.remove(diskName(old));
            ioExec.execute(new Runnable() { @Override public void run() { try { f.delete(); } catch (Throwable ignored) { } } });
        }
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
            ScreenCore.Screen sc0 = parsedGet(json);
            v.setScreen(sc0, false); shownJson.put(v, json); shownKeyPut(v); skelViews.remove(v);
            String ck = viewKey.get(v);
            if (ck != null && v != sheetView) { restoreState(ck, json); neighborPre(v, sc0, ck); }
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
                String cell = map.stopsCell();
                String nk = cell.length() > 0 ? nearBusKey(cell) : null;                                 // s289: 같은 동네(이웃 칸)에서 방금 본 정류장 · 도착정보 화면이 있으면 회색 뼈대 대신 그것을 먼저(받은 뒤 흐른 초만큼 줄어든 채)
                if (nk != null) { String c = cacheGet(nk, true); if (c != null) { long am = diskMtime(nk); v.setSourceAge(am > 0L ? System.currentTimeMillis() - am : 0L); v.setScreen(parsedGet(c), false); shownJson.remove(v); shownKey.remove(v); skelViews.add(v); return; } }
                String sk = cell.length() > 0 && MapCore.cellsNear(cell, store.get("bsk_cell", ""), 3) ? cacheGet(ShellCore.busSkelKey(store), true) : null;          // 뼈대도 이웃 칸이면 쓴다
                if (sk != null) { v.setSourceAge(0L); v.setScreen(parsedGet(sk), false); shownJson.remove(v); shownKey.remove(v); skelViews.add(v); return; }
            }
            if (v == body && ShellCore.S_CHAT.equals(screen)) {                              // 실시간소통: 회색 뼈대 대신 엔진이 만든 '불러오는 중' 화면(칩 줄 그대로 · 고른 칩만 바뀜) — 빈 화면 없이
                String lj = chatLoad.get(chat.sel());
                if (lj != null) { try { v.setScreen(parsedGet(lj), false); shownJson.remove(v); shownKey.remove(v); skelViews.add(v); return; } catch (Throwable ignored) { } }
            }
            v.setScreen(parsedGet(ShellCore.skeletonScreen(screen)), false); shownJson.remove(v); shownKey.remove(v); skelViews.add(v);
        }
        catch (Throwable e) { v.clearScreen(); shownJson.remove(v); shownKey.remove(v); }
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
        if (ShellCore.S_FOOD.equals(screen)) foodSyncSig();                // 맛집 캐시 열쇠에 도착지(없으면 지금 동네)를 넣는다 — 미리 받아 둔 그 장소의 화면이 바로 뜬다
        final String ck = ShellCore.cacheKey(screen, store);
        viewKey.put(v, ck);
        if (!keep0) retryN.remove(v);                                 // 사람이 연 로드(탭 · 분류 · 다시 시도)는 자동 재시도를 처음부터
        if (!keep0) {
            String c = cacheGet(ck, ShellCore.diskCacheable(screen));
            if (c != null && showCached(v, c)) { keepX = true; if (ShellCore.S_MAPB.equals(screen)) syncMapView(); }
            else if (clearOnMiss) {
                if (v == body && diskAsked.contains(ck)) {                  // 디스크에서 읽는 중 — 곧(수십 ms) 마지막 화면이 올라오므로 뼈대를 잠깐 미뤄 깜빡임을 없앤다
                    v.clearScreen(); shownJson.remove(v); shownKey.remove(v);
                    final String wk = ck; final int wmy = my;
                    main.postDelayed(new Runnable() { @Override public void run() { if (wmy == seq[si] && v.itemCount() == 0 && wk.equals(viewKey.get(v))) showSkeleton(v, screen); } }, 120L);
                }
                else if (v == body) showSkeleton(v, screen); else { v.clearScreen(); shownJson.remove(v); shownKey.remove(v); }
            }       // 머리 칸(칩 줄)은 뼈대 없이 비운다(높이가 그린 만큼이라)          // 옛 탭 화면이 남아 보이지 않게 — 받는 동안은 뼈대
        }
        final boolean keep = keepX;
        final Runnable go = new Runnable() { @Override public void run() {
            if (my != seq[si]) return;                               // 그 사이 다른 탭 · 더 새 요청이 시작됐다 — 이 받기는 보내지 않는다
            if (ShellCore.S_HOME.equals(screen)) { loadHome(v, keep); return; }
            if (ShellCore.S_BOARD.equals(screen)) { loadBoard(v, keep, true); return; }
            if (ShellCore.S_CHAT.equals(screen)) { loadChat(v, keep, true); chatWarmSoon(); chatBgKick(); return; }
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
        ShellCore.Req rq = ShellCore.request(screen, store, feeds);
        if (rq == null) return "";
        String ck = ShellCore.cacheKey(screen, store);
        String t = ShellCore.S_SHOP.equals(screen) ? shopCall(ck, store.get(ShellCore.K_SHOP_CAT, "")) : screenCall(ck, "GET".equals(rq.method), rq.url, rq.body, null, 10000);          // 쇼핑: 엔진이 상품 서버를 못 받으면 앱이 직접 받아 실어 보낸다(계산은 여전히 엔진)
        if (t.length() == 0) { String d = delayBodies.remove(ck); if (d != null) return d; }          // 못 받았는데 엔진이 안내 화면을 줬으면 그것
        return t;
    }
    /** 쇼핑 화면 한 번 받기: 엔진에 묻고(상품 서버는 엔진이 받는다), 엔진이 상품 서버를 못 받았다고 하면 앱이 직접 받아 실어 보낸다. */
    private String shopCall(String ck, String cat) {
        String t = shopCall0(ck, cat, false);
        shopWarm(t);
        return t;
    }
    /** 미리 받기용: 엔진이 모든 카테고리 화면을 한 번에 계산해 주므로(alts) 카테고리마다 서버를 따로 부르지 않는다. 받은 alts 는 떼어 카테고리별 캐시에 넣고, 지금 화면(alts 뺀 것)을 돌려준다. */
    private volatile boolean shopAltsOk;
    private String shopCallAll(String ck, String cat) {
        shopAltsOk = false;
        return shopSplitAlts(ck, shopCall0(ck, cat, true));
    }
    @SuppressWarnings("unchecked")
    private String shopSplitAlts(String ck, String t) {
        if (t == null || t.length() < 3 || !t.contains("\"alts\"")) { shopWarm(t); return t; }
        try {
            Object o = ScreenCore.parse(t);
            if (!(o instanceof java.util.Map)) return t;
            java.util.Map<String, Object> m = (java.util.Map<String, Object>) o;
            Object alts = m.remove("alts");
            String cur = HomeSearchCore.toJson(m);
            if (alts instanceof java.util.Map) {
                for (java.util.Map.Entry<String, Object> e : ((java.util.Map<String, Object>) alts).entrySet()) {
                    String k = ShellCore.S_SHOP + "|" + e.getKey();
                    if (k.equals(ck)) continue;
                    String js = HomeSearchCore.toJson(e.getValue());
                    prefetchPut(k, js, false); shopWarm(js);
                }
                shopAltsOk = !((java.util.Map<String, Object>) alts).isEmpty();
            }
            Object cn = m.get("cat");
            if (cn instanceof String && ((String) cn).length() > 0 && !(ShellCore.S_SHOP + "|" + cn).equals(ck)) prefetchPut(ShellCore.S_SHOP + "|" + cn, cur, false);          // 처음엔 분류 이름이 비어 있다(= 추천) — 추천 칩을 눌렀을 때 열쇠도 채운다
            prefetchPut(ck, cur, false);                      // 받는 길에서 alts 가 붙은 채 캐시에 들어갔을 수 있어 뗀 글로 덮는다
            shopWarm(cur);
            return cur;
        } catch (Throwable e) { return t; }
    }
    /** 쇼핑 화면 글 안의 상품 그림 주소를 뒤에서 받아 파일 캐시에 둔다 — 탭을 열었을 때 그림이 곰돌이 자리표시자로 한참 보이지 않게(s216). */
    private void shopWarm(String txt) {
        if (txt == null || txt.length() < 3) return;
        try { ScreenView.ImageBank.warm(this, ScreenCore.imageUrls(txt, 240)); } catch (Throwable ignored) { }
    }
    private String shopCall0(String ck, String cat, boolean all) {
        if ("1".equals(store.get("shop_direct", ""))) {                    // 엔진이 상품 서버를 못 받는 것으로 확인됐다 — 처음부터 앱이 받아 실어 보낸다(엔진이 헛되이 13초 기다리지 않게)
            String d = shopDirect(ck, cat, all);
            if (d.length() > 0) return d;
        }
        String t = screenCall(ck, true, ShellCore.shopUrl(cat, all, pfLL()), null, null, 16000);
        if (t.length() == 0 && delayBodies.containsKey(ck)) {
            String d = shopDirect(ck, cat, all);
            if (d.length() > 0) { main.post(new Runnable() { @Override public void run() { store.put("shop_direct", "1"); } }); return d; }
        }
        return t;
    }
    /** 쇼핑: 상품 서버(gildongmu-shop)와 운영 설정(gildongmu-food)을 앱이 동시에 직접 받아 POST /screen/shop 에 실어 보낸다. 못 받으면 "". */
    private String shopDirect(String ck, String cat, boolean all) {
        final String[] raw = new String[] { "", "" };
        Thread a = new Thread(new Runnable() { @Override public void run() { NetPost.Res r = NetPost.get(ShellCore.SHOP_BASE + "/shop", 9000); if (r.status == 200 && r.body != null) raw[0] = r.body; } }, "shell-shopsrc");
        Thread b = new Thread(new Runnable() { @Override public void run() { NetPost.Res r = NetPost.get(FoodCore.FOOD_BASE + "/app-config?k=shop", 4000); if (r.status == 200 && r.body != null) raw[1] = r.body; } }, "shell-shopcfg");
        a.start(); b.start();
        try { a.join(11000L); b.join(1500L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return ""; }
        try { if (!(ScreenCore.parse(raw[0]) instanceof java.util.Map)) return ""; } catch (Throwable e) { return ""; }
        boolean cfgOk = false;
        try { cfgOk = ScreenCore.parse(raw[1]) instanceof java.util.Map; } catch (Throwable e) { cfgOk = false; }
        double[] wl = pfLL();
        String body = "{\"cap\":" + ShellCore.CAP + ",\"cat\":" + ShellCore.q(cat == null ? "" : cat) + (all ? ",\"alts\":1" : "") + (wl != null ? ",\"lat\":" + (Math.round(wl[0] * 10) / 10.0) + ",\"lng\":" + (Math.round(wl[1] * 10) / 10.0) : "") + ",\"shop\":" + raw[0] + (cfgOk ? ",\"cfg\":" + raw[1] : "") + "}";
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
    private volatile long prefetchAt = 0L;
    private static final long PF_BURST_MS = 20000L;                  // 켠 직후 20초는 미리 받기를 넓게(동시 5개 · 쉬는 틈 거의 없이) — 쇼핑·커뮤니티 모든 분류를 빨리 채우려고. 그 뒤는 예전처럼 천천히(데이터 · 배터리)
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
    private boolean pfBurst() { long a = prefetchAt; return a > 0L && System.currentTimeMillis() - a < PF_BURST_MS; }
    private void pfGap() { try { Thread.sleep(pfBurst() ? 15 : 100 + rng.nextInt(200)); } catch (InterruptedException ignored) { } }
    private void pfKick() {
        while (true) {
            int w = pfWorkers.get();
            if (w >= (pfBurst() ? 5 : 3) || pfQueue.isEmpty()) return;
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
    /** 가까운 지하철역 팝업(도착 · 노선)을 미리 받아 둔다: 위치로 가장 가까운 역을 서버에게 묻고(nearName), 그 역의 팝업 요청을 보내 역 시트 캐시에 넣는다 — 역을 누르면 바로 뜬다. 고르는 건 서버, 앱은 받아 둘 뿐. */
    private long nearStnAt; private String nearStnKey = "";
    private boolean pfNearStnRun(double[] ll, String theme) throws Exception {
        if (ll == null) return false;
        String sig = ((long) (ll[0] * 500)) + "," + ((long) (ll[1] * 500)) + "," + theme;
        long now = System.currentTimeMillis();
        if (sig.equals(nearStnKey) && now - nearStnAt < PF_SKIP_MS) return false;
        nearStnKey = sig; nearStnAt = now;
        MapCore g = new MapCore(new ShellCore.MemStore());
        g.modeOverride = "subway"; g.gps = new double[] { ll[0], ll[1] };
        NetPost.Res hr = NetPost.post(ShellCore.BASE + "/screen/map", g.headRequest(ShellCore.CAP, theme, ""), 8000);
        if (hr.status != 200 || hr.body == null) return false;
        g.onScreen(hr.body);
        if (g.nearName == null || g.nearName.length() == 0) return false;
        g.tapStation(g.nearName);
        final String json = g.stnRequest(ShellCore.CAP, theme);
        NetPost.Res sr = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
        if (sr.status != 200 || sr.body == null || sr.body.length() == 0) return false;
        final String txt = sr.body;
        main.post(new Runnable() { @Override public void run() { stnCachePut(json, txt); } });
        return true;
    }
    private boolean pfBusRun(double[] ll, String theme) throws Exception {
        if (ll == null) return false;                                               // 위치 없이 받은 '위치 없음' 화면을 캐시에 넣지 않는다
        boolean done = false;
        synchronized (pfBusLock) {
            pfMap.modeOverride = "bus";
            try {
                String bk = ShellCore.mapKey(ShellCore.S_MAPB, "bus", store, MapCore.cellOf(ll[0], ll[1]));          // 그 위치 칸의 화면 열쇠로 둔다(지금 보는 칸이 아니어도)
                pfMap.setBusLoc(ll[0], ll[1]);
                for (int round = 0; round < MapCore.BUS_ROUNDS; round++) {
                    NetPost.Res br = NetPost.post(ShellCore.BASE + "/screen/map", pfMap.bodyRequest(ShellCore.CAP, theme), 8000);
                    if (br.status != 200 || br.body == null) break;
                    pfMap.onScreen(br.body);
                    if (pfMap.busNeed.isEmpty()) { prefetchPut(bk, br.body, false); done = true; break; }
                    if (round == MapCore.BUS_ROUNDS - 1) break;
                    final List<String[]> need = new ArrayList<String[]>(pfMap.busNeed);
                    final String[] got = new String[need.size()];
                    Thread[] ts = new Thread[need.size()];
                    for (int i = 0; i < need.size(); i++) {
                        final int k = i;
                        ts[i] = new Thread(new Runnable() { @Override public void run() {
                            NetPost.Res r = MapCore.busGet(need.get(k)[0], need.get(k)[1], 9000, 4000);
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
    /** 위치: 지금 연속 위치가 있으면 그것, 없으면 마지막으로 안 위치(6시간 안). 없으면 null. */
    private double[] pfLL() {
        double[] l = liveLL();
        return l != null ? l : ShellCore.lastLocFresh(store, 6L * 3600000L, System.currentTimeMillis());
    }
    /** (뒤 스레드) 맛집 미리 받기: 도착지가 있으면 도착지로, 없으면(도착지 설정 전) 현위치로. 위치가 아직 없으면 건너뛴다(위치가 잡히면 warmLocTabs 가 다시 한다). */
    private static final long FOOD_PF_FRESH_MS = 30L * 60000L, FOOD_PF_GPS_GAP_MS = 10L * 60000L;     // 같은 장소 화면은 30분 안이면 다시 안 받는다 · 도착지가 없을 때 동네가 바뀌어 받는 건 10분에 한 번(공공데이터 호출 한도)
    private volatile long foodGpsPfAt;
    private boolean pfFoodRun(double[] ll, String dName, double dLa, double dLo) throws Exception {
        final boolean destOk = dName != null && dName.length() > 0;
        final String sig = ShellCore.foodSig(destOk, dLa, dLo, ll);
        if (sig.length() == 0) return false;                                  // 도착지도 위치도 아직 없다(위치가 잡히면 warmLocTabs 가 다시 한다)
        final String key = ShellCore.S_FOOD + "|" + sig;
        java.util.List<String> reqs = java.util.Collections.emptyList();
        synchronized (pfFood) {
            final boolean fresh = cacheAge(key) < FOOD_PF_FRESH_MS;              // 이 장소의 맛집 목록은 이미 받아 뒀다 — 목록은 다시 안 받지만, 이 상태기에 같은 도착지 목록이 있으면 가게 지도는 마저 받아 둔다
            if (fresh && !(destOk && pfFood.loaded && pfFood.dest.equals(dName.trim()))) return false;
            if (fresh) { double[] fg = food.gps; if (fg != null) pfFood.setGps(fg[0], fg[1]); else pfFood.gps = null; }
            if (!fresh) {
                long nowMs = System.currentTimeMillis();
                if (!destOk) { if (foodGpsPfAt != 0L && nowMs - foodGpsPfAt < FOOD_PF_GPS_GAP_MS) return false; foodGpsPfAt = nowMs; }
                pfFood.setDest(destOk ? dName : "", destOk ? dLa : 0, destOk ? dLo : 0);
                if (pfFood.needGps()) { if (ll != null) pfFood.setGps(ll[0], ll[1]); else return false; }
                if (destOk) { double[] fg = food.gps; if (fg != null) pfFood.setGps(fg[0], fg[1]); else pfFood.gps = null; }          // 도착지가 있으면 눌렀을 때 맛집 화면이 보낼 '내 위치'와 똑같이 — 미리 받은 가게 지도 요청과 글자까지 같아야 서버 없이 바로 열린다
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/food", pfFood.request(ShellCore.CAP, true), 12000);
                if (r.status != 200 || r.body == null) return true;
                pfFood.onScreen(r.body);
                if (pfFood.needData()) {
                    String su = pfFood.serverUrl();
                    String[] pu = new String[FoodCore.PUB_PAGES];
                    for (int i = 0; i < pu.length; i++) pu[i] = pfFood.publicUrl(i + 1);
                    pfFood.setData(foodDataNow(su, pfFood.sharedUrl(), pu));
                    NetPost.Res r2 = NetPost.post(ShellCore.BASE + "/screen/food", pfFood.request(ShellCore.CAP, true), 20000);
                    if (r2.status == 200 && r2.body != null) { pfFood.onScreen(r2.body); prefetchPut(key, r2.body, false); }
                } else prefetchPut(key, r.body, false);
            }
            reqs = new java.util.ArrayList<String>();
            for (String k : pfFood.goKeys(PANEL_PF_MAX)) { String rq = pfFood.panelRequestFor(ShellCore.CAP, k); if (rq.length() > 0 && panelCacheGet(rq) == null) reqs.add(rq); }
        }
        for (final String rq : reqs) foodNet.execute(new Runnable() { @Override public void run() {            // 도착지 주변 가게 지도(펼침)까지 전부 — 눌렀을 때 서버를 기다리지 않는다(위에서부터 3곳씩)
            try {
                if (panelCacheGet(rq) != null) return;
                NetPost.Res pr = NetPost.post(ShellCore.BASE + "/screen/food", rq, 8000);
                if (pr.status == 200 && pr.body != null && pr.body.indexOf("\"ok\":true") >= 0) panelCachePut(rq, pr.body);
            } catch (Throwable ignored) { }
        } });
        return true;
    }
    /** (주 스레드) 지금 맛집 탭이 쓸 장소 표시를 저장값에 맞춘다: 도착지가 있으면 도착지, 없으면 기기 위치. */
    private void foodSyncSig() {
        HomeCore.Loc d = home.loc[HomeCore.DEST];
        boolean ok = d != null && d.ok();
        String sig = ShellCore.foodSig(ok, ok ? d.lat : 0, ok ? d.lng : 0, pfLL());
        if (!sig.equals(store.get(ShellCore.K_FOODSIG, ""))) store.put(ShellCore.K_FOODSIG, sig);
    }
    /** 도착지가 확정되면(어느 길로 정해졌든) 맛집을 뒤에서 미리 받아 둔다. 1.5초마다 도착지 표시만 비교하고, 바뀐 뒤 1.2초 가만히 있으면 받는다(고르는 중엔 안 받는다). */
    private String foodWatchSig = "";
    private final Runnable foodWatchTick = new Runnable() { @Override public void run() { if (!resumed) return; foodWatch(); main.postDelayed(this, 1500L); } };       // 앱이 뒤로 가면 멈추고 onResume 이 다시 건다
    private void foodWatchStart() { main.removeCallbacks(foodWatchTick); main.postDelayed(foodWatchTick, 800L); }
    private void foodWatch() { foodWatch(1200L); }
    private void foodWatch(final long gapMs) {
        HomeCore.Loc d = home.loc[HomeCore.DEST];
        if (d == null || !d.ok()) { foodWatchSig = ""; return; }
        final String sig = ShellCore.foodSig(true, d.lat, d.lng, null);
        if (sig.equals(foodWatchSig)) return;
        foodWatchSig = sig;
        deb.trailing("foodwarm", gapMs, new Runnable() { @Override public void run() {
            HomeCore.Loc d2 = home.loc[HomeCore.DEST];
            if (d2 == null || !d2.ok() || !sig.equals(ShellCore.foodSig(true, d2.lat, d2.lng, null))) return;      // 그 사이 또 바뀌었다
            if ("food".equals(ShellCore.currentTab(store))) return;                                            // 맛집 탭을 보는 중이면 그쪽 로더가 받는다
            final String dn = d2.name; final double la = d2.lat, lo = d2.lng; final double[] ll = pfLL();
            pfAdd(0, new PfJob() { @Override public boolean run() throws Exception { return pfFoodRun(ll, dn, la, lo); } });
        } });
    }
    /** 위치가 새로 잡혔다: 켤 때 위치가 없어 건너뛴 위치 기반 화면(맛집 · 버스 노선도)을 지금 위치로 뒤에서 받아 둔다. 같은 곳에서는 3분에 한 번만. */
    private double[] warmLocLL; private long warmLocAt;
    private void warmLocTabs(final double la, final double lo) {
        try {
            long now = System.currentTimeMillis();
            if (prefetchAt == 0L) return;                                                                    // 켤 때 미리 받기가 아직 시작 전 — 그쪽이 마지막 위치로 이미 한다
            if (warmLocLL != null && now - warmLocAt < 180000L && Math.abs(warmLocLL[0] - la) < BUS_MOVE_DEG && Math.abs(warmLocLL[1] - lo) < BUS_MOVE_DEG) return;
            warmLocLL = new double[] { la, lo }; warmLocAt = now;
            final HomeCore.Loc d = home.loc[HomeCore.DEST];
            final String dName = d != null && d.ok() ? d.name : ""; final double dLa = d != null && d.ok() ? d.lat : 0, dLo = d != null && d.ok() ? d.lng : 0;
            final double[] ll = new double[] { la, lo };
            final String theme = ShellCore.theme(store), cur = ShellCore.currentTab(store), mapMode = map.mode();
            if (!"food".equals(cur)) pfAdd(1, new PfJob() { @Override public boolean run() throws Exception { return pfFoodRun(ll, dName, dLa, dLo); } });
            if (!("map".equals(cur) && "bus".equals(mapMode))) pfAdd(1, new PfJob() { @Override public boolean run() throws Exception {
                if (!pfNeeds(ShellCore.mapKey(ShellCore.S_MAPB, "bus", store, MapCore.cellOf(ll[0], ll[1])))) return false;
                return pfBusRun(ll, theme);
            } });
            pfAdd(2, new PfJob() { @Override public boolean run() throws Exception { return pfNearStnRun(ll, theme); } });
        } catch (Throwable ignored) { }
    }
    private void prefetchTabs() {
        if (pfPending.get() > 0) return;                                  // 아직 도는 중
        final boolean cold = prefetchAt == 0L;                            // 앱을 켠 뒤 첫 미리 받기(s276, YJ: 처음 켤 때는 강제로 받는다) — 쇼핑 · 소식 · 실시간소통의 모든 분류는 '최근에 받았다' 며 건너뛰지 않고 새로 받는다
        prefetchAt = System.currentTimeMillis();
        if (pfChat == null) pfChat = new ChatCore(store);
        if (pfMap == null) pfMap = new MapCore(store);
        if (pfMapB == null) pfMapB = new MapCore(store);
        final String cur = ShellCore.currentTab(store);
        final java.util.HashSet<String> live = new java.util.HashSet<String>();
        for (String sc : slots) live.add(sc);
        final String liveMode = ShellCore.mode(store), liveSel = chat.sel(), mapMode = map.mode(), theme = ShellCore.theme(store);
        final double[] ll = pfLL();                                       // 켤 때 위치가 아직 안 잡혔어도 마지막으로 안 위치(6시간 안)로 미리 받는다 — 새 위치가 잡히면 아래 warmLocTabs 가 다시 맞춘다
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
            for (String rg : new String[] { "busan", "daegu", "gwangju", "daejeon" }) {                 // 지하철 노선도의 다른 지방 노선(부산 · 대구 · 광주 · 대전)도 미리 — 눌렀을 때 바로 뜬다(서버가 정적으로 그리는 가벼운 화면)
                ShellCore.MemStore gs = new ShellCore.MemStore(); gs.put(MapCore.K_REG, rg);
                MapCore gm = new MapCore(gs); gm.modeOverride = "subway";
                ents.add(new String[] { ShellCore.mapKey(ShellCore.S_MAPH, "subway", gs), "/screen/map", "POST", gm.headRequest(ShellCore.CAP, theme, "") });
                ents.add(new String[] { ShellCore.mapKey(ShellCore.S_MAPB, "subway", gs), "/screen/map", "POST", gm.bodyRequest(ShellCore.CAP, theme) });
            }
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
        if (!live.contains(ShellCore.S_BOARD)) pfAdd(0, new PfJob() { @Override public boolean run() throws Exception {              // 게시판
            if (!pfNeeds(ShellCore.S_BOARD)) return false;
            String bb = boardBody(true);
            final String txt = screenCall(ShellCore.S_BOARD, false, ShellCore.BASE + "/screen/board", bb, null, 10000);
            if (txt.length() > 0 && !isNotMod(txt)) main.post(new Runnable() { @Override public void run() { board.onScreen(txt); } });
            return true;
        } });
        pfAdd(0, new PfJob() { @Override public boolean run() throws Exception { return prefetchNews(live.contains(ShellCore.S_NEWS), cold); } });    // 소식(모든 분류)
        pfAdd(1, new PfJob() { @Override public boolean run() throws Exception { return rloadFetch(); } });                                    // 경로 탐색 로딩 카드(글 · 모양은 엔진 — 한 번 받아 두면 앱을 끌 때까지 쓴다)
        pfAdd(1, new PfJob() { @Override public boolean run() throws Exception { boolean n = dlgFetch("exit"); n |= dlgFetch("report"); n |= dlgFetch("perm"); return n; } });      // 종료 · 신고 · 권한 안내 카드(글 · 단추 · 모양은 엔진)
        pfAdd(1, new PfJob() { @Override public boolean run() throws Exception {                // 노선도 버스(위치 → 정류장 → 도착정보 왕복이라 묶지 못한다)
            if (("map".equals(cur) && "bus".equals(mapMode)) || ll == null || !pfNeeds(ShellCore.mapKey(ShellCore.S_MAPB, "bus", store, MapCore.cellOf(ll[0], ll[1])))) return false;
            return pfBusRun(ll, theme);
        } });
        final String savedSels = store.get(ChatCore.K_SELS, "");           // 지난번에 엔진이 칩으로 준 방 목록(앱은 적어 둘 뿐) — 켜자마자 모든 방을 한꺼번에 받으려고
        if (pfChatB == null) pfChatB = new ChatCore(store);
        pfAdd(0, new PfJob() { @Override public boolean run() throws Exception {                // 대화방 전부: 원자료를 병렬로 받아 한 번에 엔진에 묻는다(방마다 차례로 받던 것을 한 번에 — s274)
            final String liveRoom = live.contains(ShellCore.S_CHAT) ? liveSel : "";
            ArrayList<String> sels = new ArrayList<String>(chatSels);
            if (sels.size() < 2) sels = ChatCore.decSels(savedSels);
            if (sels.size() < 2) { String c = onMainWait(new java.util.concurrent.Callable<String>() { @Override public String call() { return cacheGet(ShellCore.S_CHAT + "|all", false); } }); if (c != null) sels = chatSelsOf(c); }
            boolean net = false;
            if (sels.size() < 2) {                                                              // 처음 켬: 전체 방 하나만 먼저 받아 엔진이 칩으로 준 방 목록을 안다
                java.util.Map<String, String> m0 = pfChatAll(java.util.Arrays.asList("all"), liveRoom, theme, sec, cold);
                net = true;
                String src = m0.get("all");
                if (src != null) sels = chatSelsOf(src);
            }
            if (sels.size() >= 2) { chatSelsSet(sels); pfChatAll(sels, liveRoom, theme, sec, cold && !net); net = true; }
            return net;
        } });
        if (!"food".equals(cur)) pfAdd(1, new PfJob() { @Override public boolean run() throws Exception { return pfFoodRun(ll, dName, dLa, dLo); } });          // 맛집
        pfAdd(2, new PfJob() { @Override public boolean run() throws Exception { return pfNearStnRun(ll, theme); } });                                // 가까운 지하철역 팝업(위치 → 서버가 고른 가까운 역 → 팝업): 도착지 또는 현위치(고스트 상태기)
        pfAdd(1, new PfJob() { @Override public boolean run() throws Exception {                // 노선도 지하철의 호선 칩(전체·1~9호선·공항·경의중앙·수인분당·신분당) — 눌렀을 때 뼈대 없이 바로 뜨게 칩마다 머리·본문을 한 묶음으로 미리 받는다
            final String reg = store.get(MapCore.K_REG, "seoul");
            if (!"seoul".equals(reg)) return false;                                                  // 호선 칩은 서울에만 있다
            String hsrc = onMainWait(new java.util.concurrent.Callable<String>() { @Override public String call() { return cacheGet(ShellCore.mapKey(ShellCore.S_MAPH, "subway", store), true); } });
            boolean net = false;
            if (hsrc == null || hsrc.length() == 0) {                                                // 머리 글이 아직 없으면(처음 켬) 한 번 받아 칩 목록을 안다 — 칩 목록은 엔진이 정한다
                ShellCore.MemStore g0 = new ShellCore.MemStore(); g0.put(MapCore.K_REG, reg);
                MapCore m0 = new MapCore(g0); m0.modeOverride = "subway";
                NetPost.Res hr = NetPost.post(ShellCore.BASE + "/screen/map", m0.headRequest(ShellCore.CAP, theme, ""), 8000);
                net = true;
                if (hr.status != 200 || hr.body == null) return net;
                hsrc = hr.body;
            }
            final java.util.ArrayList<String[]> fe = new java.util.ArrayList<String[]>();
            for (String c : ShellCore.catValues(hsrc)) {
                if (!c.startsWith("f:")) continue;
                ShellCore.MemStore gs = new ShellCore.MemStore(); gs.put(MapCore.K_REG, reg); gs.put(MapCore.K_FLT, c.substring(2));
                MapCore gm = new MapCore(gs); gm.modeOverride = "subway";
                fe.add(new String[] { ShellCore.mapKey(ShellCore.S_MAPH, "subway", gs), "/screen/map", "POST", gm.headRequest(ShellCore.CAP, theme, "") });
                fe.add(new String[] { ShellCore.mapKey(ShellCore.S_MAPB, "subway", gs), "/screen/map", "POST", gm.bodyRequest(ShellCore.CAP, theme) });
            }
            if (fe.isEmpty()) return net;
            return pfBatch(fe) || net;
        } });
        pfAdd(0, new PfJob() { @Override public boolean run() throws Exception {                // 쇼핑: 엔진이 모든 분류 화면을 한 번에(alts) — 분류마다 서버를 따로 부르지 않는다(옛 워커면 아래에서 하나씩)
            String key = ShellCore.cacheKey(ShellCore.S_SHOP, store);
            boolean net = false;
            String cached = onMainWait(new java.util.concurrent.Callable<String>() { @Override public String call() { return cacheGet(ShellCore.cacheKey(ShellCore.S_SHOP, store), true); } });
            boolean missing = cold || pfNeeds(key);                       // 켠 뒤 첫 미리 받기는 강제(s276) — 최근에 받았어도 · 엔진이 '같다'고 해도 새로 받는다
            if (!missing && cached != null) for (String c : ShellCore.catValues(cached)) if (pfNeeds("shop|" + c)) { missing = true; break; }
            if (!missing && cached != null) { shopWarm(cached); return false; }
            forceNet.set(cold ? Boolean.TRUE : null);
            String base;
            try { base = shopCallAll(key, store.get(ShellCore.K_SHOP_CAT, "")); } finally { forceNet.remove(); }
            if (base.length() > 0) net = true;
            if (shopAltsOk) return net;                                   // 엔진이 모든 분류를 줬다 — 끝
            if (isNotMod(base) && cached != null) {                       // 엔진이 '같다'(304) — 다른 분류도 전에 같은 응답으로 받아 둔 것이라 모두 있으면 하나씩 다시 받지 않는다
                boolean all = true;
                for (String c : ShellCore.catValues(cached)) if (!haveCached("shop|" + c)) { all = false; break; }
                if (all) { shopWarm(cached); return net; }
            }
            String src = base.length() > 0 && !isNotMod(base) ? base : cached;
            if (src == null || src.length() == 0) return net;
            shopWarm(src);
            int fails = 0;
            for (String c : ShellCore.catValues(src)) {                   // 옛 워커(alts 없음) 대비: 분류별로 하나씩
                String ck = "shop|" + c;
                if (ck.equals(key) || (!cold && !pfNeeds(ck))) continue;
                pfGap();
                forceNet.set(cold ? Boolean.TRUE : null);
                String cr;
                try { cr = shopCall(ck, c); } finally { forceNet.remove(); }
                net = true;
                if (cr.length() > 0) fails = 0; else if (++fails >= 2) break;
            }
            return net;
        } });
    }
    /** 엔진이 전체 방 화면에 칩으로 준 방 목록(맨 앞 all 포함). 못 읽으면 빈 목록. */
    private ArrayList<String> chatSelsOf(String allScreen) {
        ArrayList<String> out = new ArrayList<String>();
        for (String c : ShellCore.catValues(allScreen)) if (!out.contains(c)) out.add(c);
        if (out.size() >= 2 && !out.contains("all")) out.add(0, "all");
        return out.size() >= 2 ? out : new ArrayList<String>();
    }
    /** 모든 방 목록을 기억한다(메모리 + 다음에 켤 때 쓰도록 저장소에). 앱은 엔진이 준 순서를 그대로 적어 둘 뿐이다. */
    private void chatSelsSet(final ArrayList<String> sels) {
        if (sels == null || sels.size() < 2 || sels.equals(chatSels)) return;
        chatSels = new ArrayList<String>(sels);
        final String enc = ChatCore.encSels(sels);
        main.post(new Runnable() { @Override public void run() { store.put(ChatCore.K_SELS, enc); } });
    }
    private final java.util.concurrent.atomic.AtomicBoolean pfChatBusy = new java.util.concurrent.atomic.AtomicBoolean();
    private static final int PF_CHAT_PAR = 6;                          // 방 원자료를 동시에 받는 수(대화 서버에 한꺼번에 몰리지 않게)
    /**
     * (뒤 스레드) 모든 방을 병렬로: ① 공지 · 전체 방 · 노선 방들의 원자료를 동시에 받고 ② 한 요청(엔진 alts)으로 방마다의 화면을 계산받아 ③ 방별로 캐시에 둔다.
     * 방마다 [받기 → 엔진 → 쉼] 을 차례로 하던 것(호선 18개면 수십 번의 왕복)을 '동시 받기 + 한 번 묻기' 로 줄였다. 방 화면은 엔진이 만들고 앱은 담아 둘 뿐이다.
     * sels: 받을 방(전체 포함) · skipSel: 지금 보는 방(6초 주기가 받는다) · 이미 싱싱한 방(CHAT_BG_FRESH_MS)은 건너뛴다.
     * @return 방 → 캐시에 둔 화면 글(전체 방은 "all"). 다른 순회가 돌고 있거나 통신을 못 했으면 빈 표.
     */
    private java.util.Map<String, String> pfChatAll(final java.util.List<String> sels, final String skipSel, final String theme, final java.util.List<String> sec, final boolean force) {
        final java.util.Map<String, String> stored = new java.util.LinkedHashMap<String, String>();
        if (!pfChatBusy.compareAndSet(false, true)) return stored;
        try {
            if (pfChatB == null) pfChatB = new ChatCore(store);
            final ChatCore g = pfChatB;
            final String me = ShellCore.commId(store);
            final int tzo = -java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000;
            // 무엇을 받을지: 지금 보는 방 · 싱싱한 방은 뺀다
            final ArrayList<String> want = new ArrayList<String>();
            for (String sel : sels) {
                if (sel == null || sel.length() == 0 || want.contains(sel) || sel.equals(skipSel)) continue;
                if (!force && cacheAge(ShellCore.S_CHAT + "|" + sel) < CHAT_BG_FRESH_MS) continue;
                want.add(sel);
            }
            if (want.isEmpty()) return stored;
            final boolean needAll = want.contains("all");
            final ArrayList<String[]> jobs = new ArrayList<String[]>();                       // {방 또는 "~notice", 주소}
            final boolean needNotice;
            synchronized (g) {
                g.routeSec = new ArrayList<String>(sec);
                needNotice = System.currentTimeMillis() - g.noticesAt > 60000;
                if (needNotice) jobs.add(new String[] { "~notice", ChatCore.noticesUrl() });
                for (String sel : want) jobs.add(new String[] { sel, "all".equals(sel) ? g.talksUrlNow() : g.roomUrl(sel) });
            }
            // ① 원자료 동시 받기
            final NetPost.Res[] res = new NetPost.Res[jobs.size()];
            java.util.concurrent.ExecutorService ex = java.util.concurrent.Executors.newFixedThreadPool(Math.min(PF_CHAT_PAR, jobs.size()), new java.util.concurrent.ThreadFactory() {
                @Override public Thread newThread(Runnable r) { Thread t = new Thread(r, "shell-pf-chat"); t.setDaemon(true); return t; }
            });
            try {
                java.util.ArrayList<java.util.concurrent.Callable<Object>> cs = new java.util.ArrayList<java.util.concurrent.Callable<Object>>();
                for (int i = 0; i < jobs.size(); i++) {
                    final int ix = i;
                    cs.add(new java.util.concurrent.Callable<Object>() { @Override public Object call() {
                        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);
                        String[] j = jobs.get(ix);
                        res[ix] = NetPost.get(j[1], "~notice".equals(j[0]) ? 8000 : "all".equals(j[0]) ? 7000 : 12000);
                        return null;
                    } });
                }
                ex.invokeAll(cs, 20, java.util.concurrent.TimeUnit.SECONDS);
            } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            finally { ex.shutdownNow(); }
            // ② 받은 것을 상태기에 합치고(차례로 — 상태기는 한 줄기로만 만진다) 받은 방만 골라 한 번에 묻는다
            final ArrayList<String> got = new ArrayList<String>();
            final String req;
            synchronized (g) {
                for (int i = 0; i < jobs.size(); i++) {
                    NetPost.Res r = res[i];
                    if (r == null || r.status != 200 || r.body == null) continue;
                    String k = jobs.get(i)[0];
                    if ("~notice".equals(k)) g.setNotices(r.body, System.currentTimeMillis());
                    else if ("all".equals(k)) { if (g.addTalks(r.body, me)) got.add(k); }
                    else if (g.addRoom(k, r.body)) got.add(k);
                }
                ArrayList<String> rooms = new ArrayList<String>(got); rooms.remove("all");
                req = got.isEmpty() ? "" : g.batchRequest(rooms, ShellCore.CAP, theme, tzo, me);
            }
            if (req.length() == 0) return stored;
            NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/chat", req, 12000);
            java.util.Map<String, String> m = r.status == 200 ? ChatCore.parseBatch(r.body) : new java.util.LinkedHashMap<String, String>();
            // ③ 방별 캐시(받지 못한 방 · 전체 방 글을 못 받았으면 그 방은 두지 않는다 — 오류 화면이 남지 않게)
            for (java.util.Map.Entry<String, String> e : m.entrySet()) {
                String sel = e.getKey();
                if (!got.contains(sel)) continue;
                prefetchPut(ShellCore.S_CHAT + "|" + sel, e.getValue(), false);
                stored.put(sel, e.getValue());
            }
            String allTxt = stored.get("all");
            if (allTxt != null && needAll) { ArrayList<String> ns = chatSelsOf(allTxt); if (ns.size() >= 2) chatSelsSet(ns); }          // 엔진이 준 방 목록이 바뀌었으면 맞춘다
            return stored;
        } finally { pfChatBusy.set(false); }
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
    private boolean prefetchNews(boolean live, boolean force) {
        String curKey = ShellCore.cacheKey(ShellCore.S_NEWS, store);
        ShellCore.Cond nc = condOf("newsalts");
        long nowMs = System.currentTimeMillis();
        if (!force && nc != null && nowMs - nc.at < PF_SKIP_MS && haveCached(curKey)) return false;
        String[] feeds = feedsAll(ShellCore.feedUrls(ShellCore.S_NEWS), 8000);
        ShellCore.NewsRows rows = ShellCore.NewsRows.from(feeds);
        String body = ShellCore.newsBody(store, rows, true);
        final int sg = body.hashCode();
        if (!force && nc != null && nc.sig == sg && haveCached(curKey) && nowMs - nc.at < 60000L) return false;            // 같은 기사 목록이고 엔진이 말한 신선 시간(1분) 안
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
                try { String dg = netDiag.get(ck); v.setScreen(ScreenCore.load(ShellCore.errorScreen(dg)), false); shownJson.remove(v); shownKey.remove(v); skelViews.remove(v); fadeIn(v); scheduleRetry(v, ShellCore.DEFAULT_RETRY); return; } catch (Throwable ignored) { }
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
            if (v != sheetView) { shownJson.put(v, json); shownKeyPut(v); neighborPre(v, sc, ck); if (ck != null && ck.startsWith(ShellCore.S_SETTINGS + "|")) cmPrefetchTp(); }
            if (ck != null && v != sheetView && !partialScreen(ck)) cachePut(ck, json);
            if (!keep && v != sheetView && !(ck != null && ck.startsWith(ShellCore.S_CHAT + "|"))) fadeIn(v);          // 소통방은 흐릿하게 떠오르지 않고 바로 또렷하게(s286)
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
            try { v.setScreen(parsedGet(json), false); shownJson.remove(v); shownKey.remove(v); skelViews.remove(v); fadeIn(v); }
            catch (Throwable e) { try { v.setScreen(ScreenCore.load(ShellCore.errorScreen()), false); shownJson.remove(v); shownKey.remove(v); skelViews.remove(v); } catch (Throwable ignored) { } }
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

    /** 엔진이 정한 안내 글을 띄운다(비어 있으면 아무것도 안 띄운다). */
    private void toastTx(String m) { if (m != null && m.length() > 0) toast(m); }
    /** 하단 토스트 문구는 띄우지 않는다(YJ: 하단 팝업은 전부 없앤다 · s216). 호출은 그대로 두고 여기서 삼킨다. */
    private void toast(String m) { }

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
    private void toastMain(final String m) { if (m != null && m.length() > 0) main.post(new Runnable() { @Override public void run() { toast(m); } }); }

    // ───────────── 눌림 ─────────────
    private Host hostHead, hostBody;
    /**
     * 좌우 밀기(웹 _commSwipeStep · 쇼핑 · 맛집). dir -1 = 왼쪽으로 밀기 · +1 = 오른쪽으로 밀기.
     * 어디로 넘길지(다음 칩 · 끝에서 처음으로 도는지 · 다른 탭)는 전부 엔진이 화면에 담아 준 sw 다 — 앱은 그 행동을 그대로 실행하고 미끄러지는 그림만 낸다(계산 없음).
     * @return 몸짓을 쓴 경우(넘길 곳이 없어 멈추는 것도 포함) true
     */
    private boolean commSwipe(int dir) {
        String tab = ShellCore.currentTab(store);
        if (!("home".equals(tab) || "community".equals(tab) || "shop".equals(tab) || "food".equals(tab) || "map".equals(tab)) || (dir != -1 && dir != 1)) return false;
        if ("home".equals(tab) && (!home.hasRoute() || home.riding())) return true;                    // 경로 확정 뒤엔 결과 카드를 밀어 탭을 바꾸지 않는다
        ScreenCore.Screen sc = body.currentScreen();
        if (sc == null) return true;
        if (sc != swSeen) { swSeen = sc; swc.onScreen(sc, tab, "community".equals(tab) ? chat.sel() : ""); }                // 새 화면이 왔다 — 그 화면의 칸·순환표로 맞춘다(뼈대·오류 화면은 앞의 표를 둔다)
        ScreenCore.Act a = dir == -1 ? sc.swL : sc.swR;
        boolean headHost = dir == -1 ? sc.swLh : sc.swRh;
        String cat = dir == -1 ? sc.swLc : sc.swRc;
        ScreenCore.Act cont = swc.pick(dir, tab, ShellCore.expectId(viewKey.get(body)));       // 다음 칸 화면이 아직 안 왔어도(옛 화면 · 뼈대) '지금 고른 칸'에서 이어 넘긴다 — 같은 칸을 되풀이하지 않는다
        if (cont != null) { a = cont; headHost = false; cat = ""; }
        if (a == null) return true;                                              // 엔진이 넘길 곳을 주지 않았다 = 이 끝에서 멈춘다
        if (cat.length() > 0) store.put(ShellCore.K_NEWS_CAT, cat);              // 뉴스로 넘어갈 때 먼저 켤 카테고리(엔진이 정함)
        swc.note(a); body.lightChip(a);                                          // 넘긴 칸을 적고, 위 칩 줄도 새 화면을 기다리지 않고 그 칸을 켠다(칩을 눌렀을 때와 같다)
        body.slideNext(dir);
        (headHost ? hostHead : hostBody).handle(a, false);
        return true;
    }
    private final SwipeCore swc = new SwipeCore();
    private ScreenCore.Screen swSeen;
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
        @Override public void onSearch(ScreenCore.Act a, String q) {
            if (ShellCore.S_SETTINGS.equals(screenName()) && a != null && "call".equals(a.a) && a.v != null && a.v.startsWith("pk.")) { cmInlineAct("call", a.v, null, false, q); return; }          // 설정 화면 안 장소 입력칸의 [저장] · 엔터
            apply(ShellCore.routeSearch(a.tpl, a.empty, q));
        }
        @Override public void onInputFocus(boolean on) { if (on) applyIme(); }
        @Override public void onFirstDraw() { }
        @Override public void onText(String key, String value, String kind) {
            if (ShellCore.S_SETTINGS.equals(screenName()) && key != null && key.startsWith("cmp.")) { cmText(key.substring(4), value, kind); return; }
            if (!ShellCore.S_HOME.equals(screenName())) return;
            homeText(key, value, kind);
        }
        @Override public void onContentH(float dp) {
            if (which != 0 || slots.length < 2) return;           // 머리 칸만 그린 내용 높이에 맞춘다
            final int h = Math.max(1, Math.round(dp * dpr));
            ViewGroup.LayoutParams lp = head.getLayoutParams();
            if (lp != null && lp.height != h) { lp.height = h; head.setLayoutParams(lp); }
        }

        void handle(ScreenCore.Act a, boolean on) {
            if (which == 3) return;
            if (which != 2) swc.note(a);                          // 칩을 눌러 고른 칸도 적어 둔다 — 그 칸 화면이 오기 전에 밀어도 거기서부터 넘어간다
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
            } else if (ShellCore.S_SETTINGS.equals(screenName()) && cmInlineOwns(a)) {
                cmInlineAct(a.a, a.v, a.key, on, "pk.n".equals(a.v) ? a.id : (a.v != null && a.v.startsWith("pk.save.") ? body.fields().get("cmp." + a.v.substring(8)) : null));
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
            case ShellCore.E_TAB: if (sheet != null && ShellCore.S_DETAIL.equals(sheetName)) closeSheet(); showTab(e.arg); break;           // 세부경로가 떠 있어도 하단탭이 눌린다 — 시트는 닫고 그 탭으로
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
    private long chatSwipeAt, chatWarmAt, chatBgAt;               // 방을 마지막으로 넘긴 때 · 이웃 방을 마지막으로 미리 받은 때 · 모든 방을 마지막으로 훑은 때(uptime)
    // s291: 6초마다 새로 받던 방식을 '붙들고 기다리는 요청(롱폴)'으로 바꿨다. 서버가 새 글이 생기는 즉시(1초 안) 돌려주고, 조용한 방은 18초에 한 번만 묻는다.
    //   chatTick 은 1초마다 지켜보는 감시자일 뿐이다: 소통방이 앞에 있으면 지금 방의 라이브 요청이 돌고 있게 하고, 방이 바뀌었으면 앞 요청을 끊고 새 방으로 다시 걸고,
    //   화면을 떠났으면 끊는다. 가장 나중 것만 쓰는 규칙은 Latest 한 곳이 맡는다(옛 방의 늦은 결과는 표가 죽어 올라오지 않는다).
    private static final int CHAT_LIVE_WAIT_S = 18, CHAT_LIVE_READ_MS = 24000;
    private final Latest chatLive = new Latest();
    private volatile Latest.Token chatLiveTok;
    private volatile String chatLiveSel = "";
    private volatile long chatLiveBuildAt;
    private volatile boolean chatNoticeBusy;
    private int chatFetching;                                                       // 사람이 연(방 넘기기 · 글 올리기) 받기가 도는 개수 · 주 스레드에서만
    private boolean chatRebuildAgain;                                               // 그 사이 라이브가 새 글을 받았다 — 받기가 끝나면 한 번 더 그린다
    private boolean chatVisible() { return ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "") && resumed; }
    private final Runnable chatTick = new Runnable() {
        @Override public void run() {
            chatPolling = false;
            if (!chatVisible()) { chatLive.cancel(); chatLiveTok = null; return; }          // 화면을 떠나면 붙들고 있던 요청도 바로 끊는다
            chatLiveCheck();
            chatPolling = true; main.postDelayed(this, 1000L);
        }
    };
    /** 지금 방의 라이브 요청이 돌고 있게 한다(방이 바뀌었으면 앞 요청을 끊고 새로). 방을 넘기는 중(0.4초 안)에는 멈출 때까지 기다린다. */
    private void chatLiveCheck() {
        if (!chatVisible()) return;
        String sel = chat.sel();
        Latest.Token t = chatLiveTok;
        if (t != null && t.live() && sel.equals(chatLiveSel)) return;
        if (android.os.SystemClock.uptimeMillis() - chatSwipeAt < 400L) return;
        chatLiveStart(sel);
    }
    private void chatLiveStart(final String sel) {
        final Latest.Token t = chatLive.begin();                                          // 앞 방의 표는 여기서 죽고 읽던 연결이 끊긴다
        chatLiveTok = t; chatLiveSel = sel;
        final String me = ShellCore.commId(store);
        Thread th = new Thread(new Runnable() {
            @Override public void run() {
                int fails = 0;
                while (t.live()) {
                    final String url; synchronized (chat) { url = chat.liveUrl(sel, CHAT_LIVE_WAIT_S); }
                    if (url == null) { if (!chatSleep(t, 700L)) break; continue; }          // 이 방을 아직 한 번도 못 받았다 — 첫 보통 요청이 끝날 때까지 잠깐
                    long t0 = android.os.SystemClock.uptimeMillis();
                    NetPost.Res r = NetPost.getLive(url, CHAT_LIVE_READ_MS, t);
                    if (!t.live()) break;
                    long dt = android.os.SystemClock.uptimeMillis() - t0;
                    if (r.status == 200 && r.body != null) {
                        fails = 0;
                        int fl = ChatCore.liveFlag(r.body);
                        boolean got;
                        synchronized (chat) { got = "all".equals(sel) ? chat.addTalks(r.body, me) : chat.addRoom(sel, r.body); }
                        long now = android.os.SystemClock.uptimeMillis();
                        if (got && (fl != 0 || now - chatLiveBuildAt > 30000L)) {          // 새 글이 있거나(옛 서버는 늘) · 조용해도 30초에 한 번은 '몇 분 전' 글자를 새로
                            chatLiveBuildAt = now;
                            main.post(new Runnable() { @Override public void run() { if (!(t.live() && sel.equals(chat.sel()) && chatVisible())) return; if (chatFetching > 0) { chatRebuildAgain = true; return; } loadChat(body, true, false); } });          // 사람이 연 받기가 도는 중이면 그 그림을 가로채지 않고 끝난 뒤에 한 번 더
                        }
                        chatNoticesMaybe();
                        long gap = fl < 0 ? CHAT_POLL_MS - dt : (dt < 1500L ? 1500L - dt : 0L);          // 옛 서버(붙들지 않고 바로 옴)는 예전처럼 6초 간격 · 서버가 붙들지 못한 응답도 1.5초는 쉰다
                        if (gap > 0 && !chatSleep(t, gap)) break;
                    } else {
                        fails++;
                        if (!chatSleep(t, Math.min(30000L, 2000L * fails))) break;                // 실패는 점점 길게 쉰다
                    }
                }
                main.post(new Runnable() { @Override public void run() { if (chatLiveTok == t) chatLiveTok = null; } });
            }
        }, "shell-chat-live");
        th.setDaemon(true); th.start();
    }
    /** 취소 표가 죽으면 곧바로 false. 아니면 ms 만큼 쉬고 true. */
    private static boolean chatSleep(Latest.Token t, long ms) {
        long end = android.os.SystemClock.uptimeMillis() + ms;
        while (t.live()) {
            long left = end - android.os.SystemClock.uptimeMillis();
            if (left <= 0) return true;
            try { Thread.sleep(Math.min(left, 300L)); } catch (InterruptedException ie) { return false; }
        }
        return false;
    }
    /** 공지는 60초에 한 번 새로 받는다(바뀌었을 때만 화면을 다시 그린다). */
    private void chatNoticesMaybe() {
        if (chatNoticeBusy || System.currentTimeMillis() - chat.noticesAt <= 60000L) return;
        chatNoticeBusy = true;
        Thread nt = new Thread(new Runnable() { @Override public void run() {
            try {
                NetPost.Res nr = NetPost.get(ChatCore.noticesUrl(), 8000);
                if (nr.status == 200) {
                    String before = chat.noticesJson;
                    chat.setNotices(nr.body, System.currentTimeMillis());
                    if (!before.equals(chat.noticesJson)) main.post(new Runnable() { @Override public void run() { if (chatVisible()) loadChat(body, true, false); } });
                }
            } finally { chatNoticeBusy = false; }
        } }, "shell-chat-notice2");
        nt.setDaemon(true); nt.start();
    }
    private void startChatPoll() { if (!chatPolling) { chatPolling = true; main.postDelayed(chatTick, 1000L); } }

    /** 실시간소통: 이 방의 대화(전체 /talks · 노선 /lroom)와 공식 공지를 받고 엔진에 그릴 화면을 묻는다. */
    private void loadChat(final ScreenView v, final boolean keep, final boolean fetch) {
        chatRouteSync(false);
        final Latest.Token my = chatLatest.begin();
        final String sel = chat.sel(), me = ShellCore.commId(store);
        if (fetch) { PerfLog.begin("chat.ld"); chatFetching++; }
        startChatPoll();
        new Thread(new Runnable() {
            @Override public void run() {
                final String body = chatBody(fetch, sel, me);
                final String txt = screenCall(ShellCore.S_CHAT + "|" + sel, false, ShellCore.BASE + "/screen/chat", body, null, 10000); warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    if (fetch) { chatFetching = Math.max(0, chatFetching - 1); if (chatFetching == 0 && chatRebuildAgain && my.live() && chatVisible()) { chatRebuildAgain = false; main.post(new Runnable() { @Override public void run() { if (chatVisible() && chatFetching == 0) loadChat(ShellActivity.this.body, true, false); } }); } }          // 받는 사이 라이브 쪽에서 온 새 글이 있었으면 이번 그림 뒤에 한 번 더
                    if (!my.live()) return;
                    if (!sel.equals(chat.sel())) return;                       // 방을 넘기는 사이 늦게 온 옛 방 화면 — 올리지 않는다(방이 되돌아가고 글 올릴 방이 어긋나던 문제 · s286). 받은 화면은 캐시에 이미 들어갔다
                    present(v, txt, keep);
                    if (txt.length() > 0 && !isNotMod(txt)) { chat.onScreen(txt); PerfLog.end("chat.sw", "소통방 전환(못 받은 방)"); PerfLog.end("chat.ld", "소통방 받기→화면"); }
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
                synchronized (chat) { if (tr.status == 200) chat.addTalks(tr.body, me); else chat.failed = !chat.loaded; }
            } else {
                NetPost.Res rr = NetPost.get(chat.roomUrl(sel), 12000);
                synchronized (chat) { if (rr.status == 200) chat.addRoom(sel, rr.body); else chat.failed = !chat.loaded; }
            }
            if (nt != null) { try { nt.join(9000); } catch (InterruptedException ignored) { } }
        }
        synchronized (chat) { return chat.requestFor(sel, true, ShellCore.CAP, ShellCore.theme(store), -java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000, me, System.currentTimeMillis()); }          // 받은 방(sel)의 화면을 묻는다 — 그 사이 고른 방(chat.sel())이 바뀌었어도 다른 방 화면이 이 방 열쇠로 캐시에 들어가지 않게(s289)
    }
    /**
     * 호선 방 좌우 밀기를 부드럽게: 지금 방 둘레(앞뒤 2칸)의 방 화면을 뒤에서 미리 받아 둔다(이미 45초 안에 받은 방은 건너뜀 · 마지막 방 바뀐 뒤 0.7초 가만히 있을 때만 · 고스트 상태기라 지금 화면을 건드리지 않는다).
     * 받은 화면은 검증까지 미리 마쳐(parsedGet) 밀 때 주 스레드가 글을 읽지 않는다. 앱을 켤 때 받아 둔 방도 메모리에서 밀려나 있으면 여기서 다시 채운다.
     */
    private static final long CHAT_NEAR_FRESH_MS = 45000L;
    private ChatCore pfChatN, pfChatB;
    private final java.util.HashSet<String> chatWarmBusy = new java.util.HashSet<String>();
    private void chatWarmSoon() {
        long n = android.os.SystemClock.uptimeMillis();
        if (n - chatWarmAt >= 500L) { chatWarmAt = n; chatWarmRun(); return; }          // 0.5초에 한 번은 바로(계속 밀 때도 이웃 방이 받아진다)
        deb.trailing("chatwarm", 500L, new Runnable() { @Override public void run() { chatWarmAt = android.os.SystemClock.uptimeMillis(); chatWarmRun(); } });
    }
    private void chatWarmRun() {
            if (!ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "") || !resumed) return;
            int[] oi = new int[1];
            ScreenCore.Act[] inner = body.chipActs(oi);
            if (oi[0] < 0 || inner == null) return;
            final String theme = ShellCore.theme(store);
            if (pfChatN == null) pfChatN = new ChatCore(store);
            final ArrayList<String> sec = new ArrayList<String>(chat.routeSec);
            for (int dk : new int[] { 1, -1, 2, -2, 3, -3 }) {
                int i = oi[0] + dk;
                if (i < 0 || i >= inner.length || inner[i] == null || !"cat".equals(inner[i].a)) continue;
                final String sel = inner[i].v, key = ShellCore.S_CHAT + "|" + sel;
                final String c = cacheGet(key, false);
                if (c != null) ioExec.execute(new Runnable() { @Override public void run() { warm(c); try { final ScreenCore.Screen n = parsedGet(c); main.post(new Runnable() { @Override public void run() { try { body.preLayout(n); } catch (Throwable ignored) { } } }); } catch (Throwable ignored) { } } });          // 글 읽기 + 배치를 미리(밀 때 주 스레드가 안 읽고 안 재도록)
                if (cacheAge(key) < CHAT_NEAR_FRESH_MS) continue;
                synchronized (chatWarmBusy) { if (!chatWarmBusy.add(sel)) continue; }          // 이미 받는 중인 방은 또 줄 세우지 않는다(0.5초마다 불러도 겹치지 않게)
                pfAdd(0, new PfJob() { @Override public boolean run() throws Exception { try { return pfChatRoom(sel, theme, sec); } finally { synchronized (chatWarmBusy) { chatWarmBusy.remove(sel); } } } });
            }
    }
    /** (뒤 스레드) 방 하나를 고스트 상태기로 받아 캐시에 둔다. 받았으면 true. */
    private boolean pfChatRoom(String sel, String theme, ArrayList<String> sec) {
        synchronized (pfChatN) {
            String me = ShellCore.commId(store);
            int tzo = -java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000;
            pfChatN.routeSec = new ArrayList<String>(sec);
            if (System.currentTimeMillis() - pfChatN.noticesAt > 60000) {
                NetPost.Res nr = NetPost.get(ChatCore.noticesUrl(), 8000);
                if (nr.status == 200) pfChatN.setNotices(nr.body, System.currentTimeMillis());
            }
            if ("all".equals(sel)) { NetPost.Res tr = NetPost.get(pfChatN.talksUrlNow(), 7000); if (tr.status == 200) pfChatN.addTalks(tr.body, me); }
            else { NetPost.Res rr = NetPost.get(pfChatN.roomUrl(sel), 12000); if (rr.status == 200) pfChatN.addRoom(sel, rr.body); }
            if (!("all".equals(sel) ? pfChatN.hasTalks() : pfChatN.hasRoom(sel))) return false;          // 글을 못 받았으면 오류 화면을 캐시에 남기지 않는다(다음 순회에 다시)
            String body = pfChatN.requestFor(sel, false, ShellCore.CAP, theme, tzo, me, System.currentTimeMillis());
            screenCall(ShellCore.S_CHAT + "|" + sel, false, ShellCore.BASE + "/screen/chat", body, null, 10000);
        }
        return true;
    }
    /**
     * 모든 호선 방을 뒤에서 계속 받아 둔다(YJ: 모든 호선이 백그라운드에서 계속 작동 · 눌렀을 때 빈 화면 없이 바로). 앱이 앞에 있는 동안 20초마다
     * 지금 보는 방(6초 주기로 따로 받는다)을 뺀 모든 방을 차례로 새로 받아 화면 캐시에 둔다 — 호선 칩을 누르면 늘 최근 화면이 즉시 뜬다.
     * 방 목록은 켤 때 미리 받기가 엔진의 칩으로 알아 둔 chatSels. 받기는 뒤 스레드 큐라 화면을 막지 않는다.
     */
    private static final long CHAT_BG_MS = 20000L, CHAT_BG_FRESH_MS = 15000L;
    private volatile ArrayList<String> chatSels = new ArrayList<String>();
    private boolean chatBgOn;
    private final Runnable chatBg = new Runnable() { @Override public void run() {
        chatBgOn = false;
        if (isFinishing()) return;
        if (resumed) { chatBgAt = android.os.SystemClock.uptimeMillis(); chatBgSweep(); }
        chatBgOn = true; main.postDelayed(this, CHAT_BG_MS);
    } };
    /** 소통방을 열 때(첫 진입 · 오래 뒤 복귀) 다른 모든 방도 바로 훑어 받는다 — 20초 주기를 기다리지 않고(s286). */
    private void chatBgKick() { long n = android.os.SystemClock.uptimeMillis(); if (n - chatBgAt < 15000L) return; chatBgAt = n; chatBgSweep(); }
    private void chatBgStart() { if (!chatBgOn) { chatBgOn = true; main.postDelayed(chatBg, 4000L); } }
    /** 방마다 엔진이 만든 '불러오는 중' 화면(방 → 화면 글). 칩 줄·테마·탄 노선이 바뀌면(sig) 다시 받는다. */
    private volatile java.util.Map<String, String> chatLoad = new java.util.HashMap<String, String>();
    private String chatLoadSig = ""; private long chatLoadAt = 0L;
    private void chatLoadBuild(final ArrayList<String> sels) {
        final String theme = ShellCore.theme(store);
        final String sig = theme + "|" + store.get(ChatCore.K_MY, "[]") + "|" + chat.routeSec + "|" + sels;
        long now = System.currentTimeMillis();
        if (sig.equals(chatLoadSig) && now - chatLoadAt < 10 * 60000L) return;
        chatLoadSig = sig; chatLoadAt = now;
        if (pfChatB == null) pfChatB = new ChatCore(store);
        final ArrayList<String> sec = new ArrayList<String>(chat.routeSec);
        final String me = ShellCore.commId(store);
        pfAdd(0, new PfJob() { @Override public boolean run() throws Exception {
            int tzo = -java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000;
            String req;
            synchronized (pfChatB) { pfChatB.routeSec = new ArrayList<String>(sec); req = pfChatB.loadingBatchRequest(sels, ShellCore.CAP, theme, tzo, me); }
            NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/chat", req, 12000);
            java.util.Map<String, String> m = r.status == 200 ? ChatCore.parseLoadingBatch(r.body) : null;
            if (m == null || m.isEmpty()) { main.post(new Runnable() { @Override public void run() { chatLoadSig = ""; } }); return true; }         // 못 받았으면 다음 순회에 다시
            chatLoad = m;
            return true;
        } });
    }
    private void chatBgSweep() {
        final ArrayList<String> sels = chatSels;
        if (sels != null && sels.size() >= 2) chatLoadBuild(sels);
        if (sels == null || sels.size() < 2 || pfPending.get() > 4) return;
        final boolean chatShown = ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "");
        final String liveSel = chat.sel(), theme = ShellCore.theme(store);
        final ArrayList<String> sec = new ArrayList<String>(chat.routeSec);
        if (pfChatB == null) pfChatB = new ChatCore(store);          // 이 일만 쓰는 따로의 고스트 상태기(다른 미리 받기와 상태를 섞지 않는다)
        final ArrayList<String> order = new ArrayList<String>(sels);
        pfAdd(2, new PfJob() { @Override public boolean run() throws Exception {
            return !pfChatAll(order, chatShown ? liveSel : "", theme, sec, false).isEmpty();           // 모든 방을 한꺼번에(동시 받기 + 한 번 묻기) — 지금 보는 방은 6초 주기가 받는다
        } });
    }
    private String chatRtSig = "", chatRtLive = "";
    /**
     * 실시간소통 칩 줄이 쓰는 경로 노선 · 탑승 위치를 지금 경로 상태에 맞춘다(s318, YJ).
     * 경로가 없으면(안내 종료 · 새로 찾기) 둘 다 비운다 → 호선 순서가 원래대로. 탑승 중이면 탑승 서비스의 장면 재료를 실어 보내
     * '지금 타는 노선부터 남은 노선'만 앞에 오게 한다(어느 노선을 앞에 둘지는 엔진이 정한다). 경로 노선이 바뀌면 옛 칩 줄로 받아 둔 소통방 화면을 버리고,
     * 소통방이 보이는 중이면 탑승 위치가 바뀔 때마다 다시 그린다.
     */
    private void chatRouteSync() { chatRouteSync(true); }
    private void chatRouteSync(boolean redraw) {
        boolean has = home.hasRoute();
        ArrayList<String> sec = has ? new ArrayList<String>(home.resSec) : new ArrayList<String>();
        String live = has && home.riding() && RideService.running && RideService.liveScene != null ? RideService.liveScene : "";
        chat.routeSec = sec; ChatCore.liveRide = live;
        String sig = sec.toString() + (live.length() > 2 ? "|ride" : "");
        boolean routeChanged = !sig.equals(chatRtSig);
        boolean liveChanged = !live.equals(chatRtLive);
        chatRtSig = sig; chatRtLive = live;
        if (routeChanged) chatDropShown();
        if (redraw && (routeChanged || liveChanged) && chatVisible()) reloadChat();
    }
    /** 옛 칩 줄로 만든 소통방 화면(메모리 · 파일)을 버린다 — 다음에 열 때 새 칩 줄로 받는다. */
    private void chatDropShown() {
        java.util.ArrayList<String> keys = new java.util.ArrayList<String>();
        keys.add(ShellCore.S_CHAT + "|all");
        for (String k : scrKeys) if (k.startsWith(ShellCore.S_CHAT + "|") && !keys.contains(k)) keys.add(k);
        for (String sel : ChatCore.decSels(store.get(ChatCore.K_SELS, ""))) { String k = ShellCore.S_CHAT + "|" + sel; if (!keys.contains(k)) keys.add(k); }
        for (final String k : keys) {
            scrCache.remove(k); scrKeys.remove(k); diskPre.remove(k); diskIdx.remove(diskName(k));
            ioExec.execute(new Runnable() { @Override public void run() { try { diskFile(k).delete(); } catch (Throwable ignored) { } } });
        }
    }
    private void reloadChat() { if (ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadChat(body, true, false); }

    /** 방금 친 글을 지금 보이는 대화 화면 끝에 바로 보탠다: 엔진이 화면에 담아 준 내 말풍선 틀(info.echo)에 글만 채운다 — 통신 없이 그려, 보내자마자 뜬다. 진짜 화면은 곧 서버 글로 바뀐다. */
    private void chatEcho(final String text, final String sel) {
        final String cur = shownJson.get(body);
        if (cur == null || cur.length() < 20) return;
        Thread t = new Thread(new Runnable() { @Override public void run() {
            final String nj = ChatCore.withEcho(cur, text);
            if (nj == null) return;
            final ScreenCore.Screen scr;
            try { scr = parsedGet(nj); } catch (Throwable e) { return; }
            main.post(new Runnable() { @Override public void run() {
                if (!sel.equals(chat.sel()) || !cur.equals(shownJson.get(body)) || !ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "")) return;       // 그 사이 방이 바뀌었거나 새 화면이 올라왔다
                body.setScreen(scr, true); shownJson.put(body, nj); body.scrollToEnd();
            } });
        } }, "shell-chat-echo");
        t.setPriority(Thread.MAX_PRIORITY - 1); t.start();
    }
    private void chatAct(ScreenCore.Act a, final ScreenView src) {
        if ("cat".equals(a.a)) {
            chat.select(a.v); chatSwipeAt = android.os.SystemClock.uptimeMillis();
            PerfLog.begin("chat.sw");                                            // s290: 구간 시간 — 방을 고른 때부터 그 방 글이 화면에 뜰 때까지
            final boolean shown = keyedShow(body, ShellCore.S_CHAT);
            if (shown) PerfLog.end("chat.sw", "소통방 전환(받아 둔 방)");
            if (!shown) showSkeleton(body, ShellCore.S_CHAT);                    // 아직 못 받은 방: 받는 동안 옛 방이 그대로 멈춰 보이지 않게 바로 뼈대로 넘긴다(밀기 모션도 곧장 시작)
            chatWarmSoon();                                                      // 이웃 방은 멈출 때까지 기다리지 않고 지금부터 받는다(계속 밀어도 앞 방이 이미 받아져 있게 · s286)
            deb.trailing("chatsel", shown ? 220L : 60L, new Runnable() { @Override public void run() { loadChat(body, shown, true); chatWarmSoon(); chatLiveCheck(); } });      // 받아 둔 방은 화면이 이미 떠 있으니 220ms · 못 받은 방은 기다릴 까닭이 없어 60ms      // 연달아 밀면 마지막 방만 새로 받는다(밀기 모션과 겹쳐 버벅이지 않게 · 통신도 줄인다)
            return;
        }
        if (!"call".equals(a.a)) return;
        final String me = ShellCore.commId(store);
        int r = chat.act(a.v, a.id, src.fields(), me);
        switch (r) {
            case ChatCore.R_NEED_ID: toast("설정에서 커뮤니티 아이디를 등록하면 글과 제보를 남길 수 있어요"); break;
            case ChatCore.R_SEND: {
                final String line = "all".equals(chat.pendingLine) ? chat.postLine : chat.pendingLine, text = chat.pendingText;
                final String json = ChatCore.sendBody(me, text, line);
                final String fk = "all".equals(chat.pendingLine) ? "chat.all" : "chat.room";
                final String vsel = chat.sel();
                chat.addPend(vsel, text, System.currentTimeMillis());                          // s330: 보낸 즉시 내 말풍선(전송 중)을 그린다 — 서버 · 검사 답을 기다리지 않는다(0.1초)
                src.setField(fk, "");
                chatEcho(text, vsel);
                new Thread(new Runnable() {
                    @Override public void run() {
                        final String bad = rulesCheck("chat", "", text);
                        if (bad.length() > 0) {                                                  // 올리지 못하는 글 — 말풍선을 거두고 입력칸을 되돌린다
                            chat.dropPend(text);
                            main.post(new Runnable() { @Override public void run() { src.setField(fk, text); toast(bad); loadChat(body, true, false); } });
                            return;
                        }
                        NetPost.Res rr = NetPost.post(ShellCore.BOARD_BASE + "/react", json, 9000);
                        final String why = rr.status == 200 && rr.body != null && rr.body.contains("\"stored\"") ? "" : (rr.status == 0 ? "네트워크가 불안정해요" : rr.body != null && rr.body.contains("filtered") ? "부적절한 표현이 있어 올리지 못했어요" : "잠시 후 다시 시도해 주세요");
                        main.post(new Runnable() { @Override public void run() {
                            if (why.length() > 0) { chat.dropPend(text); src.setField(fk, text); toast(why); }
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
    /** (스레드 안) 공공데이터 쪽: 먼저 공유 저장소(한 번)에서 받고, 못 받으면 예전처럼 공공 서버에서 3쪽을 동시에 받는다. */
    private List<String> foodPubPages(String shared, String[] pu) {
        List<String> out = new ArrayList<String>();
        NetPost.Res sr = NetPost.get(shared, 9000);
        if (sr != null && sr.status == 200 && sr.body != null && FoodCore.pageCount(sr.body) > 0) { out.add(sr.body); return out; }          // s255: 빈 답(0곳)은 믿지 않고 공공 서버에서 직접 받아 본다(식당 한가운데서 없어요가 나오던 일)
        final NetPost.Res[] res = new NetPost.Res[pu.length];
        Thread[] th = new Thread[res.length];
        for (int i = 0; i < res.length; i++) {
            final int ii = i;
            th[i] = new Thread(new Runnable() { @Override public void run() { res[ii] = NetPost.get(pu[ii], 10000); } }, "shell-foodpub");
            th[i].start();
        }
        for (Thread t : th) { try { t.join(11000L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; } }
        for (int i = 0; i < res.length; i++) {
            NetPost.Res pr = res[i];
            String t = pr != null && pr.status == 200 ? pr.body : "";
            out.add(t);
            if (FoodCore.pageCount(t) < FoodCore.PUB_PAGE_SIZE) break;
        }
        return out;
    }
    /** (스레드 안) 맛집 원자료 — 서버 가게와 공공데이터 쪽을 동시에 받아 읽는다. */
    private FoodCore.Data foodDataNow(final String su, final String shared, final String[] pu) {
        final NetPost.Res[] sres = new NetPost.Res[1];
        Thread ts = new Thread(new Runnable() { @Override public void run() { sres[0] = NetPost.get(su, 8000); } }, "shell-foodpart");
        ts.start();
        List<String> pubs = foodPubPages(shared, pu);
        try { ts.join(9000L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        return FoodCore.parseData(sres[0] != null && sres[0].status == 200 && sres[0].body != null ? sres[0].body : "", pubs);
    }
    /** 맛집 원자료: 서버 가게가 먼저 오면 그것으로 곧바로 한 번 그리고(대개 1초 안), 느린 공공데이터 쪽이 오면 그것까지 합쳐 다시 그린다 — 가장 느린 통신을 기다리지 않는다. */
    private void fetchFoodData(final int my, final ScreenView v) {
        if (food.ctr == null) return;
        foodFetching = my;
        final String su = food.serverUrl();
        foodSu = su;
        final String[] pu = new String[FoodCore.PUB_PAGES];
        for (int i = 0; i < pu.length; i++) pu[i] = food.publicUrl(i + 1);
        final String shared = food.sharedUrl();
        new Thread(new Runnable() {
            @Override public void run() {
                final NetPost.Res[] sres = new NetPost.Res[1];
                final List<String> pubOut = java.util.Collections.synchronizedList(new ArrayList<String>());
                Thread ts = new Thread(new Runnable() { @Override public void run() { sres[0] = NetPost.get(su, 8000); } }, "shell-foodpart");
                Thread tp = new Thread(new Runnable() { @Override public void run() { pubOut.addAll(foodPubPages(shared, pu)); } }, "shell-foodpub");
                ts.start(); tp.start();
                long t0 = System.currentTimeMillis();
                try { ts.join(9000L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                String sbody = sres[0] != null && sres[0].status == 200 && sres[0].body != null ? sres[0].body : "";
                if (tp.isAlive() && sbody.length() > 0) foodStage(my, v, su, FoodCore.parseData(sbody, new ArrayList<String>()));      // 1단계: 서버 가게만으로 먼저
                try { tp.join(Math.max(1L, 24000L - (System.currentTimeMillis() - t0))); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                List<String> pubs; synchronized (pubOut) { pubs = new ArrayList<String>(pubOut); }
                foodStage(my, v, su, FoodCore.parseData(sbody, pubs));      // 2단계: 공공데이터까지 합쳐
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
        switch (food.act(a.v, a.id)) {                                         // a.id = 엔진이 눌림에 실어 준 가게 사실(없으면 번호표)
            case FoodCore.R_PANEL: {
                if (panelCacheGet(food.panelRequest(ShellCore.CAP)) == null) {                  // 미리 받아 둔 답이 없으면 자리(뼈대)부터 바로 펼치고 답이 오면 그 자리에서 바뀐다
                    final String pk = food.openKey;
                    food.showPanelSkeleton();
                    foodAfter = new Runnable() { @Override public void run() { body.revealBelow("fm." + pk); } };
                    foodRedraw();
                }
                foodPanelRound();
                break;
            }
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
        if (!isNotMod(txt)) { foodBase = txt; main.removeCallbacks(foodPfRun); main.postDelayed(foodPfRun, 1200L); }
        if (food.openKey.length() == 0 || isNotMod(txt)) { present(v, txt, keep); return; }
        final int my = ++seqFoodP;
        final String base = foodBase;
        foodRender.execute(new Runnable() { @Override public void run() {                       // 목록 화면에 펼침을 끼우는 읽기·글 만들기는 주 스레드 밖에서
            final String withP = food.withPanel(base);
            ScreenCore.Screen pre = null;
            if (!withP.equals(base)) { try { pre = parsedGet(withP); } catch (Throwable e) { pre = null; } }        // 읽기까지 여기서
            final ScreenCore.Screen scr = pre;
            main.post(new Runnable() { @Override public void run() {
                if (my != seqFoodP) return;
                if (scr != null) { v.setScreen(scr, keep); shownJson.put(v, withP); shownKey.remove(v); Runnable fa = foodAfter; foodAfter = null; if (fa != null) fa.run(); return; }
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
        final boolean r1 = food.panelRes.isEmpty();
        if (r1) { String hit = panelCacheGet(json); if (hit != null) { applyPanel(my, key, hit); return; } }          // 미리 받아 둔 펼침 — 눌린 그 순간에 바로
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/food", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                if (r1 && txt.length() > 0 && txt.indexOf("\"ok\":true") >= 0) panelCachePut(json, txt);
                main.post(new Runnable() { @Override public void run() { applyPanel(my, key, txt); } });
            }
        }, "shell-foodpanel").start();
    }
    /** 엔진의 펼침 답을 올린다(미리 받아 둔 것이든 방금 받은 것이든 같다). 경로 주소를 더 받아 오라고 하면 받아 와서 다시 묻는다. */
    private void applyPanel(final int my, final String key, String txt) {
        if (my != seqPanel || !key.equals(food.openKey)) return;
        final boolean first = food.panelNodes == null;
        if (!food.onPanel(txt)) { if (food.panelNodes == null || food.panelSkel) { food.closePanel(); foodRedraw(); toast("가게 지도를 열지 못했어요"); } return; }
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
    }
    // ── 가게 지도 펼침 미리 받기: 목록이 올라오면 위쪽 몇 곳의 첫 펼침을 뒤에서 받아 둔다 → 눌렀을 때 서버를 기다리지 않는다(5분) ──
    private static final int PANEL_PF_MAX = 16;                                  // 목록에 뜬 가게는 (위에서부터) 16곳까지 전부 미리 받아 둔다
    private final java.util.LinkedHashMap<String, String[]> panelCache = new java.util.LinkedHashMap<String, String[]>();
    private String panelCacheGet(String json) {
        synchronized (panelCache) { String[] e = panelCache.get(json); return e != null && System.currentTimeMillis() - Long.parseLong(e[0]) < 300000L ? e[1] : null; }
    }
    private void panelCachePut(String json, String txt) {
        synchronized (panelCache) { panelCache.put(json, new String[] { String.valueOf(System.currentTimeMillis()), txt }); while (panelCache.size() > 64) { String k0 = panelCache.keySet().iterator().next(); panelCache.remove(k0); } }
    }
    private final Runnable foodPfRun = new Runnable() { @Override public void run() {
        try {
            if (!"food".equals(ShellCore.currentTab(store)) || !resumed || !food.loaded) return;
            final java.util.ArrayList<String> reqs = new java.util.ArrayList<String>();
            for (String k : food.goKeys(PANEL_PF_MAX)) { String rq = food.panelRequestFor(ShellCore.CAP, k); if (rq.length() > 0 && panelCacheGet(rq) == null) reqs.add(rq); }
            if (reqs.isEmpty()) return;
            for (final String rq : reqs) foodNet.execute(new Runnable() { @Override public void run() {            // 위에서부터 차례로, 한꺼번에 3곳씩
                try {
                    if (panelCacheGet(rq) != null) return;
                    NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/food", rq, 8000);
                    if (r.status == 200 && r.body != null && r.body.indexOf("\"ok\":true") >= 0) panelCachePut(rq, r.body);
                } catch (Throwable ignored) { }
            } });
        } catch (Throwable ignored) { }
    } };
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
    private void saveLoc(Location l) { if (l != null) { ShellCore.lastLocPut(store, l.getLatitude(), l.getLongitude(), System.currentTimeMillis()); warmBus(l.getLatitude(), l.getLongitude()); warmBusStructure(l.getLatitude(), l.getLongitude()); warmLocTabs(l.getLatitude(), l.getLongitude()); } }
    /**
     * 홈 등 버스 탭이 아닌 곳에서 시작해도 버스 탭을 미리 준비한다(Warm-up): 위치를 잡으면 뒤에서 ① 서버 연결(DNS·TLS)을 맺고 ② 그 동네(약 110m 칸)의 정류장 목록을 기기에 보관하고
     * ③ 도착정보 주소를 기억하고 ④ 엔진이 그린 정류장 뼈대를 저장한다 — 버스 탭을 누르면 뼈대가 바로 그려지고 도착정보만 곧장 받는다. 이미 준비된 동네는 건너뛴다(10분에 한 번).
     * 앱은 엔진이 준 화면 · 주소를 저장할 뿐이다(만들거나 판단하지 않는다). 쓰기는 주 스레드로 넘긴다.
     */
    private String warmStructCell = ""; private long warmStructAt;
    private void warmBusStructure(final double la, final double lo) {
        try {
            if (!"bus".equals(map.mode()) || !MapCore.VW_NEAR.equals(map.busView()) || "map".equals(ShellCore.currentTab(store))) return;
            preconnectBus();
            final MapCore w = new MapCore(store); w.modeOverride = "bus"; w.setBusLoc(la, lo);
            final String cell = w.stopsCell();
            long now = System.currentTimeMillis();
            if (cell.length() == 0 || (cell.equals(warmStructCell) && now - warmStructAt < 600000L)) return;
            warmStructCell = cell; warmStructAt = now;
            if (cell.equals(store.get("bsk_cell", "")) && !w.speculativeNeed().isEmpty()) return;                // 이 동네는 이미 준비돼 있다(뼈대 · 정류장 · 도착정보 주소)
            final String theme = ShellCore.theme(store), skKey = ShellCore.busSkelKey(store);
            new Thread(new Runnable() { @Override public void run() {
                final List<String[]> arrNeed = new ArrayList<String[]>(); boolean bad = false;
                try {
                    for (int round = 0; round < MapCore.BUS_ROUNDS; round++) {
                        NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", w.bodyRequest(ShellCore.CAP, theme), 12000);
                        if (r.status != 200 || r.body == null || r.body.length() == 0) { bad = true; break; }
                        w.onScreen(r.body);
                        if (w.busNeed.isEmpty()) break;
                        List<String[]> need = new ArrayList<String[]>(w.busNeed);
                        String[] got = fetchAll(need, 5000, 4000);
                        for (int i = 0; i < need.size(); i++) { if (got[i] == null || got[i].length() == 0) { if (MapCore.coreKey(need.get(i)[0])) bad = true; } else { w.addBusRes(need.get(i)[0], got[i]); arrNeed.add(need.get(i)); } }
                        w.busNeed.clear();
                        if (bad) break;
                    }
                    if (w.stopCount() == 0) { warmStructAt = 0L; return; }                                          // 정류장을 못 받았다 — 다음 위치 때 다시
                    final boolean okAll = !bad;
                    main.post(new Runnable() { @Override public void run() { w.saveStopsCache(); if (okAll && !arrNeed.isEmpty()) w.rememberNeed(arrNeed); } });
                    NetPost.Res sr = NetPost.post(ShellCore.BASE + "/screen/map", w.bodyRequest(ShellCore.CAP, theme, true), 8000);
                    final String txt = sr.status == 200 && sr.body != null ? sr.body : "";
                    if (txt.length() == 0) return;
                    warm(txt);
                    main.post(new Runnable() { @Override public void run() { store.put("bsk_cell", cell); cachePut(skKey, txt); } });
                } catch (Throwable ignored) { warmStructAt = 0L; }
            } }, "shell-busstruct").start();
        } catch (Throwable ignored) { }
    }
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
    /** 새로고침용: 최근에 받아 둔 위치(20초 안)를 재사용하지 않고 지금 위치를 다시 받는다. */
    private void locateFresh(final int reqCode, final LocCb cb0) {
        final LocCb cb = new LocCb() {
            @Override public void fix(Location l) { saveLoc(l); cb0.fix(l); }
            @Override public void fail(boolean noperm) { cb0.fail(noperm); }
        };
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) { locateOnce(reqCode, cb0); return; }
        final boolean[] done = { false };
        locateNow(8000L, 1000L, 0L, new LocCb() {
            @Override public void fix(Location l) { if (done[0]) return; done[0] = true; cb.fix(l); }
            @Override public void fail(boolean noperm) { if (done[0]) return; done[0] = true; Location b = bestKnownLoc(); if (b != null) cb0.fix(b); else cb.fail(noperm); }
        });
        main.postDelayed(new Runnable() { @Override public void run() {                // 3초 약속: 새 위치가 1.3초 안에 안 오면 가장 최근에 아는 위치로 먼저 진행한다(늦게 온 새 위치는 위치 허브가 이어 받는다)
            if (done[0]) return; done[0] = true;
            Location b = bestKnownLoc(); if (b != null) cb0.fix(b); else cb.fail(false);
        } }, LOC_BUDGET_MS);
    }
    private static final long LOC_BUDGET_MS = 1300L;
    /** 새로 못 받았을 때 쓸 가장 최근의 위치(5분 안): 이어 받던 위치 → 위치 허브 → 지금 버스 탭 위치. */
    private Location bestKnownLoc() {
        long now = System.currentTimeMillis();
        if (liveLoc != null && now - liveAt < 300000L) return liveLoc;
        double[] ll = hubLL != null && now - hubAt < 300000L ? hubLL : map.busLL;
        if (ll == null) return null;
        Location l = new Location("known"); l.setLatitude(ll[0]); l.setLongitude(ll[1]); return l;
    }
    // ── 현재 위치(마지막으로 알려진 위치는 쓰지 않는다): 고정밀 현재 위치 + 네트워크 위치를 동시에 · 먼저 오는 것을 바로 반영 · GPS 가 더 정확하면 한 번 더. 화면이 켜져 있는 동안은 가볍게 이어 받는다.
    private LocFused locf;
    private Location liveLoc; private long liveAt;
    private static final long LIVE_FRESH_MS = 20000L;
    // ── 위치 허브(s179): 위치를 어디서 받든(기기가 아는 위치 0.1초 · 현재 위치 1초 · 이어 받기) 한 곳에서 곧바로 홈 카드 · 버스 탭에 반영한다. 홈과 버스 탭이 서로 다른 위치를 보지 않는다. ──
    private double[] hubLL; private long hubAt;
    private static boolean farLL(double[] a, double la, double lo, double deg) { return a == null || Math.abs(a[0] - la) > deg || Math.abs(a[1] - lo) > deg; }
    private void locHub(Location l) {
        if (l == null) return;
        final double la = l.getLatitude(), lo = l.getLongitude();
        hubLL = new double[] { la, lo }; hubAt = System.currentTimeMillis();
        hcFixFrom(la, lo);
        placesFollow(la, lo);
        busLocFollow(la, lo);
    }
    /** 위치가 크게 바뀌었다(백그라운드에서 돌아왔을 때 등): 출발지가 '내 위치'로 잡혀 있고 경로를 보는 중이 아니면 출발칸을 새 자리(동 이름 포함)로, 맛집(내 위치 주변)은 새 자리로 다시 받는다. 경로 안내 중에는 건드리지 않는다. */
    private void placesFollow(double la, double lo) {
        if (home.riding()) return;
        HomeCore.Loc cur = home.loc[HomeCore.START];
        if (cur != null && "gps".equals(cur.type) && !home.gps && !home.hasRoute() && home.active != HomeCore.START && farLL(new double[] { cur.lat, cur.lng }, la, lo, 0.0008)) {
            home.setGpsStart(la, lo, hc.dongNow());
            setHomeFields(); reloadHome();
        }
        if (food.dest.length() == 0 && food.gps != null && !food.locating && farLL(food.gps, la, lo, 0.003)) {
            food.setGps(la, lo);                                                         // 목록을 비우고(invalidate) 새 자리 기준으로 — 맛집 탭을 보는 중이면 바로, 아니면 다음에 열 때
            reloadFood();
        }
    }
    /** 버스 탭이 새 위치를 따라간다: 55m 안이면 그대로 · 버스 탭이 아니면 조용히 위치만 바꿔(다음에 열면 그 동네 화면이 바로) · 보는 중이면 165m 넘게는 곧바로 그 동네 화면(캐시 → 뼈대 → 새로 받기), 그 안쪽은 보던 화면을 두고 뒤에서 바꿔 끼운다. 탑승 중엔 하지 않는다. */
    private void busLocFollow(double la, double lo) {
        if (!"bus".equals(map.mode()) || home.riding()) return;
        if (!farLL(map.busLL, la, lo, BUS_MOVE_DEG)) return;
        boolean onBus = resumed && "map".equals(ShellCore.currentTab(store)) && ShellCore.S_MAPB.equals(slots.length > 1 ? slots[1] : "");
        if (!onBus) { if (MapCore.VW_NEAR.equals(map.busView()) || map.busLL == null) map.setBusLoc(la, lo); return; }
        if (!MapCore.VW_NEAR.equals(map.busView()) && map.busLL != null) return;                    // 즐겨찾기 화면은 위치와 상관없다
        if (map.busLL == null || map.stopCount() == 0) { map.setBusLoc(la, lo); reloadMap(false); return; }      // 처음 그릴 때만 — 정류장이 이미 떠 있으면 위치가 바뀌어도 자동으로 다시 찾지 않는다(새로고침 단추만)
        return;
    }
    private static final double BUS_FAR_DEG = 0.0015;                         // 약 165m — 이만큼 옮겼으면 보던 정류장은 이제 상관없다(바로 새 동네 화면)
    private void liveSet(Location l) { if (l != null) { liveLoc = l; liveAt = System.currentTimeMillis(); saveLoc(l); locHub(l); if (resumed && (locf == null || !locf.tracking())) trackStart(); } }
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
            @Override public void fix(Location l) { if (got[0]) return; got[0] = true; locHub(l); for (LocCb c : new java.util.ArrayList<LocCb>(b.ws)) c.fix(l); }
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
                        if (!resumed || !"bus".equals(map.mode()) || !"map".equals(ShellCore.currentTab(store)) || map.busLL == null || !farLL(map.busLL, la, lo, BUS_MOVE_DEG)) return;          // 허브가 이미 따라갔으면 다시 하지 않는다
                        busMove(la, lo);
                    } });
                }
            }
            @Override public void fail() { }
        });
    }
    /** 앞으로 돌아왔다: 15초 · 30m 이어받기를 기다리지 않고 지금 위치를 한 번 바로 받아 허브(출발칸 · 맛집 · 브리핑 · 버스)가 따라가게 한다. */
    private void resumeLocate() {
        if (!hasLocPerm() || !deb.gate("reslocate", 3000L)) return;
        locateNow(8000L, 1000L, 2500L, 60000L, new LocCb() { @Override public void fix(Location l) { } @Override public void fail(boolean noperm) { } });
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
        if (!busRefreshing && "bus".equals(map.mode())) { PerfLog.begin("bus.stops"); PerfLog.begin("bus.first"); PerfLog.begin("bus.arr"); }          // s290: 구간 시간 — 버스 탭을 연 때부터 정류장·도착정보가 뜰 때까지
        if (busRefreshing) map.restoreArrivals(); busRefreshing = false;
        if (v == body && "bus".equals(map.mode())) {
            preconnectBus(); locKick();                                                     // 위치를 한 번 더 확인한다(홈과 같은 위치 — 달라졌으면 허브가 바로 그 동네로 옮긴다)
            if (!keep) map.clearArrivals();
            List<String[]> sp = map.speculativeNeed();
            if (!sp.isEmpty()) {
                map.busNeed.clear(); map.busNeed.addAll(sp);
                busAt = System.currentTimeMillis();
                fetchBusNeed(v, keep, 0, ++seqMapB, true);                                    // 먼저 온 정류장부터 바로 그린다(한 곳이 느리다고 전부 "불러오는 중"에 묶이지 않게)
                return;
            }
        }
        loadMapBodyRound(v, keep, 0);
    }
    // ── 네트워크 사전 연결: 버스 서버로 연결(DNS · TLS · HTTP/2)을 미리 맺어 둔다 — 실제 도착정보 요청이 그 연결을 이어 쓴다(NetPost 는 연결을 끊지 않는다) ──
    private long preConnAt, warmAt;
    private void preconnectBus() {
        long now = System.currentTimeMillis();
        if (now - preConnAt < 20000L) return;
        preConnAt = now;
        if (now - warmAt >= 90000L) {                                                       // s256 (YJ: 경로 탐색 누르고 반응이 너무 늦다): 엔진의 첫 경로 계산(코드 예열 · 자료 읽기)을 켜자마자 뒤에서 미리 시킨다 — 누를 때 콜드 스타트를 기다리지 않게. 서버도 60초에 한 번만 실제로 돈다.
            warmAt = now;
            Thread tw = new Thread(new Runnable() { @Override public void run() { try { NetPost.get(ShellCore.BASE + "/warm", 25000); } catch (Throwable ignored) { } } }, "shell-routewarm"); tw.setDaemon(true); tw.start();
        }
        new Thread(new Runnable() { @Override public void run() { try { NetPost.get(ShellCore.BUS_BASE + "/health", 4000); } catch (Throwable ignored) { } } }, "shell-preconn").start();
        new Thread(new Runnable() { @Override public void run() { try { NetPost.get(ShellCore.BASE + "/health", 4000); } catch (Throwable ignored) { } } }, "shell-preconn2").start();          // 엔진(route-v2) · 두 번째 길(/bus-tago)도 같은 곳 — 연결을 미리 맺어 둔다
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
        map.busFailShow = busRetryN >= 3;                                                         // 자동으로 세 번 다시 받았는데도 비었으면 이번 그림은 '정보 불러오기 실패 · 다시 시도 ›'
        final String json = map.bodyRequest(ShellCore.CAP, ShellCore.theme(store));
        final String modeNow = map.mode();
        final String wtxt = round == 0 && "bus".equals(modeNow) && json.equals(warmBusJson) && System.currentTimeMillis() - warmBusAt < 45000L ? warmBusTxt : "";          // 위치를 잡을 때 뒤에서 미리 받아 둔 정류장 화면이 있으면 기다리지 않고 바로
        if (wtxt.length() > 0) warmBusJson = "";
        // s174: 처음 그릴 때는 '정류장만 먼저(0.3초)' 요청과 '서버가 도착정보까지 한 번에(최대 3.5초 · 보통 1초)' 요청을 동시에 보낸다 — 정류장은 바로 뜨고, 도착정보는 기기가 정류장마다 따로 받는 것보다 훨씬 빨리 온 완성 화면으로 바뀐다. 전체 요청이 실패하면 예전처럼 기기가 이어 받는다.
        final boolean dual = round == 0 && wtxt.length() == 0 && "bus".equals(modeNow) && !busRefreshing;
        String jf = "";
        if (dual) { map.svb = 2200; jf = map.bodyRequest(ShellCore.CAP, ShellCore.theme(store)); map.svb = 300; }
        final String jsonFull = jf;
        final boolean[] st = new boolean[3];                                                      // 0: 정류장만 화면을 그렸다 · 1: 전체 요청이 끝났다 · 2: 전체 요청이 성공했다
        new Thread(new Runnable() {
            @Override public void run() {
                String got0;
                if (wtxt.length() > 0) got0 = wtxt;
                else { NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, "bus".equals(modeNow) ? 12000 : 8000); got0 = r.status == 200 && r.body != null ? r.body : ""; }          // 버스는 서버가 정류장·도착정보를 한 번에 받아 오므로 조금 더 기다린다
                final String txt = got0; warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapB) return;
                    if (dual && st[2]) return;                                                       // 전체 화면이 이미 왔다 — 늦게 온 정류장만 화면은 버린다
                    final boolean wait = dual && !st[1];
                    mapBodyApply(v, keep, round, my, txt, wait);
                    if (wait && txt.length() > 0) st[0] = true;
                } });
            }
        }, "shell-mapb").start();
        if (dual) new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", jsonFull, 5000);          // 3초 약속: 서버 대기 2.2초 + 이동 — 못 오면 기기가 정류장별로 이어 받아 먼저 온 곳부터 그린다
                final String txt = r.status == 200 && r.body != null ? r.body : ""; warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapB) return;
                    st[1] = true;
                    if (txt.length() > 0) { st[2] = true; mapBodyApply(v, keep || st[0], round, my, txt, false); return; }
                    if (st[0] && !map.busNeed.isEmpty()) fetchBusNeed(v, keep, round, my, true);       // 전체 요청이 실패 — 먼저 그린 정류장 화면에서 예전처럼 기기가 도착정보를 받는다(정류장만 화면이 아직 안 왔으면 그쪽이 이어 간다)
                } });
            }
        }, "shell-mapfull").start();
    }
    /** 버스 화면 응답 하나를 반영한다. deferNeed 면 그리기만 하고 도착정보 받기·마무리는 하지 않는다(동시에 보낸 전체 요청이 이어 간다). */
    /** 버스 본문 캐시 열쇠를 지금 위치 칸으로 맞춘다(응답이 오는 사이 위치 칸이 바뀌어도 그 동네 화면으로 저장되게). */
    private void rekeyMapBody() { if (slots.length > 1 && ShellCore.S_MAPB.equals(slots[1])) viewKey.put(body, ShellCore.cacheKey(ShellCore.S_MAPB, store)); }
    private void mapBodyApply(final ScreenView v, final boolean keep, final int round, final int my, final String txt, final boolean deferNeed) {
        if (my != seqMapB) return;
        rekeyMapBody();
        if (deferNeed && txt.length() == 0) return;
        if (txt.length() == 0 && busRefreshing) { busFail(); return; }                    // 8초 갱신이 실패 — 화면은 그대로 두고(1초 카운트다운 계속) 다음 박자에 다시
        if (txt.length() > 0) map.onScreen(txt);
        if (busRefreshing && map.svFail > 0 && round == 0 && map.fillFromStash() > 0) { loadMapBodyRound(v, true, 1); return; }      // 서버가 몇 곳을 못 받았다 — 그 곳만 보던 값으로 채워 한 번 더 그린다(한 곳 때문에 전체 갱신이 막히지 않게)
        final boolean shownNow = round >= MapCore.BUS_ROUNDS || map.needOptionalOnly() || !(keep && txt.length() > 0 && !map.busNeed.isEmpty());          // 방면 목록(r)만 남았거나 바퀴가 끝났으면 지금 그린다(옛 코드는 3바퀴째 그림을 버려 정류장이 비어 보였다)
        if (shownNow) { v.setSourceAge(map.arrAge()); present(v, txt, keep); if (txt.length() > 0 && map.stopCount() > 0) PerfLog.end("bus.stops", "버스 진입→정류장"); if (txt.length() > 0 && map.routeCount(0) > 0) PerfLog.end("bus.first", "버스 진입→첫 도착정보"); }          // 버스 도착정보를 더 받아야 하면 캐시 화면을 중간 화면으로 덮지 않는다
        syncMapView();
        if ("bus".equals(map.view)) { if (round == 0) busAt = System.currentTimeMillis(); startBusTick(); if (txt.length() > 0 && map.stopCount() > 0) map.saveStopsCache(); }
        if (deferNeed) return;
        if (txt.length() > 0 && !map.busNeed.isEmpty() && round < MapCore.BUS_ROUNDS) fetchBusNeed(v, keep, round, my, shownNow && !busRefreshing);
        else { if (busRefreshing) busOk(); if (txt.length() > 0 && "bus".equals(map.view) && map.busNeed.isEmpty()) { PerfLog.end("bus.arr", "버스 진입→도착정보"); brPrefetch(); saveBusSkeleton(); }
            if ((map.svFail > 0 || busBadFetch > 0) && !busRefreshing && busShowing() && busRetryN < 3) {            // 몇 곳이 비었다 — 1.5 · 3 · 4.5초 뒤 그 곳만 다시(세 번까지, 사람이 탭 · 보기를 바꾸면 처음부터)
                busRetryN++; final long wait = 1500L * busRetryN;
                main.postDelayed(new Runnable() { @Override public void run() { if (busShowing() && !busRefreshing) busRefresh(); } }, wait);
            } else if (map.svFail == 0 && busBadFetch == 0) busRetryN = 0;
            busBadFetch = 0; }     // 처음 그릴 때 몇 곳이 비었으면 곧바로 한 번 더(8초 박자를 기다리지 않는다)
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
                                NetPost.Res g = MapCore.busGet(nd[0], nd[1], 9000, 4000);
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
                    if (my == seqMapB && txt.length() > 0 && !busRefreshing && busShowing()) { v.setSourceAge(map.arrAge()); present(v, txt, true); if (map.routeCount(0) > 0) PerfLog.end("bus.first", "버스 진입→첫 도착정보"); }          // 그 사이 다음 통신·탭 이동이 있었으면 버린다(최종 그림이 곧 온다)
                    if (busPaintDirty) { busPaintDirty = false; if (my == seqMapB) busPaint(v, my); }
                } });
            }
        }, "shell-buspaint").start();
    }
    private final java.util.HashSet<String> busDiagSeen = new java.util.HashSet<String>();
    private void fetchBusNeed(final ScreenView v, final boolean keep, final int round, final int my, final boolean partial) {
        final List<String[]> need = new ArrayList<String[]>(map.busNeed);
        final long rnd0 = PerfLog.now();                                                          // s292: 기기가 직접 받는 한 바퀴(서버가 못 채운 주소)의 시간 — 횟수가 많으면 서버가 한 번에 못 채우고 있다는 뜻
        new Thread(new Runnable() {
            @Override public void run() {
                final String[] got = new String[need.size()];
                Thread[] ts = new Thread[need.size()];
                for (int i = 0; i < need.size(); i++) {
                    final int k = i;
                    ts[i] = new Thread(new Runnable() { @Override public void run() {
                        NetPost.Res r = MapCore.busGet(need.get(k)[0], need.get(k)[1], 8000, 5000);          // s258 (YJ: 받는 시간이 너무 짧다) 5초/4초 → 8초/5초 — 먼저 온 정류장은 기다리지 않고 바로 그려서(partial) 늦은 곳만 오래 기다린다 // 동시 4곳 · 공공 API 오류 봉투는 다시 묻는다(끝내 못 받으면 빈 본문 — 아래에서 '없음'으로 굳히지 않는다)
                        String body = r != null && r.status == 200 && r.body != null ? r.body : "";
                        got[k] = body;
                        if (partial && body.length() > 0) main.post(new Runnable() { @Override public void run() {          // 먼저 온 정류장부터 바로 보인다
                            if (my != seqMapB || busRefreshing) return;
                            map.addBusRes(need.get(k)[0], got[k]);
                            busPaint(v, my);
                        } });
                    } });
                    ts[i].start();
                }
                for (Thread t : ts) { try { t.join(20000); } catch (InterruptedException e) { /* 무시 */ } }
                PerfLog.span("버스 직접 받기 한 바퀴", rnd0);
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapB) return;
                    if (busRefreshing) {                                                          // s258 (YJ: 하나라도 비면 온 데이터는 살리고 안 온 것만 다시 받아야지) — 예전엔 하나라도 비면 이번 갱신 전체를 버렸다.
                        boolean bad = false;                                                      //   이제 온 것은 그대로 쓰고(아래 addBusRes), 빈 곳만 다음 바퀴에 다시 받는다(엔진이 없는 열쇠만 다시 부탁한다). 이웃 · 바꾼 ID · 경유노선(덤)은 원래 대로 갱신을 막지 않는다.
                        for (int i = 0; i < need.size(); i++) if ((got[i] == null || got[i].length() == 0) && MapCore.coreKey(need.get(i)[0])) bad = true;
                        if (bad) busKeepArrived = true;
                    }
                    int badN = 0;
                    for (int i = 0; i < need.size(); i++) if ((got[i] == null || got[i].length() == 0) && MapCore.coreKey(need.get(i)[0])) badN++;
                    busBadFetch = badN;
                    try {                                                                         // s258 (YJ: 가장 가까운 정류장만 "도착정보 없음") — 어느 정류장이 '못 받음'인지 '받았는데 비었음'인지 오류 기록에 남긴다(같은 주소는 한 번)
                        for (int i = 0; i < need.size() && busDiagSeen.size() < 30; i++) {
                            String gb = got[i] == null ? "" : got[i], kk = need.get(i)[0], u = need.get(i)[1] != null && need.get(i)[1].length() > 0 ? need.get(i)[1] : kk;
                            if (kk == null || !kk.matches("[afgh][0-9]{1,3}")) continue;          // 도착정보 주소만(경유노선 t·u, 좌표 보정 목록은 제외)
                            if (gb.length() > 0 && !NetPost.busEmpty(gb)) continue;
                            String dm = "BUS_ARR " + kk + " " + (gb.length() == 0 ? "못 받음" : "받았지만 빔") + " " + (u.length() > 140 ? u.substring(u.length() - 140) : u);
                            if (busDiagSeen.add(dm)) ErrLog.record(ShellActivity.this, new IllegalStateException(dm), false);
                        }
                    } catch (Throwable ignored) { }
                    for (int i = 0; i < need.size(); i++) map.addBusRes(need.get(i)[0], got[i] == null ? "" : got[i]);
                    if (busRefreshing && busKeepArrived && round + 1 >= MapCore.BUS_ROUNDS) map.fillFromStash();          // 바퀴를 다 썼는데도 못 받은 곳만 갱신 전에 보던 값으로(비어 보이지 않게)
                    busKeepArrived = false;
                    map.rememberNeed(need);                                                       // 다음 갱신은 이 주소들을 엔진에게 묻지 않고 곧장 받는다
                    map.busNeed.clear();
                    loadMapBodyRound(v, true, round + 1);
                } });
            }
        }, "shell-mapbus").start();
    }
    /** 버스 방식 노선도: 위치를 기다리지 않고 마지막 위치로 먼저 그리고, 권한이 있으면 새 위치를 조용히 받아 바뀌었을 때만 다시 그린다. */
    /** 위치 허브 깨우기: 기기가 알던 위치(0.1초) → 현재 위치(1초) 순으로 받는다 — 결과는 허브(liveSet · lastKnown)가 홈 카드 · 버스 탭에 반영한다. */
    private void locKick() {
        if (!hasLocPerm()) return;
        locateNow(8000L, 1000L, 60000L, 120000L, new LocCb() { @Override public void fix(Location l) { } @Override public void fail(boolean noperm) { } });
    }
    private void seedMapLoc() {
        if (!"bus".equals(map.mode())) return;
        if (map.busLL != null) {                                                                              // 이미 위치가 있어도 방금 받은 더 새 위치(허브)가 165m 넘게 다르면 그쪽으로(옛 동네 정류장이 먼저 뜨지 않게)
            double[] fr = liveLL();
            if (fr == null && hubLL != null && System.currentTimeMillis() - hubAt < 120000L) fr = hubLL;
            if (fr != null && MapCore.VW_NEAR.equals(map.busView()) && farLL(map.busLL, fr[0], fr[1], BUS_FAR_DEG)) map.setBusLoc(fr[0], fr[1]);
            return;
        }
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
    private static final long BUS_POLL_MS = 30000L;                     // 위치 재확인 박자(탑승 중이 아니면 30초에 한 번) — 그 사이 초는 기기에서 줄어든다. 도착정보는 위치가 바뀔 때만 새로 받는다(YJ)
    private boolean busKeepArrived;
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
        // s231 (YJ: 정류장 위치 탭을 보고 있으면 계속 이동 중이어도 실시간 위치로 자동 재탐색하지 마 — 수동 재탐색(새로고침 단추)을 누를 때만, 그동안은 버스 도착시간만 갱신): 보는 중 자동 이동 추적은 하지 않는다.
        if (quiet) return;
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
                    for (int round = 0; round < MapCore.BUS_ROUNDS && fin.length() == 0; round++) {
                        NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", w.bodyRequest(ShellCore.CAP, theme), 12000);
                        if (r.status != 200 || r.body == null || r.body.length() == 0) break;
                        w.onScreen(r.body);
                        if (w.busNeed.isEmpty()) { if (w.svFail == 0 && w.stopCount() > 0) fin = r.body; break; }
                        List<String[]> need = new ArrayList<String[]>(w.busNeed);
                        String[] got = fetchAll(need, 5000, 4000);
                        boolean bad = false;
                        for (int i = 0; i < need.size(); i++) { if ((got[i] == null || got[i].length() == 0) && MapCore.coreKey(need.get(i)[0])) bad = true; w.addBusRes(need.get(i)[0], got[i] == null ? "" : got[i]); }
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
                    rekeyMapBody();
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
                    for (int i = 0; i < got.length; i++) if ((got[i] == null || got[i].length() == 0) && MapCore.coreKey(spec.get(i)[0])) bad = true;
                    if (bad) { loadMapBodyRound(body, true, 0); return; }
                    for (int i = 0; i < spec.size(); i++) if (got[i] != null && got[i].length() > 0) map.addBusRes(spec.get(i)[0], got[i]);          // 덤(이웃 · 바꾼 ID)을 못 받았으면 엔진이 이어서 다시 부탁한다
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
                NetPost.Res r = MapCore.busGet(need.get(k)[0], need.get(k)[1], firstMs, retryMs);
                String b = r != null && r.status == 200 && r.body != null ? r.body : "";
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
        busLocCheck(); startBusTick();
    } };
    /** 위치 재확인(탑승 중이 아니면 30초마다): 위치가 그대로면 아무것도 받지 않는다(숫자는 기기에서 줄어들기만 한다). 55m 넘게 바뀌었으면 새 자리의 정류장 · 도착정보를 조용히 받아 바꿔 끼운다.
     *  받은 지 10분이 넘은 도착정보만은 위치가 같아도 새로 받는다(그 이상은 쓸 수 없는 숫자). */
    private void busLocCheck() {
        if (!busShowing() || home.riding()) return;
        if (System.currentTimeMillis() - busAt > ShellCore.BUS_FRESH_MS) { busRefresh(); return; }
        if (!hasLocPerm()) return;
        locateNow(8000L, 1000L, 0L, 120000L, new LocCb() {                    // 기기가 방금 알던 위치(0.1초)로 먼저 따라가고 곧 새 위치(1초)로 바로잡는다
            @Override public void fix(Location l) {
                if (!busShowing() || home.riding()) return;
                if (farFrom(map.busLL, l, BUS_MOVE_DEG)) busMove(l.getLatitude(), l.getLongitude());
            }
            @Override public void fail(boolean noperm) { }
        });
    }
    /** 앞으로 돌아왔을 때: 마지막으로 받은 지 8초가 넘었으면 바로 다시 받는다(박자를 기다리지 않는다). */
    private void busResume() {
        if (!busShowing()) return;
        busLocCheck();                                                                    // 위치가 그대로면 아무것도 받지 않는다(시간만 줄어든다)
        startBusTick();
    }
    private boolean busTicking;
    /** 다른 탭에 갔다 버스 탭으로 돌아왔다(위치가 그대로라 정류장 목록이 같다): 기억해 둔 화면을 지난 시간만큼 줄여 바로 보이고, 정류장 · 엔진 왕복 없이 도착정보만 뒤에서 새로 받아
     *  숫자만 조용히 바꾼다(새 버스 줄만 스프링으로 내려온다). 기억해 둔 정류장이 없으면 false — 평소 길로 받는다. */
    private boolean busReturnQuiet() {
        if (!busShowing() || map.stopCount() == 0 || map.speculativeNeed().isEmpty()) return false;
        busLocCheck();                                                                    // 위치가 바뀌었을 때만 새로 받는다 — 그대로면 보던 화면에서 시간만 줄어든다
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
        if (shown && busShowing() && System.currentTimeMillis() - busAt > ShellCore.BUS_FRESH_MS) busRefresh();        // 캐시 화면을 먼저 보이고, 받은 지 10분이 넘었을 때만 도착정보를 새로 받는다(그 안에서는 시간만 줄어든다)
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
                locateFresh(REQ_MAP_LOC, new LocCb() {                                      // 새로고침은 방금 받아 둔 위치를 쓰지 않고 지금 위치를 다시 확인 — 정류장 목록도 새로
                    @Override public void fix(Location l) { map.setBusLocFresh(l.getLatitude(), l.getLongitude()); loadMapBody(body, true); }
                    @Override public void fail(boolean noperm) { toast(noperm ? "위치 권한이 필요해요" : "현재 위치를 찾지 못했어요"); }
                });
                break;
            case MapCore.R_STN: openMapSheet(S_STN_H); break;
            case MapCore.R_BUS_VIEW: reloadMap(false); break;                                  // 주변 ↔ 즐겨찾기: 본 적 있으면 그 화면을 먼저 올리고 새로 받는다
            case MapCore.R_BUS_REF:
                busRetryN = 0;
                if (map.takeRefLoc() && hasLocPerm()) {                                      // 즐겨찾기 새로고침: 도착정보만이 아니라 현재 위치도 다시 확인(옮겼으면 주변 정류장도 그 동네로 — 즐겨찾기는 그대로)
                    locateFresh(REQ_MAP_LOC, new LocCb() {
                        @Override public void fix(Location l) { if (farLL(map.busLL, l.getLatitude(), l.getLongitude(), BUS_MOVE_DEG)) map.setBusLocFresh(l.getLatitude(), l.getLongitude()); loadMapBody(body, true); }
                        @Override public void fail(boolean noperm) { loadMapBody(body, true); }
                    });
                } else loadMapBody(body, true);
                break;                            // 즐겨찾기 새로고침: 도착정보를 다시 받는다
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
                        @Override public void onEdgeSwipe(int dir) { if ("map".equals(ShellCore.currentTab(store)) && "metro".equals(map.view)) commSwipe(dir); }          // 노선도가 가로로 더 못 가는 끝에서 더 밀면 버스 탭으로(엔진이 준 sw 표 그대로)
                        @Override public void onReady() { }
                        @Override public void onError(String msg) { toast("노선도를 그리지 못했어요"); }
                        @Override public void onCentered(int op) { map.tapStation(mapData.labelName(op)); openMapSheet(S_STN_H); }
                    });
                    holder.addView(mapView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                    if (rsF != null) rsF.bringToFront();
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
            ttWarm();
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
                    ttWarm();                                                           // 시간표(모든 노선)를 미리 받아 둔다
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
            // 웹 svgShowPopup · _nmDragDismiss: 팝업 어디서든 위로 끌면 시간표가 손가락을 따라 자라 오르고(놓으면 이어서 올라가거나 되돌아간다), 아래로 끌면 시트가 손가락을 따라 내려가다 놓으면 그 높이에서 그대로 내려가 닫힌다(또는 제자리). s208: 시간표를 내려 놓아도 역 팝업이 다시 올라오지 않는다(YJ 실기기 — 올라갔다 내려가 어색).
            // 단추·알약 누르기는 그대로 — 세로로 10dp 이상 끌려(세로가 가로의 1.2배 이상) 끌기가 확정된 순간에만 가로채고, 그 전에는 건드리지 않는다. 손가락 따라가기는 창 높이(위로)와 창 이동(아래로)뿐이라 새 객체가 없다.
            private float dx0, dy0, base; private boolean fired, top0, busy, up; private android.view.VelocityTracker vt;
            private int curH;
            @Override public boolean onInterceptTouchEvent(android.view.MotionEvent e) {
                int a = e.getActionMasked();
                if (busy) return true;
                if (a == android.view.MotionEvent.ACTION_DOWN) {
                    dx0 = e.getRawX(); dy0 = e.getRawY(); fired = false; top0 = sheetView == null || sheetView.scrollPos() <= 0.5f;
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
                        w.getDecorView().setTranslationY(Math.max(0f, d));                        // 시간표든 역 팝업이든 손가락을 그대로 따라 내려간다(중간에 다른 화면으로 바뀌지 않는다)
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
                        if (!cancel && (ty >= (tt ? 56f : 40f) * dpr || vy > 600f * dpr)) {
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
                if (rideLocked()) { closeSheet(); break; }
                home.setStation(HomeCore.START, map.pickName, map.pickLine, map.pickLa, map.pickLo);
                closeSheet(); toastTx(MapCore.fill(map.msgS, map.pickName));
                break;
            case MapCore.R_DEST:
                if (rideLocked()) { closeSheet(); break; }
                home.setStation(HomeCore.DEST, map.pickName, map.pickLine, map.pickLa, map.pickLo);
                closeSheet();
                if (home.bothSet()) {
                    toastTx(MapCore.fill(map.msgE, map.pickName));
                    store.put(ShellCore.K_TAB, "home"); showTab("home");
                    main.postDelayed(new Runnable() { @Override public void run() { goRoute(); } }, 400);
                } else toastTx(MapCore.fill(map.msgE2, map.pickName));
                break;
            case MapCore.R_TT: openTimetable(); break;
            case MapCore.R_TT_LOAD: ttRender(); break;                     // 서버가 시간표를 직접 채워 한 번에 그려 준다 — 못 채우면 ttRender 가 예전 길(ttFetch)로 잇는다
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
    // 시간표: 서버(엔진)가 모든 노선 시간표를 직접 채워 한 번에 완성된 화면을 준다(f.tt.sv=1). 역 팝업이 뜨는 순간 첫 요청을 미리 보내 두어, 시간표 단추를 누르면 이미 받은 화면이 바로 올라온다.
    private final java.util.LinkedHashMap<String, String> ttCache = new java.util.LinkedHashMap<String, String>();
    private final java.util.HashMap<String, Long> ttCacheAt = new java.util.HashMap<String, Long>();
    private final java.util.HashSet<String> ttWarming = new java.util.HashSet<String>();
    private static final long TT_WARM_MS = 150000L;
    private String ttCacheHit(String json) {
        String c = ttCache.get(json); Long at = ttCacheAt.get(json);
        return c != null && at != null && System.currentTimeMillis() - at < TT_WARM_MS ? c : null;       // 다음 열차 시각이 들어 있어 오래된 화면은 쓰지 않는다
    }
    private void ttCachePut(String json, String txt) {
        ttCache.put(json, txt); ttCacheAt.put(json, System.currentTimeMillis());
        while (ttCache.size() > 6) { String k = ttCache.keySet().iterator().next(); ttCache.remove(k); ttCacheAt.remove(k); }
    }
    /** 역 팝업이 뜬 순간: 이 역의 시간표(모든 노선)를 미리 받아 둔다. */
    private void ttWarm() {
        if (map.stn.length() == 0) return;
        final String json = map.ttInitRequest(ShellCore.CAP, ShellCore.theme(store));
        if (ttCacheHit(json) != null || !ttWarming.add(json)) return;
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
                main.post(new Runnable() { @Override public void run() {
                    ttWarming.remove(json);
                    if (txt.length() > 0 && txt.indexOf("\"need\":{") < 0) ttCachePut(json, txt);               // 서버가 다 채운 화면만 둔다
                } });
            }
        }, "shell-ttwarm").start();
    }
    private void ttApply(String txt) {
        if (sheet == null || !sheet.isShowing() || !ShellCore.S_MAPTT.equals(sheetName) || txt.length() == 0) return;
        map.onTt(txt);
        present(sheetView, txt, true);
        playPlace();
        if (map.ttWantFetch()) ttFetch();                                                // 서버가 못 채웠을 때만 — 예전처럼 기기가 한 번 받아 다시 그린다
    }
    private void ttRender() {
        final String json = map.ttRequest(ShellCore.CAP, ShellCore.theme(store));
        final String hit = json.equals(map.ttInitRequest(ShellCore.CAP, ShellCore.theme(store))) ? ttCacheHit(json) : null;
        if (hit != null) { ttApply(hit); return; }                                       // 미리 받아 둔 첫 화면 — 기다림 없이
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
                main.post(new Runnable() { @Override public void run() { ttApply(txt); } });
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
                    NetPost.Res r = MapCore.busGet(k, url, pos ? 6000 : 9000, 4000);
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
            case MapCore.R_BR_SAME: toastTx(map.msgSame); break;
            case MapCore.R_BR_START: {
                String[] r = map.brPicked();
                if (r == null) break;
                if (rideLocked()) { closeSheet(); break; }
                home.pickSnap();
                home.setBusStop(HomeCore.START, r[2], r[1], map.brCc, Double.parseDouble(r[4]), Double.parseDouble(r[5]));
                map.brPickStart();
                toastTx(MapCore.fill(map.msgBrS, r[2]));
                brRender();
                break;
            }
            case MapCore.R_BR_CANCEL:
                home.pickRestore(map.pkName); map.brPickClear(); brRender();
                break;
            case MapCore.R_BR_FINISH: {
                String[] r = map.brPicked();
                if (r == null) break;
                if (rideLocked()) { closeSheet(); break; }
                home.setBusStop(HomeCore.DEST, r[2], r[1], map.brCc, Double.parseDouble(r[4]), Double.parseDouble(r[5]));
                home.pickDone(); brKeep = true;
                closeSheet();
                store.put(ShellCore.K_TAB, "home"); showTab("home");
                toastTx(MapCore.fill(map.msgBrE, r[2]));
                if (home.bothSet()) main.postDelayed(new Runnable() { @Override public void run() { goRoute(); } }, 400);
                break;
            }
            case MapCore.R_BR_TOSTN:
                brKeep = true;
                closeSheet();
                map.cat("m:subway"); reloadMap(true);
                toastTx(map.msgToStn);
                break;
            default: break;
        }
    }

    private void closeSheet() { if (mapView != null) mapView.setCover(0f); detLoading = null; brStop(); if (playView != null) { playView.end(); playView = null; } try { if (sheet != null) sheet.dismiss(); } catch (Throwable ignored) { } sheet = null; sheetView = null; sheetName = ""; }

    private final class SheetHost implements ScreenView.Listener {
        @Override public void onAction(ScreenCore.Act a) {
            if (ShellCore.S_MAPSTN.equals(sheetName) || ShellCore.S_MAPTT.equals(sheetName)) { if ("call".equals(a.a)) mapSheetAct(a.v); return; }
            if (ShellCore.S_MAPBR.equals(sheetName)) { if ("call".equals(a.a)) brSheetAct(a.v); return; }
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
        @Override public void onContentH(final float dp) { if (popSheet && ShellCore.S_SETPG.equals(sheetName)) main.post(new Runnable() { @Override public void run() { popResize(dp); } }); }
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
                main.post(new Runnable() { @Override public void run() {
                    writeBusy = false;
                    if (rejected) { writeErr = why.length() > 0 ? why : "등록할 수 없어요"; loadWrite(true); return; }
                    long now = System.currentTimeMillis();
                    boolean ok = id.length() > 0;
                    board.addMine(ok ? id : "L" + now, "잡담", t, b, nick, now, !ok);
                    toast(ok ? "글이 등록되었어요" : "글을 저장했어요. 연결되면 모두에게 보여요");
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
        return e;
    }

    /** 홈 화면: 입력 상태를 엔진에 보내고, 경로 결과가 있으면 결과 화면도 받아 이어 붙여 올린다. */
    private void loadHome(final ScreenView v, final boolean keep) {
        final int my = ++seqHome;
        startHomeTick();
        final String json = home.request(homeEnv(), ShellCore.CAP);
        final boolean hasRes = home.hasRoute();
        final boolean chip = homeChip; homeChip = false;
        final String themeNow = ShellCore.theme(store);
        final String resKey = home.dataRev + ":" + home.resTab + ":" + themeNow;
        final String cachedRes = hasRes ? resGet(resKey) : null;                       // s315: 미리 받아 둔 결과 화면이 있으면 요청 본문(경로 응답 통째)을 주 스레드에서 만들지도 않는다
        final String resBody = hasRes && cachedRes == null ? home.resultRequest(homeEnv(), ShellCore.CAP, themeNow, 0) : "";
        final long nowH = System.currentTimeMillis();
        hc.ensureNext(nowH);
        hc.rideScene = RideService.running ? RideService.liveScene : "";
        hc.share = RideService.running && RideService.liveShare != null;
        final String hKey = hc.key(home.dataRev, home.resTab, nowH, chat.talkCount(), chat.talkMark());
        final String hcTk = hc.tabKey(home.dataRev, home.resTab, chat.talkCount(), chat.talkMark());
        final String hcSig = hcSigOf(home.resTab);
        if (!hKey.equals(hcKey)) {                                                    // 이 탭의 브리핑을 미리 받아 둔 게 있으면 그것을 곧바로 쓴다(방금 받은 것이면 다시 묻지도 않는다)
            String pre = lruGet(hcTab, hcTk), exact = pre;
            if (pre == null || pre.length() == 0) pre = hasRes ? lruGet(hcLast, hcSig) : null;      // s343: 정확한 열쇠가 없어도 같은 경로·같은 탭의 가장 최근 브리핑이 있으면 그것을 먼저(없어서 브리핑 없이 결과만 뜨던 것을 막는다)
            if (pre != null && pre.length() > 0) { hcJson = pre; hcFor = hcSig; if (exact != null && hcTabFresh(hcTk, 50000L)) hcKey = hKey; }
        }
        final String hBody = hKey.equals(hcKey) ? "" : hc.request(ShellCore.CAP, ShellCore.theme(store), homeEnv(), home.resultFacts(homeEnv(), ShellCore.theme(store)), chat.recentTalksJson(8));
        warmTabs();                                                                  // 경로가 있는 다른 탭의 결과 화면 · 홈 카드를 요청 하나씩으로 미리 받아 둔다(밀어서 탭을 바꿀 때 즉시)
        new Thread(new Runnable() {
            @Override public void run() {
                // 경로 결과 · 홈 카드는 홈 화면 응답을 기다리지 않고 함께 받는다(셋이 차례로 걸리던 시간을 가장 느린 하나로)
                final boolean staleCards = hBody.length() > 0 && hcJson.length() > 0 && hcSig.equals(hcFor);                              // 지난 카드가 있으면 그것을 0초에 먼저 그리고, 새 카드는 뒤에서 받아 바뀐 것만 다시 그린다(SWR)
                final String cachedHome = chip ? lruGet(homeCache, ShellCore.homeKey(json)) : null;
                final String[] rsBox = { cachedRes == null ? "" : cachedRes }, cjBox = { hBody.length() == 0 || staleCards ? hcJson : "" };
                Thread tr = null, tc = null;
                final java.util.concurrent.atomic.AtomicBoolean cardsLate = new java.util.concurrent.atomic.AtomicBoolean(false);
                if (hasRes && rsBox[0].length() == 0) {
                    tr = new Thread(new Runnable() { @Override public void run() {
                        NetPost.Res rr = NetPost.post(ShellCore.BASE + "/screen/result", resBody, 15000);
                        rsBox[0] = rr.status == 200 && rr.body != null ? rr.body : "";
                        if (rsBox[0].length() > 0) resPut(resKey, rsBox[0]);
                    } }, "shell-home-res");
                    tr.start();
                }
                if (hBody.length() > 0) {
                    tc = new Thread(new Runnable() { @Override public void run() {
                        NetPost.Res cr = NetPost.post(ShellCore.BASE + "/screen/hcards", hBody, 15000);
                        String nj = cr.status == 200 && cr.body != null ? cr.body : "";
                        if (nj.length() > 0) { hcTabPut(hcTk, nj); if (hasRes) lruPut(hcLast, hcSig, nj, 16); }
                        if (staleCards) {
                            if (nj.length() > 0) { boolean same = nj.equals(hcJson); hcKey = hKey; hcJson = nj; hcFor = hcSig; if (!same) main.post(new Runnable() { @Override public void run() { if (homeVisible()) reloadHome(); } }); }
                            return;
                        }
                        cjBox[0] = nj;
                        if (cjBox[0].length() > 0) { hcKey = hKey; hcJson = cjBox[0]; hcFor = hcSig; }
                        if (cardsLate.get() && nj.length() > 0) main.post(new Runnable() { @Override public void run() { if (homeVisible()) reloadHome(); } });          // 결과를 먼저 올렸다 — 카드가 도착하면 끼운다
                    } }, "shell-home-cards");
                    tc.start();
                }
                String txt;
                if (cachedHome != null) txt = cachedHome;                                                     // 칩만 바꿨다 — 검색 영역은 그대로라 서버에 다시 묻지 않는다
                else {
                    NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/home", json, 8000);
                    txt = r.status == 200 && r.body != null ? r.body : "";
                    if (txt.length() > 0) lruPut(homeCache, ShellCore.homeKey(json), txt, 6);
                }
                try {
                    if (tr != null) tr.join(16000);
                    if (tc != null && !staleCards) {
                        if (hasRes) {                                                                    // s330: 경로 결과가 준비됐는데 홈 카드(AI 승무원 · 대화)가 늦으면 0.5초만 더 기다리고 결과부터 올린다 — 카드는 도착하는 대로 끼운다
                            tc.join(hcFor.startsWith("r" + home.routeId + "#") ? 1500L : 500L);                     // s343: 첫 탐색 결과는 0.5초만 기다리되(s330), 탭·편을 넘길 땐 브리핑도 같이 바뀌도록 조금 더 기다린다(미리 받아 둔 게 없을 때만 해당)
                            if (tc.isAlive()) { cardsLate.set(true); if (!tc.isAlive()) cardsLate.set(false); }
                        } else tc.join(16000);
                    }
                } catch (InterruptedException ignored) { }
                final String txt0 = txt;
                final String rs = hasRes ? rsBox[0] : "", cj = cjBox[0];
                final String fk = txt0.length() > 0 ? finKey(txt0, rs, cj) : "";
                String finHit = fk.length() > 0 ? lruGet(finCache, fk) : null;                                   // s315: 탭을 미리 합쳐 둔 화면이 있으면 JSON 을 다시 읽고 이어 붙이지 않는다
                if (hasRes && txt0.length() > 0) {
                    if (rs.length() > 0) { final String rsf = rs; main.post(new Runnable() { @Override public void run() { home.onResult(rsf); chatRouteSync(); maybeFetchNotes(); maybePrefetchLd(); } }); }
                    else main.post(new Runnable() { @Override public void run() { toast("경로 결과를 그리지 못했어요"); } });
                }
                if (finHit == null) {
                    txt = txt0;
                    if (hasRes && txt.length() > 0 && rs.length() > 0) txt = ShellCore.mergeBodies(txt, rs);
                    if (txt.length() > 0 && cj.length() > 0) txt = ShellCore.mergeBodies(txt, cj);        // 홈 카드 3장(AI 승무원 · 혼잡도 · 실시간 대화)
                    finHit = txt;
                    if (fk.length() > 0 && finHit.length() > 0) lruPut(finCache, fk, finHit, 8);
                }
                final String fin = finHit; warm(fin);
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqHome) return;
                    present(v, fin, keep);
                    if (rloadWantHide && home.hasRoute()) rloadHide();                                        // 경로 결과가 올라왔다 — 로딩 카드를 닫는다
                    if (txt0.length() > 0) home.onScreen(txt0);                                               // 후보 목록(info.pk.u)은 홈 화면 몫이라 합친 큰 글을 다시 읽지 않는다
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
                Uri uri = null; String mime = "image/png";
                try {
                    File dir = new File(getCacheDir(), ShareProvider.DIR);
                    if (!dir.isDirectory()) dir.mkdirs();
                    File[] old = dir.listFiles();
                    if (old != null) for (File o : old) o.delete();
                    long ts = System.currentTimeMillis();
                    try {                                                         // 움직이는 그림(GIF): 마커 깜박임 + 길동무 친구 한 마리가 노선선 위를 오간다
                        byte[] gif = ShareArt.gif(ShellActivity.this, sh, pal, ts);
                        File f = new File(dir, "gildongmu_" + ts + ".gif");
                        FileOutputStream os = new FileOutputStream(f);
                        try { os.write(gif); } finally { os.close(); }
                        uri = ShareProvider.uriFor(ShellActivity.this, f); mime = "image/gif";
                    } catch (Throwable t) {                                       // 실패하면 예전처럼 멈춘 그림(PNG)으로 보낸다
                        ErrLog.record(ShellActivity.this, t, false);
                        android.graphics.Bitmap bmp = ShareArt.draw(sh, pal);
                        File f = new File(dir, "gildongmu_" + ts + ".png");
                        FileOutputStream os = new FileOutputStream(f);
                        try { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, os); } finally { os.close(); }
                        uri = ShareProvider.uriFor(ShellActivity.this, f); mime = "image/png";
                    }
                } catch (Throwable t) { ErrLog.record(ShellActivity.this, t, false); }
                final Uri fu = uri; final String fm = mime;
                main.post(new Runnable() { @Override public void run() { startShare(sh.text, fu, fm); } });
            }
        }).start();
    }
    private void startShare(String text, Uri img, String mime) {
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.putExtra(Intent.EXTRA_TEXT, text);
            if (img != null) { send.setType(mime); send.putExtra(Intent.EXTRA_STREAM, img); send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); }
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
                hcEnsureDong();
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
        if (!first && !far) { hc.fixAt = now; hcEnsureDong(); return; }
        hc.setFix(la, lo, now);
        hcEnsureDong();
        if (homeVisible()) reloadHome();
    }
    private volatile boolean dongBusy = false;
    private volatile long dongTryAt = 0L;
    /** 현위치의 동 이름을 모르면(처음 · 300m 넘게 움직임) 뒤에서 서버에 묻는다 — 경로가 없을 때 브리핑이 '○○동 일대'로 열린다. 실패하면 30초 뒤에 다시 시도, 이름은 저장해 다음 실행에서 바로 쓴다. */
    private void hcEnsureDong() {
        final double[] fx = hc.fix;
        if (fx == null || hc.dongNow().length() > 0 || dongBusy) return;
        long now = System.currentTimeMillis();
        if (now - dongTryAt < 30000L) return;
        dongTryAt = now; dongBusy = true;
        final double la = fx[0], lo = fx[1];
        new Thread(new Runnable() {
            @Override public void run() {
                String nm = "";
                try {
                    NetPost.Res r = NetPost.get(HcardsCore.dongUrl(HomeSearchCore.DEFAULT_BASE, la, lo), 5000);
                    if (r != null && r.status == 200 && r.body != null) nm = HcardsCore.parseDong(r.body);
                } catch (Throwable ignored) { }
                final String name = nm;
                main.post(new Runnable() { @Override public void run() {
                    dongBusy = false;
                    if (name.length() == 0) return;
                    if (hc.setDong(name, la, lo)) {
                        store.put(HcardsCore.K_DONG, hc.dongSaved());
                        if (home.relabelGps(hc.dongNow())) setHomeFields();                // 출발칸 "내 위치" → 동 이름(AI 승무원 카드와 같은 이름)
                        if (homeVisible()) reloadHome();
                    }
                } });
            }
        }, "shell-dong").start();
    }
    private void quietFix() {
        long now = System.currentTimeMillis();
        if (hc.fix != null && now - hc.fixAt < 10 * 60000L) return;
        double[] seed = liveLL();
        if (seed == null) seed = ShellCore.lastLocFresh(store, 24L * 3600000L, now);       // 하루 안에 안 위치면 우선 그것으로 브리핑을 채운다(곧 새 위치로 바로잡힌다)
        if (seed != null && hc.fix == null) { hc.setFix(seed[0], seed[1], now - 9 * 60000L); hc.dongLoad(store.get(HcardsCore.K_DONG, "")); }            // 처음 그릴 때 이미 들어가 있게(다시 그리지 않는다) — 1분 뒤 새로 확인. 같은 곳에서 알아낸 동 이름이 저장돼 있으면 함께
        hcEnsureDong();
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

    /** (스레드 안) 검색 후보: 먼저 엔진(/suggest, 모아 둔 결과를 나눠 쓴다)에 묻고, 못 받으면 예전처럼 원래 서버에 직접 묻는다. */
    private NetPost.Res suggestGet(String kind, String q, String directUrl) {
        NetPost.Res r = NetPost.get(HomeSearchCore.suggestUrl(kind, q), 5000);
        if (r != null && r.status == 200 && r.body != null && r.body.length() > 0) return r;
        return NetPost.get(directUrl, 6000);
    }
    /** 눌려 있는 칸의 글자에 대한 버스정류장·장소 후보를 받아 온다(글이 같으면 다시 받지 않는다). */
    private void fetchCands() {
        final String q = home.wantQuery();
        if (q.length() == 0) return;
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res rb = suggestGet("b", q, HomeSearchCore.busUrl(HomeSearchCore.BUS_BASE, q));
                final List<Map<String, Object>> bus = rb.status == 200 ? HomeSearchCore.parseBus(rb.body) : new java.util.ArrayList<Map<String, Object>>();
                NetPost.Res rp = suggestGet("p", q, HomeSearchCore.placeUrl(HomeSearchCore.DEFAULT_BASE, q));
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
                if (r == HomeCore.R_FIELDS && home.takeAutoGo()) { goRoute(); break; }          // 목적지를 고르면 [경로 탐색]을 안 눌러도 바로 찾는다
                reloadHome(); break;
            case HomeCore.R_GPS: startGps(); break;
            case HomeCore.R_PICK_TIME: pickBase(); break;
            case HomeCore.R_GO: goRoute(); break;
            case HomeCore.R_LOCK: rideLocked(); break;
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
        hcFixFrom(l.getLatitude(), l.getLongitude());                                 // 이 위치의 동 이름도 같이 알아 둔다(AI 승무원 카드와 같은 이름)
        home.setGpsStart(l.getLatitude(), l.getLongitude(), hc.dongNow());
        setHomeFields(); reloadHome();
    }
    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_SETUP_NOTIF) { setupSoon(); return; }                    // 알림 창이 닫혔다(허용이든 거부든) — 다음 승인으로
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
        setupSoon();                                                                 // 위치 창이 닫혔다 — 다음 승인(배터리 안내)으로
    }

    // 기준시각: 날짜 → 시각 고르기(네이티브 대화상자)
    private void pickBase() {
        if (rideLocked()) return;
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
    private int dlgPick = -1;                                  // 탈 버스 고르기 카드에서 누른 버스 번호(dl.bp.N) — 없으면 -1
    private boolean dlgFetch(String kind) {
        if (dlgJson.containsKey(kind)) return false;
        NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/dlg", "{\"cap\":" + ShellCore.CAP + ",\"f\":{\"kind\":" + ShellCore.q(kind) + "}}", 8000);
        if (r.status == 200 && r.body != null && r.body.length() > 2) dlgJson.put(kind, r.body);
        return true;
    }
    /** s320: 매개(역 이름 등)가 붙는 카드 — 열쇠 key 로 담아 둔다(같은 매개는 다시 받지 않는다). fJson 은 f 객체 전체. */
    private boolean dlgFetchF(String key, String fJson) {
        if (dlgJson.containsKey(key)) return false;
        NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/dlg", "{\"cap\":" + ShellCore.CAP + ",\"f\":" + fJson + "}", 8000);
        if (r.status == 200 && r.body != null && r.body.length() > 2) dlgJson.put(key, r.body);
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
        if ("dl.go".equals(v)) v = "dl.ok";                                       // 하차 추천 팝업의 [맛집·쿠팡 보기] → 확인 쪽(열 곳은 그 팝업이 들고 있다)
        if (v != null && v.startsWith("dl.bp.")) {                                 // 탈 버스 고르기: N 번째 버스 → 확인 쪽으로 처리하고 번호는 따로 남긴다
            try { dlgPick = Integer.parseInt(v.substring(6)); } catch (NumberFormatException e) { dlgPick = -1; }
            v = "dl.ok";
        }
        Runnable ok = "dl.ok".equals(v) ? dlgOk : null, no = "dl.ok".equals(v) ? null : dlgNo;
        if (dlgAuto != null) { main.removeCallbacks(dlgAuto); dlgAuto = null; }
        dlgD = null; dlgV = null; dlgOk = null; dlgNo = null;
        try { d.dismiss(); } catch (Throwable ignored) { }
        if (ok != null) ok.run(); else if (no != null) no.run();
    }
    /** s252 (YJ: 하차 추천도 앱을 켜 두면 팝업): 엔진(/screen/dlg kind:reco)이 만든 카드를 띄운다. 알림 대신 이것 하나만 보인다 — 못 띄우면 false(부르는 쪽이 알림으로 대신). */
    private volatile boolean recoPopOpen;
    /** s258: 오버레이·알림에서 추천을 처리했다 — 열려 있는 앱 추천 팝업을 (처리 콜백 없이) 닫는다. */
    static void recoPopupClose() {
        final ShellActivity a = live;
        if (a == null) return;
        a.main.post(new Runnable() { @Override public void run() {
            try {
                if (!a.recoPopOpen || a.dlgD == null) return;
                android.app.Dialog d = a.dlgD;
                if (a.dlgAuto != null) { a.main.removeCallbacks(a.dlgAuto); a.dlgAuto = null; }
                a.dlgD = null; a.dlgV = null; a.dlgOk = null; a.dlgNo = null; a.recoPopOpen = false;
                d.dismiss();
            } catch (Throwable ignored) { }
        } });
    }
    static boolean recoPopup(String title, String text, RideCore.RecoAd ad, double[] loc) { ShellActivity a = live; return a != null && a.recoPop(title, text, ad, loc); }
    /** s295: 다른 창(탑승 시트·결과 창 등)이 떠 있어 추천 팝업을 못 띄울 때 — 0.75초마다 닫혔는지 보고, 끝내 안 닫히면 알림으로 보낸다. */
    private void recoPopWait(final String title, final String text, final RideCore.RecoAd ad, final double[] loc, final int left) {
        main.postDelayed(new Runnable() { @Override public void run() {
            try {
                if (isFinishing() || !resumed) { RideService.recoRoute += " → 기다리다 앱 화면 벗어남"; RecoNotify.show(getApplicationContext(), title, text); return; }
                if (dlgD == null) { RideService.recoRoute += " → 다른 창이 닫혀 팝업"; recoPop(title, text, ad, loc); return; }
                if (left <= 0) { RideService.recoRoute += " → 다른 창이 안 닫혀 알림"; RecoNotify.show(getApplicationContext(), title, text); return; }
                recoPopWait(title, text, ad, loc, left - 1);
            } catch (Throwable t) { try { RecoNotify.show(getApplicationContext(), title, text); } catch (Throwable ignored) { } }
        } }, 750L);
    }
    private boolean recoPop(final String title, final String text, final RideCore.RecoAd ad, final double[] loc) {
        {
            if (!resumed || isFinishing()) { RideService.recoRoute += " → 팝업 못 띄움(앱 화면이 아님)"; return false; }
            if (dlgD != null) {                                                              // s295: 다른 창이 떠 있으면 알림으로 새지 않고 창이 닫히길(최대 12초) 기다렸다 띄운다
                recoPopWait(title, text, ad, loc, 16);
                return true;
            }
            final android.content.Context app = getApplicationContext();
            final String body = "{\"cap\":" + ShellCore.CAP + ",\"f\":{\"kind\":\"reco\",\"title\":" + ShellCore.q(title) + ",\"body\":" + ShellCore.q(text) + ",\"go\":" + ShellCore.q(ad != null && ad.a.length() > 0 ? ad.go : "") + ",\"ok\":\"확인\"}}";
            new Thread(new Runnable() { @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/dlg", body, 6000);
                final String txt = r.status == 200 && r.body != null ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    Runnable go = new Runnable() { @Override public void run() { recoPopOpen = false; RideService.recoDone(); try { ((android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(RecoNotify.RECO_ID); } catch (Throwable ignored) { } OvCore.Row row = new OvCore.Row(); row.a = ad == null ? "" : ad.a; RecoGo.open(ShellActivity.this, ad, loc, row); } };
                    Runnable no = new Runnable() { @Override public void run() { recoPopOpen = false; RideService.recoDone(); try { ((android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(RecoNotify.RECO_ID); } catch (Throwable ignored) { } } };       // s258: 확인·닫기도 처리한 것 — 오버레이 줄·알림이 같이 사라진다
                    if (resumed && txt.length() > 2 && dlgOpen(txt, go, no, 0L)) { recoPopOpen = true; RideService.recoRoute += " → 팝업 떴음"; return; }
                    // s295 (YJ: 도착인데 알림만 오고 팝업이 안 떴다): 팝업 화면을 못 받았거나(서버 응답 " + r.status + ") 열지 못했어도 앱이 보이는 중이면 기본 확인창으로라도 띄운다 — 알림도 같이 둔다
                    RideService.recoRoute += " → 팝업 화면 못 받음/못 염(응답 " + r.status + ")";
                    try { ErrLog.record(app, new IllegalStateException("RIDE_RECO 팝업 실패 응답=" + r.status + " 화면길이=" + txt.length() + " resumed=" + resumed + " " + RideService.recoRoute), false); } catch (Throwable ignored) { }
                    if (resumed && !isFinishing()) {
                        try {
                            android.app.AlertDialog.Builder ab = new android.app.AlertDialog.Builder(ShellActivity.this, android.R.style.Theme_Material_Light_Dialog_Alert).setTitle(title).setMessage(text).setCancelable(true);
                            if (ad != null && ad.a.length() > 0 && ad.go.length() > 0) ab.setPositiveButton(ad.go, new android.content.DialogInterface.OnClickListener() { @Override public void onClick(android.content.DialogInterface di, int w) { go.run(); } });
                            ab.setNegativeButton("확인", new android.content.DialogInterface.OnClickListener() { @Override public void onClick(android.content.DialogInterface di, int w) { no.run(); } });
                            ab.setOnCancelListener(new android.content.DialogInterface.OnCancelListener() { @Override public void onCancel(android.content.DialogInterface di) { no.run(); } });
                            ab.show();
                            return;
                        } catch (Throwable ignored) { }
                    }
                    RecoNotify.show(app, title, text);                                // 팝업을 못 띄웠다 — 추천은 한 여정에 한 번뿐이라 알림으로라도 보낸다
                } });
            } }, "shell-reco-pop").start();
            return true;
        }
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
    private volatile boolean rloadWantHide;
    /** 경로 응답을 받았다: 단추의 도는 표시는 지금 끄고(그려질 화면에 안 남게), 카드는 결과가 올라온 직후(loadHome 의 present)에 닫는다. 4초 안에 안 그려져도 닫는다. */
    private void rloadHideSoon() {
        home.routing = false;
        if (rloadDlg == null) { rloadHide(); return; }
        rloadWantHide = true;
        main.removeCallbacks(rloadSafety); main.postDelayed(rloadSafety, 4000L);
    }
    private void rloadHide() {
        main.removeCallbacks(rloadSafety);
        rloadWantHide = false;
        home.routing = false;
        android.app.Dialog d = rloadDlg; rloadDlg = null; rloadView = null;
        if (d != null) { try { d.dismiss(); } catch (Throwable ignored) { } RunnerArt.release(); }
    }

    /** 확정한 경로(탑승 안내)가 있으면 true — 사용자가 [안내 종료]를 누르거나 도착할 때까지는 새로 찾기·닫기·바꾸기가 확정을 건드리지 못한다. */
    private boolean rideLocked() {
        if (!home.riding()) return false;
        toast("경로를 확정해 안내 중이에요. 안내를 끝낸 뒤에 새로 찾을 수 있어요");
        return true;
    }
    private void goRoute() {
        if (rideLocked()) return;
        final boolean picked = home.baseMs >= 0;
        final long base = picked ? home.baseMs : System.currentTimeMillis();
        final String qs = HomeCore.routeQuery(home.loc[HomeCore.START], home.loc[HomeCore.DEST], base, picked);
        if (qs == null) { toast("출발지와 도착지를 목록에서 골라 주세요"); return; }
        final String url = HomeCore.routeUrl(qs), a = home.sendName(HomeCore.START), b = home.sendName(HomeCore.DEST);
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
        foodWatch(150L);                                                                  // 도착지가 정해져 경로를 찾는 즉시 그 주변 맛집(목록 · 가게 지도)도 뒤에서 받기 시작한다
        if (!shown) { if (rloadJson.length() == 0) toast("경로를 찾는 중이에요"); home.routing = true; reloadHome(); rloadShow(); }       // 찾는 동안만 단추가 돈다(엔진이 그린다)
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r1 = NetPost.get(RouteFetchCore.liveZero(url), 15000);
                String b1 = (r1.status == 200 && r1.body != null) ? r1.body : "";
                Map<String, Object> fo = RouteFetchCore.extractFollow(b1);
                boolean draw = b1.length() > 2 && RouteFetchCore.draws(fo);
                boolean full1 = draw && !RouteFetchCore.wantsFull(fo);
                boolean on = shown;                                            // 이 찾기의 결과가 이미 떠 있나 — 떠 있으면 새 응답은 '바꿔 끼우기'(탭·펼침 그대로, 바뀐 칸만 스프링)
                if (draw && (full1 || !shown)) { postRoute(my, b1, a, b, bt, rb, full1 ? sk : null, on); on = true; }       // 옛 결과가 떠 있으면 근사 결과로 덮지 않고 전체를 기다린다
                if (!draw || RouteFetchCore.wantsFull(fo)) {
                    NetPost.Res r2 = NetPost.get(url, 30000);
                    String b2 = (r2.status == 200 && r2.body != null) ? r2.body : "";
                    if (b2.length() > 2) { postRoute(my, b2, a, b, bt, rb, sk, on); fo = RouteFetchCore.extractFollow(b2); }
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
        if (home.hasLdRoute()) return;                                      // s307(YJ): 장거리 편이 든 결과는 처음 찾은 것으로 고정 — 다시 받아 타는 방법·시각이 계속 바뀌지 않게
        List<Object> delays = (List<Object>) fo.get("retry");
        int miss = RouteFetchCore.num(fo, "miss"), applied = RouteFetchCore.num(fo, "applied");
        for (Object dobj : delays) {
            if (miss <= 0 || !(dobj instanceof Number)) return;
            try { Thread.sleep(Math.max(1000, Math.min(60000, ((Number) dobj).longValue()))); } catch (InterruptedException e) { return; }
            if (my != seqRoute || !home.hasRoute() || home.hasLdRoute()) return;
            String u = url.replaceFirst("baseMs=\\d+", "baseMs=" + System.currentTimeMillis()) + "&pm=" + miss + "&pa=" + applied;
            NetPost.Res r = NetPost.get(u, 30000);
            String body = r.status == 200 && r.body != null ? r.body.trim() : "";
            Map<String, Object> f2 = RouteFetchCore.extractFollow(body);
            if (body.length() < 3 || f2 == null || my != seqRoute) continue;
            if (Boolean.TRUE.equals(f2.get("better"))) {
                miss = RouteFetchCore.num(f2, "miss"); applied = RouteFetchCore.num(f2, "applied");
                final String nb = body;
                main.post(new Runnable() { @Override public void run() { if (my == seqRoute && home.replaceRoute(nb)) { ShellActivity.this.body.springChanges(5000L); reloadHome(); } } });
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
    // s307(YJ): 장거리 모든 편의 경로를 찾은 직후 뒤에서 미리 받아 둔다 — 편을 누르면 곧바로 그 편의 경로·브리핑이 보인다.
    // s308(YJ: "다른 대중교통 선택시 브리핑 변경이 너무 느려"): 경로만이 아니라 엔진 화면(결과 카드·브리핑)까지 미리 만들어 두고, 3개씩 병렬로 받고, 아직 오는 중인 편을 누르면 그 응답을 기다린다.
    private final java.util.concurrent.ConcurrentHashMap<String, String> ldPf = new java.util.concurrent.ConcurrentHashMap<String, String>();      // "탐색번호|질의" → 그 편으로 다시 받은 경로 응답
    private final java.util.concurrent.ConcurrentHashMap<String, String[]> ldScr = new java.util.concurrent.ConcurrentHashMap<String, String[]>();   // 같은 열쇠 → { 결과 카드 화면, 홈 카드 묶음 화면, 그 화면을 만든 탭 }
    private final java.util.Set<String> ldFly = java.util.Collections.newSetFromMap(new java.util.concurrent.ConcurrentHashMap<String, Boolean>());   // 지금 받는 중인 열쇠
    private volatile String ldWant = "";                                         // 사용자가 눌렀는데 아직 오는 중인 열쇠(오면 곧바로 보인다)
    private String ldPfSig = "";
    private void maybePrefetchLd() {
        if (!home.hasRoute() || home.lastQs.length() == 0 || home.riding()) return;
        final java.util.ArrayList<String> qs = new java.util.ArrayList<String>();
        for (String q : home.ldM) if (q != null && q.length() > 0 && !qs.contains(q)) qs.add(q);
        for (String q : home.ldG) if (q != null && q.length() > 0 && !qs.contains(q)) qs.add(q);
        if (qs.isEmpty()) return;
        while (qs.size() > 8) qs.remove(qs.size() - 1);
        final int rid = home.routeId;
        final String sig = rid + "|" + home.lastQs + "|" + qs;
        if (sig.equals(ldPfSig)) return;
        if (ldPfSig.length() > 0 && !ldPfSig.startsWith(rid + "|")) { ldPf.clear(); ldScr.clear(); }
        ldPfSig = sig;
        final String base = home.lastQs;
        final java.util.concurrent.atomic.AtomicInteger nx = new java.util.concurrent.atomic.AtomicInteger(0);
        for (int w = 0; w < 3; w++) new Thread(new Runnable() {
            @Override public void run() {
                int k;
                while ((k = nx.getAndIncrement()) < qs.size()) {
                    if (rid != home.routeId) return;                                                // 그 사이 다른 경로를 찾았다
                    final String q = qs.get(k), key = rid + "|" + q;
                    if (ldPf.containsKey(key) || !ldFly.add(key)) continue;
                    try {
                        NetPost.Res r = NetPost.get(HomeCore.routeUrl(base + q), 30000);
                        final String b = r.status == 200 && r.body != null ? r.body.trim() : "";
                        if (b.length() > 2 && b.charAt(0) == '{' && b.charAt(b.length() - 1) == '}' && b.length() < 3000000 && rid == home.routeId) {
                            ldPf.put(key, b);
                            ldWarmScreens(rid, key, b);                                              // 결과 카드 · 브리핑 화면까지 미리
                        }
                    } finally { ldFly.remove(key); }
                    if (key.equals(ldWant)) main.post(new Runnable() { @Override public void run() { if (key.equals(ldWant) && rid == home.routeId) { ldWant = ""; if (ldPf.containsKey(key)) ldPick(key); else toast("다른 편을 받지 못했어요"); } } });
                }
            }
        }, "shell-ldpf" + w).start();
    }
    /**
     * s311(YJ): 경로 확정 전 결과 카드를 좌우로 밀면 탭(최단시간·최소환승·지하철·버스)이 바로 바뀌도록, 지금 탭이 아닌 탭들의 결과 카드 화면과 홈 카드(브리핑)를 미리 받아 둔다.
     * 경로 응답을 탭마다 따로 올리지 않고 요청 둘(결과 화면 · 홈 카드)에 alts 로 묶어 한 번씩만 올린다 — 엔진이 탭마다 따로 요청한 것과 같은 화면을 돌려준다.
     * 요청 본문은 주 스레드에서 만들고(상태는 되돌린다) 받는 것은 뒤 스레드. 이미 있거나 받는 중인 탭은 건너뛴다. 경로 없는 탭은 엔진이 빼 준다.
     */
    private void warmTabs() {
        if (!home.hasRoute() || home.riding()) return;
        final String th = ShellCore.theme(store);
        final HomeCore.Env env = homeEnv();
        final int rev = home.dataRev;
        final String sigRoute = "r" + home.routeId + "#" + home.ld2Raw.hashCode();
        final java.util.ArrayList<String> rt = new java.util.ArrayList<String>(), ht = new java.util.ArrayList<String>(), htk = new java.util.ArrayList<String>();
        for (String tb : home.resHas.isEmpty() ? java.util.Arrays.asList(HomeCore.RTABS) : new java.util.ArrayList<String>(home.resHas)) {
            if (tb.equals(home.resTab)) continue;                                  // 지금 탭은 loadHome 본 요청이 받는다
            String rk = rev + ":" + tb + ":" + th;
            if (resGet(rk) == null) { boolean add; synchronized (resFly) { add = resFly.add(rk); } if (add) rt.add(tb); }
            String tk = hc.tabKey(rev, tb, chat.talkCount(), chat.talkMark());
            if (!hcTabFresh(tk, 45000L)) { boolean add; synchronized (hcFly) { add = hcFly.add(tk); } if (add) { ht.add(tb); htk.add(tk); } }
        }
        String rb = null, hb = null;
        try {
            if (!rt.isEmpty()) rb = ShellCore.altsBody(home.resultRequestTab(env, ShellCore.CAP, th, rt.get(0)), rt);
            if (!ht.isEmpty()) {
                hc.rideScene = RideService.running ? RideService.liveScene : ""; hc.share = RideService.running && RideService.liveShare != null;
                hb = ShellCore.altsBody(hc.request(ShellCore.CAP, th, env, home.resultFactsTab(env, th, ht.get(0)), chat.recentTalksJson(8)), ht);
            }
        } catch (RuntimeException e) { rb = null; hb = null; }
        final String rbf = rb, hbf = hb;
        if (rbf == null) for (String t : rt) { synchronized (resFly) { resFly.remove(rev + ":" + t + ":" + th); } }
        if (hbf == null) for (String k : htk) { synchronized (hcFly) { hcFly.remove(k); } }
        if (rbf != null) new Thread(new Runnable() { @Override public void run() {
            try {
                NetPost.Res rr = NetPost.post(ShellCore.BASE + "/screen/result", rbf, 15000);
                if (rr.status == 200 && rr.body != null) for (java.util.Map.Entry<String, String> e : ShellCore.altsParse(rr.body, rt).entrySet()) resPut(rev + ":" + e.getKey() + ":" + th, e.getValue());
            } finally { for (String t : rt) synchronized (resFly) { resFly.remove(rev + ":" + t + ":" + th); } main.post(new Runnable() { @Override public void run() { premerge(); } }); }
        } }, "shell-warm-res").start();
        if (hbf != null) new Thread(new Runnable() { @Override public void run() {
            try {
                NetPost.Res cr = NetPost.post(ShellCore.BASE + "/screen/hcards", hbf, 15000);
                if (cr.status == 200 && cr.body != null) for (java.util.Map.Entry<String, String> e : ShellCore.altsParse(cr.body, ht).entrySet()) { int i = ht.indexOf(e.getKey()); if (i >= 0) { hcTabPut(htk.get(i), e.getValue()); lruPut(hcLast, sigRoute + ":" + e.getKey(), e.getValue(), 16); } }
            } finally { for (String k : htk) synchronized (hcFly) { hcFly.remove(k); } main.post(new Runnable() { @Override public void run() { premerge(); } }); }
        } }, "shell-warm-hc").start();
    }
    /** 미리 받은 편을 골랐다고 가정한 요청 본문을 주 스레드에서 만들어(상태는 되돌린다) 엔진에 결과 카드·홈 카드 묶음 화면을 미리 받아 둔다. */
    private void ldWarmScreens(final int rid, final String key, final String body) {
        final String[] bs = new String[3];
        final java.util.concurrent.CountDownLatch cl = new java.util.concurrent.CountDownLatch(1);
        main.post(new Runnable() { @Override public void run() {
            try {
                if (rid != home.routeId || home.riding()) return;
                String th = ShellCore.theme(store), sv = home.ld2Raw;
                home.ld2Raw = body;
                try {
                    bs[0] = home.resultRequest(homeEnv(), ShellCore.CAP, th, 0);
                    bs[1] = hc.request(ShellCore.CAP, th, homeEnv(), home.resultFacts(homeEnv(), th), chat.recentTalksJson(8));
                    bs[2] = home.resTab;
                } finally { home.ld2Raw = sv; }
            } catch (RuntimeException e) { bs[0] = null; } finally { cl.countDown(); }
        } });
        try { if (!cl.await(4, java.util.concurrent.TimeUnit.SECONDS) || bs[0] == null) return; } catch (InterruptedException e) { return; }
        NetPost.Res a = NetPost.post(ShellCore.BASE + "/screen/result", bs[0], 15000);
        NetPost.Res c = NetPost.post(ShellCore.BASE + "/screen/hcards", bs[1], 15000);
        if (a.status == 200 && a.body != null && a.body.length() > 0 && c.status == 200 && c.body != null && c.body.length() > 0 && rid == home.routeId) ldScr.put(key, new String[] { a.body, c.body, bs[2] });
    }
    /** 미리 받아 둔 편으로 바꾼다(주 스레드): 경로 · 결과 카드 · 브리핑이 통신 없이 한꺼번에 바뀐다. */
    private void ldPick(String key) {
        String hit = ldPf.get(key);
        if (hit == null) return;
        ++seqRoute; home.ld2Raw = hit; home.touch();
        String[] sc = ldScr.get(key);
        if (sc != null && sc[2].equals(home.resTab)) {
            long nowH = System.currentTimeMillis(); String th = ShellCore.theme(store);
            resPut(home.dataRev + ":" + home.resTab + ":" + th, sc[0]);
            hc.ensureNext(nowH); hc.rideScene = RideService.running ? RideService.liveScene : ""; hc.share = RideService.running && RideService.liveShare != null;
            hcJson = sc[1]; hcFor = hcSigOf(home.resTab); lruPut(hcLast, hcFor, sc[1], 16); hcKey = hc.key(home.dataRev, home.resTab, nowH, chat.talkCount(), chat.talkMark()); hcTabPut(hc.tabKey(home.dataRev, home.resTab, chat.talkCount(), chat.talkMark()), sc[1]);
        }
        reloadHome();
    }
    /** 장거리 '다른 편' 고르기: 미리 받아 둔 게 있으면 바로, 오는 중이면 그것을 기다리고, 아니면 엔진이 만든 질의를 덧붙여 다시 받아 장거리 경로만 바꿔 끼운다. */
    private void ldReselect() {
        if (home.lastQs.length() == 0) return;
        final String key = home.routeId + "|" + home.ldPending;
        if (ldPf.containsKey(key)) { ldWant = ""; ldPick(key); return; }
        if (ldFly.contains(key)) { ldWant = key; toast("다른 편을 불러오는 중이에요"); return; }       // 이미 받는 중 — 새로 묻지 않고 그 응답이 오면 바로 바꾼다
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
        RideService.buzz(this);                                                  // [경로 확정] 진동(s228)
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            locGate(new Runnable() { @Override public void run() {
                    if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION, android.Manifest.permission.POST_NOTIFICATIONS }, REQ_RIDE);
                    else requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_RIDE);
                } },
                new Runnable() { @Override public void run() { toast("위치 정보 이용에 동의하지 않아 탑승 안내를 할 수 없어요"); } });
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[] { android.Manifest.permission.POST_NOTIFICATIONS }, REQ_RIDE + 1);
        final String facts = home.resultFacts(homeEnv(), ShellCore.theme(store));
        final List<String> off = RideCore.offKinds(store);
        final boolean pfl = "1".equals(store.get(ShellCore.K_PFL, "0"));
        final String body = RideCore.startBody(ShellCore.CAP, facts, off, pfl);
        final int rid = home.routeId;
        toast("탑승 안내를 준비하고 있어요");
        new Thread(new Runnable() {
            @Override public void run() {
                // 첫 구간이 버스면 정류장에서 10분 안에 오는 버스를 골라 탈 수 있게(엔진 /ride/buspick — 고를 것이 없으면 ask:false) — 시작 요청과 동시에 보내 기다림을 늘리지 않는다
                final String[] pk = new String[1];
                Thread tp = new Thread(new Runnable() { @Override public void run() {
                    NetPost.Res b = NetPost.post(ShellCore.BASE + "/ride/buspick", body, 6000);
                    if (b.status == 200 && b.body != null && b.body.length() > 2) pk[0] = b.body;
                } }, "shell-buspick");
                tp.start();
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/ride/start", body, 12000);
                try { tp.join(5000); } catch (InterruptedException e) { /* 무시 */ }
                final String txt = r.body == null ? "" : r.body, pick = pk[0] == null ? "" : pk[0];
                final boolean startOk = r.status == 200 && txt.length() > 0;
                main.post(new Runnable() { @Override public void run() {
                    if (rid != home.routeId || !home.hasRoute()) return;                  // 그 사이 다른 경로를 찾았다
                    if (startOk && pick.length() > 0) { busPickAsk(pick, facts, off, pfl, txt, rid); return; }
                    rideCommit(txt, rid);
                } });
            }
        }, "shell-ride").start();
    }
    /** 첫 구간이 버스: 엔진이 만든 '탈 버스 고르기' 카드를 띄운다. 고른 번호의 도착 시각(ms)은 카드와 함께 온 info.items 에서 읽어 시작 엔진에 그대로 돌려준다(앱은 계산하지 않는다). */
    @SuppressWarnings("unchecked")
    private void busPickAsk(final String pickJson, final String facts, final List<String> off, final boolean pfl, final String txt0, final int rid) {
        final List<Long> ms = new ArrayList<Long>();
        final List<String> nos = new ArrayList<String>();              // 줄마다 엔진이 알려 준 버스 번호(같은 구간을 가는 번호가 여러 개일 때 — 고른 번호를 엔진에 돌려준다)
        boolean ask = false;
        long autoMs = 0L;
        String autoNo = "";
        try {
            Object o = ScreenCore.parse(pickJson);
            if (o instanceof Map) {
                Map<String, Object> m = (Map<String, Object>) o;
                ask = Boolean.TRUE.equals(m.get("ask"));
                if (m.get("auto") instanceof Map && ((Map<String, Object>) m.get("auto")).get("ms") instanceof Number) autoMs = ((Number) ((Map<String, Object>) m.get("auto")).get("ms")).longValue();      // 오는 버스가 하나뿐 — 묻지 않고 그 버스로
                if (m.get("auto") instanceof Map && ((Map<String, Object>) m.get("auto")).get("no") != null) autoNo = String.valueOf(((Map<String, Object>) m.get("auto")).get("no"));
                Object inf = m.get("info");
                if (inf instanceof Map && ((Map<String, Object>) inf).get("items") instanceof List)
                    for (Object x : (List<Object>) ((Map<String, Object>) inf).get("items")) if (x instanceof Map && ((Map<String, Object>) x).get("ms") instanceof Number) { ms.add(((Number) ((Map<String, Object>) x).get("ms")).longValue()); Object nv = ((Map<String, Object>) x).get("no"); nos.add(nv == null ? "" : String.valueOf(nv)); }
            }
        } catch (Throwable ignored) { ask = false; }
        if (!ask && autoMs > 0L) { rideStartPicked(RideCore.startBody(ShellCore.CAP, facts, off, pfl, autoMs, autoNo), rid); return; }
        if (!ask || ms.isEmpty()) { rideCommit(txt0, rid); return; }
        dlgPick = -1;
        boolean shown = dlgOpen(pickJson, new Runnable() { @Override public void run() {
            int ix = dlgPick; dlgPick = -1;
            if (ix >= 0 && ix < ms.size()) rideStartPicked(RideCore.startBody(ShellCore.CAP, facts, off, pfl, ms.get(ix), ix < nos.size() ? nos.get(ix) : ""), rid);       // 고른 버스로 다시 시작(엔진이 그 차를 따라간다)
            else rideCommit(txt0, rid);                                                      // 고르지 않고 시작 = 경로 시각대로
        } }, new Runnable() { @Override public void run() { dlgPick = -1; toast("탑승 안내를 시작하지 않았어요"); } }, 0L);
        if (!shown) rideCommit(txt0, rid);                                                  // 카드를 못 띄우면 예전처럼 바로 시작
    }
    private void rideStartPicked(final String body, final int rid) {
        toast("고른 버스로 탑승 안내를 준비하고 있어요");
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/ride/start", body, 12000);
                final String txt = r.body == null ? "" : r.body;
                main.post(new Runnable() { @Override public void run() { rideCommit(txt, rid); } });
            }
        }, "shell-ride-pick").start();
    }
    /** 엔진이 만든 탑승 state(/ride/start 응답)를 받아 서비스에 넘기고 화면을 맞춘다. */
    private void rideCommit(final String txt, final int rid) {
            if (rid != home.routeId || !home.hasRoute() || home.riding()) return;                  // 그 사이 다른 경로를 찾았다
            String err = txt.length() == 0 ? "탑승 안내를 시작하지 못했어요" : ride.onStart(txt);
            if (err.length() > 0) { toast(err); try { ErrLog.record(this, new IllegalStateException("RIDE_START " + err), false); } catch (Throwable ignored) { } return; }
            RideService.save(ShellActivity.this, ride);
            store.put(ShellCore.K_RIDESNAP, home.rideSnapshot());
            try { RideService.start(ShellActivity.this); } catch (Throwable t) { toast("탑승 안내를 켜지 못했어요"); try { ErrLog.record(this, t, false); } catch (Throwable ignored) { } return; }
            home.rideRouteId = rid; rideSeq = seqRoute; lostN = 0;
            rideGraceUntil = System.currentTimeMillis() + 8000L;
            home.setRide(ride.rideJson(), ride.lvJson()); chatRouteSync();
            final boolean inDetail = sheet != null && sheet.isShowing() && ShellCore.S_DETAIL.equals(sheetName);
            toast(HomeCore.optName(home.resTab) + " 경로로 확정했어요");                    // 웹 confirmSelectedRoute 토스트
            ovlHintOnce();
            rsOpenSoon();
            if (inDetail) {                                                              // 웹: 단추가 초록 '확정됨' 으로 바뀌고 0.6초 뒤 시트가 닫힌다
                loadDetail();
                main.postDelayed(new Runnable() { @Override public void run() { if (sheet != null && ShellCore.S_DETAIL.equals(sheetName)) closeSheet(); } }, 600L);
            } else closeSheet();
            reloadHome();
            final List<String> secs = new ArrayList<String>(home.resSec);
            new Thread(new Runnable() {
                @Override public void run() {
                    RulesCore.applyMyLines(store, rulesCall(RulesCore.mylinesBody(store.get(ChatCore.K_MY, "[]"), secs, System.currentTimeMillis())));
                }
            }, "shell-rules-ride").start();
    }
    private boolean ovlAskedRun;
    /** 웹 _pipArmNow: 경로를 확정했는데 '다른 앱 위에 표시' 허용이 없으면 안내 창을 이번 실행에 한 번 띄운다(다른 앱을 보면서도 내 위치·탑승 줄을 보려면 필요). 끈 적이 있으면 묻지 않는다. */
    /** 이미 '다른 앱 위에 표시'를 허용해 둔 기기에서 길동무의 켬/끔을 한 번도 안 골랐으면 켠 것으로 둔다(허용만 하고 켜지 않아 막대가 영영 안 뜨던 것). 일부러 끈("0") 것은 그대로. */
    private void ovlAuto() {
        try { if (RideOverlay.supported() && RideOverlay.allowed(this) && store.get(ShellCore.K_OVL, "").length() == 0) store.put(ShellCore.K_OVL, "1"); } catch (Throwable ignored) { }
    }
    private void ovlHintOnce() {
        ovlAuto();
        try {
            if (ovlAskedRun || !RideOverlay.supported() || RideOverlay.allowed(this) || "0".equals(store.get(ShellCore.K_OVL, ""))) return;       // 일부러 끈("0") 사람에게는 묻지 않는다
            ovlAskedRun = true;
            store.put(ShellCore.K_OVLASK, "1");
            main.postDelayed(new Runnable() { @Override public void run() { if (resumed && (sheet == null || !sheet.isShowing())) openSetPage("askovl"); } }, 1800L);
        } catch (Throwable ignored) { }
    }
    /** 경로를 확정하면 하단 탭의 탑승 시트를 바로 한 번 연다(웹은 도착 2분 전에 올라오지만, 확정 직후에도 쓸어 올리지 않고 볼 수 있게). 열고 닫기는 엔진이 정한다. */
    private void rsOpenSoon() {
        main.postDelayed(new Runnable() { @Override public void run() { if (RideService.running) RideService.rsAct("open"); } }, 2600L);
    }
    /** 앱이 죽었다(또는 화면만 다시 만들어졌다) 다시 열렸을 때, 탑승 안내가 아직 살아 있으면 그 경로의 결과 카드를 되살린다. */
    private void restoreRideCard() {
        try {
            String snap = store.get(ShellCore.K_RIDESNAP, "");
            if (snap.length() < 3 || home.hasRoute()) return;
            RideCore live = RideCore.restore(getSharedPreferences(RideService.PREFS, MODE_PRIVATE).getString(RideService.KEY_SAVED, ""), System.currentTimeMillis());
            if (live == null || !home.restoreRide(snap)) return;
            home.rideRouteId = home.routeId;
            home.setRide(RideService.running ? RideService.liveRide : live.rideJson(), RideService.running ? RideService.liveLv : live.lvJson()); chatRouteSync();
            rideGraceUntil = System.currentTimeMillis() + 8000L;
        } catch (Throwable ignored) { }
    }
    /** 경로 카드 버튼 줄 오른쪽 칸(탑승 · 환승 · 도착): 칸의 뜻은 엔진이 정했다. 탑승·환승 = 탑승 시트의 [탑승]과 같은 확정, 도착 = 안내 종료. */
    private void rideSlot() {
        String sl = RideService.liveRowSlot;
        if ("arrive".equals(sl)) { stopRide(); return; }
        if (!RideService.running || !("board".equals(sl) || "transfer".equals(sl))) return;
        if (RideService.liveRowCan) RideService.rsAct("press");                      // 진동은 rsAct → 서비스 act 에서 한 번(s228)
        else toast("앞 구간을 내린 뒤에 눌러 주세요");
    }
    private void stopRide() {
        store.put(ShellCore.K_RIDESNAP, "");
        RideService.stop(this);
        rideGraceUntil = 0L;
        home.setRide("", "");
        home.endJourney(); chatRouteSync(); hc.share = false;                                       // s309(YJ): 안내 종료 = 여정 종료 — 도착지를 넣기 전 첫 홈 화면으로(다시 도착지를 넣을 수 있게)
        ldPf.clear(); ldScr.clear(); ldWant = "";
        setHomeFields();
        reloadHome();
        toast("여정을 끝냈어요. 새 도착지를 넣어 주세요");
    }
    private long reviveAt; private int reviveN;
    /** 탑승 서비스가 꺼져 있는데 저장된 안내(30분 안)가 있으면 다시 켠다(앱이 죽었다 살아났거나 시스템이 서비스를 내렸을 때). 다시 켰으면 true — 그동안은 확정을 지우지 않는다. 4초에 한 번 · 최대 6번. */
    private boolean reviveRide() {
        if (RideService.running) { if (reviveN > 0 && System.currentTimeMillis() - reviveAt > 60000L) reviveN = 0; return false; }       // 켠 뒤 1분 넘게 살아 있어야 횟수를 지운다(켜자마자 끝나는 일이 되풀이돼도 30초 간격)
        try {
            long now = System.currentTimeMillis();
            if (RideCore.restore(getSharedPreferences(RideService.PREFS, MODE_PRIVATE).getString(RideService.KEY_SAVED, ""), now) == null) return false;     // 저장본이 없다 = 도착했거나 사용자가 끝냈다(서비스가 지운다)
            if (now - reviveAt >= (reviveN >= 6 ? 30000L : 4000L)) {                      // 6번 해도 안 켜지면 포기하지 않고 30초마다 계속 — 확정은 사용자가 끝내거나 도착할 때까지 풀리지 않는다
                reviveAt = now; reviveN++;
                try { RideService.start(this); } catch (Throwable t) { /* 시스템이 지금은 못 켜게 한다 — 다음 번에 다시 */ }
            }
            return true;
        } catch (Throwable t) { return false; }
    }
    /** 서비스가 엔진에게서 받은 상태(상주 글 · 내 위치)를 결과 카드에 옮긴다. */
    private void pollRide() {
        if (!home.riding()) return;
        if (RideService.running) lostN = 0;
        if (!RideService.running && (System.currentTimeMillis() < rideGraceUntil || reviveRide())) return;       // 서비스가 막 켜지는 중 · 시스템이 서비스를 내렸으면(저장본이 살아 있는 동안) 다시 켜고 기다린다 — 확정이 풀린 것처럼 지우지 않는다
        if (!RideService.running && !("arrive".equals(RideService.endReason) || "user".equals(RideService.endReason)) && resumeLostRide()) return;       // 사용자가 끝내지도 도착하지도 않았는데 서비스가 없다 — 확정을 풀지 않고 다시 켠다
        if (RideService.running && RideService.liveRide.length() < 3) return;                                   // 서비스는 돌지만 첫 값이 아직 안 올라왔다 — 비어 있다고 확정을 지우지 않는다(끝났으면 running 이 먼저 꺼진다)
        if (home.setRide(RideService.liveRide, RideService.liveLv)) { chatRouteSync(); reloadHome(); }
        rerouteAsk();
    }
    private int lostN = 0; private long lostAt = 0L;
    /**
     * 탑승 서비스가 사용자가 끝내지도 도착하지도 않았는데 없다(켜지지 않았거나 · 시스템이 내렸거나 · 엔진이 뜻밖에 끝냈다).
     * 앱이 들고 있는 탑승 상태(ride)를 저장본으로 다시 써서 서비스를 다시 켠다 — 30초에 한 번, 스무 번까지. 다시 켜는 동안은 true(확정 유지), 포기하면 false.
     * 처음 한 번은 까닭을 오류 기록에 남겨 기기에서 원인을 볼 수 있게 한다.
     */
    private boolean resumeLostRide() {
        long now = System.currentTimeMillis();
        if (lostN >= 20 || !ride.hasState()) return false;
        if (lostN == 0) { try { ErrLog.record(this, new IllegalStateException("RIDE_LOST reason=" + RideService.endReason), false); } catch (Throwable ignored) { } }
        if (lostN == 0 || now - lostAt >= 30000L) {
            lostAt = now; lostN++;
            RideService.save(this, ride);
            try { RideService.start(this); } catch (Throwable t) { /* 시스템이 지금은 못 켜게 한다 — 다음 번에 다시 */ }
        }
        return true;
    }
    private String legAsked = "";
    /** s320 (YJ: 중간에 버스로 환승할 때, 추천 버스와 5분 안에 오는 다른 번호가 있으면 사용자가 고르게): 환승 대기 · 승차 대기 중인 버스 구간을 한 번만 엔진(/ride/buspick + leg)에 묻는다.
     *  엔진이 고를 것이 있다고 하면 탈 버스 고르기 카드를 띄우고, 고른 번호의 변경분(엔진이 번호마다 만든 patch)을 달리는 안내에 끼운다. 앱은 계산하지 않는다. */
    @SuppressWarnings("unchecked")
    private void legAsk() {
        if (!resumed || isFinishing() || !home.riding() || !RideService.running || !home.hasRoute()) return;
        final int bj = RideService.liveBoardJ, bi = RideService.liveBoardI;
        if (bj < 0 || bi < 2) return;                                                     // 첫 구간 버스는 시작 때 이미 물었다
        final String key = home.routeId + "#" + bj;
        if (key.equals(legAsked) || (dlgD != null && dlgD.isShowing())) return;
        legAsked = key;
        final String body = RideCore.legBody(ShellCore.CAP, home.resultFacts(homeEnv(), ShellCore.theme(store)), bj, RideService.liveArr, System.currentTimeMillis());
        final int rid = home.routeId;
        Thread t = new Thread(new Runnable() { @Override public void run() {
            NetPost.Res b = NetPost.post(ShellCore.BASE + "/ride/buspick", body, 7000);
            final String txt = b.status == 200 && b.body != null ? b.body : "";
            if (txt.length() < 3) return;
            main.post(new Runnable() { @Override public void run() { if (rid == home.routeId && home.riding()) legOpen(txt); } });
        } }, "shell-legpick");
        t.setDaemon(true); t.start();
    }
    @SuppressWarnings("unchecked")
    private void legOpen(String txt) {
        final List<Long> ms = new ArrayList<Long>();
        final List<String> nos = new ArrayList<String>();
        final Map<String, Object> patches = new java.util.HashMap<String, Object>();
        try {
            Object o = ScreenCore.parse(txt);
            if (!(o instanceof Map)) return;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!Boolean.TRUE.equals(m.get("ask")) || !(m.get("leg") instanceof Map) || !(((Map<String, Object>) m.get("leg")).get("patch") instanceof Map)) return;
            patches.putAll((Map<String, Object>) ((Map<String, Object>) m.get("leg")).get("patch"));
            Object inf = m.get("info");
            if (inf instanceof Map && ((Map<String, Object>) inf).get("items") instanceof List)
                for (Object x : (List<Object>) ((Map<String, Object>) inf).get("items")) if (x instanceof Map && ((Map<String, Object>) x).get("ms") instanceof Number) { ms.add(((Number) ((Map<String, Object>) x).get("ms")).longValue()); Object n = ((Map<String, Object>) x).get("no"); nos.add(n == null ? "" : String.valueOf(n)); }
        } catch (Throwable ignored) { return; }
        if (ms.isEmpty()) return;
        dlgPick = -1;
        boolean shown = dlgOpen(txt, new Runnable() { @Override public void run() {
            int ix = dlgPick; dlgPick = -1;
            if (ix < 0 || ix >= ms.size() || ix >= nos.size()) return;                        // 고르지 않음 — 계획대로
            Object p = patches.get(nos.get(ix));
            if (p == null) return;
            if (RideService.busSwap(HomeSearchCore.toJson(p), ms.get(ix))) toast(nos.get(ix) + "번 버스를 따라갈게요");
        } }, new Runnable() { @Override public void run() { dlgPick = -1; } }, 0L);
        if (!shown) legAsked = "";                                                          // 다른 카드가 떠 있었다 — 다음에 다시 묻는다
    }
    private long offAskedAt = 0L;
    private android.app.Dialog offDlg;
    /** 확정한 경로를 오차 범위 넘게 벗어났다고 엔진이 알리면(RideService.liveOff) 한 번 묻는다 — 지금 위치에서 도착지까지 다시 찾을지. 같은 이탈에는 다시 묻지 않고, 경로로 돌아왔다 또 벗어나면 다시 묻는다. */
    private void rerouteAsk() {
        if (!resumed || isFinishing() || !home.riding() || !RideService.running) return;
        final long at = RideService.liveOff;
        if (at <= 0L || at == offAskedAt || (offDlg != null && offDlg.isShowing())) return;
        if (dlgD != null && dlgD.isShowing()) return;                                   // 다른 안내창이 떠 있으면 닫힌 뒤 다음 단계에서 묻는다
        offAskedAt = at;
        final String stn = RideService.liveOffStn == null ? "" : RideService.liveOffStn;
        final String key = "offroute|" + stn;
        String js = dlgJson.get(key);
        if (js != null) { offAskOpen(stn, js); return; }
        Thread t = new Thread(new Runnable() { @Override public void run() {                    // 엔진 카드를 받아 오는 동안은 기다리고, 못 받으면 옛 창으로 대신한다
            try { dlgFetchF(key, "{\"kind\":\"offroute\",\"stn\":" + ShellCore.q(stn) + "}"); } catch (Throwable ignored) { }
            main.post(new Runnable() { @Override public void run() {
                if (!resumed || isFinishing() || !home.riding() || RideService.liveOff != at) return;
                String got = dlgJson.get(key);
                if (got != null) offAskOpen(stn, got); else offAskLegacy(stn);
            } });
        } }, "shell-offdlg");
        t.setDaemon(true); t.start();
    }
    /** s320 (YJ: 경로를 벗어났어요 팝업을 테마에 맞게 · 단추 크기를 같게): 엔진 카드. [역까지 이동]=dl.bp.0 · [다시 찾기]=dl.bp.1 · [계속 안내]=취소 쪽. */
    private void offAskOpen(final String stn, String js) {
        dlgPick = -1;
        boolean shown = dlgOpen(js, new Runnable() { @Override public void run() {
            int ix = dlgPick; dlgPick = -1;
            if (ix == 0 && stn.length() > 0) { RideService.rsAct("detour"); toast(stn + "까지 안내할게요"); }
            else if (ix == 1) rerouteFromHere();
        } }, new Runnable() { @Override public void run() { dlgPick = -1; } }, 0L);
        if (!shown) offAskLegacy(stn);
    }
    /** 엔진 카드를 못 받았을 때만 쓰는 옛 창(같은 세 선택). */
    private void offAskLegacy(final String stn) {
        try {
            AlertDialog.Builder ob = new AlertDialog.Builder(this, android.R.style.Theme_Material_Light_Dialog_Alert)
                .setTitle("경로를 벗어났어요")
                .setMessage("지금 있는 곳에서 도착지까지 경로를 다시 찾을까요?\n다시 찾으면 지금 안내는 끝나고, 새 경로를 확정할 수 있어요.")
                .setPositiveButton("다시 찾기", new android.content.DialogInterface.OnClickListener() { @Override public void onClick(android.content.DialogInterface d, int w) { rerouteFromHere(); } })
                .setNegativeButton("계속 안내", null);
            if (stn != null && stn.length() > 0)
                ob.setNeutralButton("역까지 이동", new android.content.DialogInterface.OnClickListener() { @Override public void onClick(android.content.DialogInterface d, int w) { RideService.rsAct("detour"); toast(stn + "까지 안내할게요"); } });
            offDlg = ob.show();
        } catch (Throwable t) { offAskedAt = 0L; }
    }
    /** 사용자가 '다시 찾기'를 골랐다: 지금 위치를 출발지로 같은 도착지까지 새로 찾는다(자동 확정은 하지 않는다). 위치를 못 잡으면 안내를 그대로 둔다. */
    private void rerouteFromHere() {
        if (!home.riding()) return;
        HomeCore.Loc dest = home.loc[HomeCore.DEST];
        if (dest == null || !dest.ok()) { toast("도착지를 찾지 못해 다시 찾을 수 없어요"); return; }
        if (!hasLocPerm()) { toast("위치 권한이 없어 다시 찾을 수 없어요"); return; }
        toast("지금 위치에서 경로를 다시 찾는 중이에요");
        final boolean[] once = new boolean[1];
        locateNow(12000L, 1000L, 5000L, 60000L, new LocCb() {
            @Override public void fix(Location l) {
                if (once[0] || !home.riding()) return;
                once[0] = true;
                saveLoc(l);
                store.put(ShellCore.K_RIDESNAP, "");
                RideService.stop(ShellActivity.this); rideGraceUntil = 0L;                    // 사용자가 새로 찾기를 골랐다 — 지난 안내를 조용히 끝낸다(도보 안내 시트 · 토스트 없이)
                home.setRide("", "");
                home.setGpsStart(l.getLatitude(), l.getLongitude(), hc.dongNow());
                home.baseMs = -1; home.clearRoute(); chatRouteSync();
                setHomeFields();
                store.put(ShellCore.K_TAB, "home"); showTab("home");
                goRoute();
            }
            @Override public void fail(boolean noperm) { if (!once[0]) toast("현재 위치를 찾지 못해 지금 안내를 그대로 이어가요"); }
        });
    }

    // ───────────── 도보 안내 시트 — 없앴다(s233, YJ: 목적지까지 도보 안내는 아예 없애줘). 안내 종료 뒤에 아래 시트를 띄우지 않는다. ─────────────

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
            // s250 (YJ: 세부경로를 볼 때 하단탭이 흐려지지 말고 눌리게): 창을 탭 막대 위까지만 덮고(어둡게 하는 것도 이 창 안에서만) 그 아래는 앱이 그대로 받는다 — 탭 · 탑승 시트가 밝은 채로 눌린다
            int tabsScr = getResources().getDisplayMetrics().heightPixels - Math.round(56f * dpr);
            if (tabs != null && tabs.getHeight() > 0) { int[] tl0 = new int[2]; tabs.getLocationOnScreen(tl0); tabsScr = tl0[1]; }
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(Math.round(200f * dpr), tabsScr));
            w.setGravity(android.view.Gravity.TOP);
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0x00000000));
            w.clearFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            w.addFlags(android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | android.view.WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN);
            root.setBackgroundColor(0xD1000000);                                         // 웹 0.82 어둡게 — 창 안쪽만
            sheet.setCanceledOnTouchOutside(false);
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
    private boolean popSheet;
    /** 가운데 팝업(위치 안내 · 처음 설치 안내)의 높이를 화면이 정한 글 높이에 맞춘다(화면 높이의 90%까지). */
    private void popResize(float dp) {
        try {
            if (!popSheet || sheet == null || !sheet.isShowing() || dp <= 0f) return;
            float sh = getResources().getDisplayMetrics().heightPixels / dpr, sw = getResources().getDisplayMetrics().widthPixels / dpr;
            android.view.Window w = sheet.getWindow();
            android.view.WindowManager.LayoutParams lp = w.getAttributes();
            lp.width = Math.round(Math.min(sw - 44f, 400f) * dpr); lp.height = Math.round(Math.min(dp, sh * 0.9f) * dpr); lp.gravity = android.view.Gravity.CENTER; lp.y = 0;
            w.setAttributes(lp);
        } catch (Throwable ignored) { }
    }
    private void openSetPage(String page) {
        closeSheet();
        setPage = page; arrStat = false;
        if (!"cm".equals(page)) { cm.pop = false; cmFromInline = false; }
        if ("cm".equals(page) && !"tp".equals(cm.sub)) { cm.sub = ""; cm.pop = false; cm.clearBus(); }          // 설정 화면 안 패널이 시각 고르기만 시트로 열 때(sub=tp)는 그대로
        sheetName = ShellCore.S_SETPG;
        final boolean tpPop = "cm".equals(page) && cm.pop && "tp".equals(cm.sub);                        // 시각 고르기 · 출퇴근 브리핑 알림 창도 가운데 팝업
        final boolean pop = "locd".equals(page) || "cmb".equals(page) || tpPop || ShellCore.isAskPage(page);                              // 위치 안내 · 처음 설치 안내는 웹처럼 가운데 팝업(바깥은 어둡게)
        popSheet = pop;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        int[] spal = ShellCore.palette(ShellCore.theme(store));
        if (pop) { spal = spal.clone(); spal[ScreenView.R_BG] = spal[ScreenView.R_CARD]; }
        sheetView.setPalette(spal);
        sheetView.setListener(new SheetHost());
        if (pop) {
            sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_Dialog_NoActionBar);
            FrameLayout box = new FrameLayout(this);
            android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
            g.setColor(spal[ScreenView.R_CARD]); g.setCornerRadius(20f * dpr);
            box.setBackground(g);
            if (Build.VERSION.SDK_INT >= 21) box.setClipToOutline(true);
            box.addView(sheetView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            sheet.setContentView(box);
            boolean soft = tpPop || "cmb".equals(page);                                              // 시각 · 브리핑 창은 바깥을 누르거나 뒤로 가기로도 닫힌다
            sheet.setCancelable(soft); sheet.setCanceledOnTouchOutside(soft);
            if (soft) sheet.setOnCancelListener(new android.content.DialogInterface.OnCancelListener() { @Override public void onCancel(android.content.DialogInterface di) {
                if (tpPop) { cm.sub = ""; cm.pop = false; cmFromInline = false; }
                closeSheet();
            } });
            android.view.Window w = sheet.getWindow();
            float sw = getResources().getDisplayMetrics().widthPixels / dpr;
            w.setLayout(Math.round(Math.min(sw - 44f, 400f) * dpr), Math.round(200f * dpr));          // 높이는 엔진 화면이 정한 글 높이로 곧 맞춘다(onContentH)
            w.setGravity(android.view.Gravity.CENTER);
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0x00000000));
            w.addFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            w.setDimAmount(0.68f);                                                                    // 웹 rgba(0,0,0,.68)
            try { sheet.show(); } catch (Throwable t) { toast("설정을 열지 못했어요"); return; }
            loadSetPage();
            return;
        }
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        sheet.setContentView(sheetView);
        try { sheet.show(); slideIn(sheetView); } catch (Throwable t) { toast("설정을 열지 못했어요"); return; }
        loadSetPage();
    }
    private void loadSetPage() {
        final String url = "sam".equals(setPage) ? ShellCore.pageUrlSam(PowerInfo.read(this).pageFacts())
            : "cmb".equals(setPage) ? ShellCore.pageUrlPlain("cmb", cmbFacts())
            : ("cm".equals(setPage) ? ShellCore.pageUrlCm(cm.pageFacts(store))
            : "gw".equals(setPage) ? ShellCore.pageUrlGw(GwCore.pageFacts(store))
            : "locd".equals(setPage) ? ShellCore.pageUrlPlain("locd", null)
            : ShellCore.isAskPage(setPage) ? ShellCore.pageUrlAsk(setPage, PowerInfo.isSamsung())
            : "erl".equals(setPage) ? ShellCore.pageUrlPlain("erl", ErrCore.pageFacts(store))
            : ShellCore.isPolPage(setPage) ? ShellCore.pageUrlPlain(setPage, null)
            : "dev".equals(setPage) ? ShellCore.pageUrlDev(DevCore.withPerf(DevCore.pageFacts(devPh, devLeft(), devStopped), PerfLog.snapshot()))
            : "arr".equals(setPage) ? ShellCore.pageUrlArr(arrStat, RideService.running, notifOk(), RideService.liveReco, RideService.recoStage + (RideService.recoRoute.length() > 0 ? " · " + RideService.recoRoute : ""), RideService.recoStageAt)
            : ShellCore.pageUrl(store, "ovl", RideOverlay.supported(), RideOverlay.allowed(this)));
        final String hit = "cm".equals(setPage) && cm.pop ? tpCache.get(url) : null;                     // 미리 받아 둔 시각 고르기 화면이면 기다리지 않고 바로 올린다
        if (hit != null) { present(sheetView, hit, true); return; }
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.get(url, 8000);
                if (r.status != 200 && ("erl".equals(setPage) || "dev".equals(setPage))) {          // s321 (YJ: 오류 로그 · 개발자 도구가 안 열려): 주소가 길거나 사실 글이 커서 거절됐을 수 있다 — 줄인 사실로 한 번 더 받는다
                    String small = "erl".equals(setPage) ? ShellCore.pageUrlPlain("erl", ErrCore.pageFacts(store, 1800)) : ShellCore.pageUrlDev(DevCore.pageFacts(devPh, devLeft(), devStopped));
                    r = NetPost.get(small, 8000);
                }
                final int stCode = r.status;
                final String txt = r.status == 200 ? r.body : ""; warm(txt);
                if (txt.indexOf("\"body\"") > 0 && url.indexOf("p=cm&") > 0 && url.indexOf("pop") > 0) tpPut(url, txt);
                main.post(new Runnable() { @Override public void run() {
                    if (sheet == null || !sheet.isShowing() || !ShellCore.S_SETPG.equals(sheetName)) return;
                    if (ShellCore.isAskPage(setPage) && txt.indexOf("\"body\"") < 0) { askUnburn(setPage); setupNoEngine = true; closeSheet(); if ("askovl".equals(setPage)) toast("설정에서 '다른 앱 위에 표시'를 켜 주세요"); return; }          // 서버 엔진이 아직 이 안내를 모르면(붙여넣기 전) 이번 실행엔 건너뛰고, '물었다' 표시는 지워 둔다
                    if (txt.length() == 0) { toast("설정을 받지 못했어요" + (stCode > 0 ? " (" + stCode + ")" : " (연결 안 됨)")); return; }
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
    private final java.util.HashMap<String, String> tpCache = new java.util.HashMap<String, String>();
    private void tpPut(final String url, final String txt) { main.post(new Runnable() { @Override public void run() { if (tpCache.size() > 12) tpCache.clear(); tpCache.put(url, txt); } }); }
    /** 설정 화면이 뜨면 출근·퇴근 시각 고르기 팝업 화면을 뒤에서 미리 받아 둔다 — 시각 칸을 누르면 기다림 없이 뜬다. */
    private long tpPreAt;
    private void cmPrefetchTp() {
        long now = System.currentTimeMillis();
        if (now - tpPreAt < 120000L) return;
        tpPreAt = now;
        for (String k : new String[] { "morn", "eve" }) {
            final String url = ShellCore.pageUrlCm(CmCore.tpPopFacts(store, k));
            if (tpCache.containsKey(url)) continue;
            new Thread(new Runnable() { @Override public void run() {
                NetPost.Res r = NetPost.get(url, 8000);
                if (r.status == 200 && r.body.indexOf("\"body\"") > 0) tpPut(url, r.body);
            } }, "shell-tppre").start();
        }
    }
    private String cmbKind = "morn", cmbTitle = "", cmbBody = "";
    private String cmbFacts() {
        return "{\"pf\":{\"cb\":{\"kind\":" + ShellCore.q(cmbKind) + ",\"title\":" + ShellCore.q(cmbTitle) + ",\"body\":" + ShellCore.q(cmbBody) + "}}}";
    }
    /** 출퇴근 브리핑 알림을 눌러 앱이 열렸다 — 가운데 창에 브리핑을 보이고 [확인](닫기) · [출근하기]/[퇴근하기](자동 경로탐색) 를 준다. */
    private void briefLaunch() {
        final String[] b = CommuteAlarm.takeBrief();
        if (b == null) return;
        main.post(new Runnable() { @Override public void run() {
            if (isFinishing()) return;
            cmbKind = "eve".equals(b[0]) ? "eve" : "morn"; cmbTitle = b[1]; cmbBody = b[2];
            openSetPage("cmb");
        } });
    }
    /** 브리핑 창의 단추. */
    private void cmbAct(String v) {
        if ("cmb.ok".equals(v)) { closeSheet(); return; }
        if ("cmb.go".equals(v)) { final String k = cmbKind; closeSheet(); startCommuteRoute(k); }
    }
    private void cmAct(String a, String v, String key, boolean on, String q) {
        if (cm.pop && v != null && (v.startsWith("tp.ap.") || v.startsWith("tp.h.") || v.startsWith("tp.m."))) {          // 시각 팝업: 칸은 화면(grp)이 바로 켰다 — 엔진 글(오전 7:30)만 잠깐 가만히 있으면 다시 받는다
            cm.act(store, a, v, key, on, q);
            deb.trailing("tpl", 160L, new Runnable() { @Override public void run() { if (cm.pop && "tp".equals(cm.sub) && sheet != null && sheet.isShowing()) loadSetPage(); } });
            return;
        }
        int r = cm.act(store, a, v, key, on, q);
        if ((r & CmCore.R_CLOSE) != 0) { closeSheet(); loadSlot(slots.length - 1, true); return; }
        if ((r & CmCore.R_RESCHED) != 0) { CommuteAlarm.rescheduleAsync(this); gwSync(false); }
        if ((r & CmCore.R_TEST) != 0) { testBrief(); return; }
        if (cmFromInline && cm.sub.length() == 0) { cmFromInline = false; cm.pop = false; closeSheet(); cmReload(); return; }          // 시각 고르기를 마쳤다 — 시트를 닫고 설정 화면의 패널을 새로
        if ((r & CmCore.R_BUS) != 0) { cmBusSearch(cm.pkQ); return; }
        if ((r & CmCore.R_RENDER) != 0) loadSetPage();
    }
    // ── s278: 출퇴근 브리핑을 설정 화면 안에서(하위 화면 없이) — 장소는 그 자리 입력칸, 시각 고르기만 시트 ──
    private boolean cmFromInline;
    private int seqCmI, seqCmApplied;
    /** 설정 화면에서 눌린 것이 출퇴근 패널의 것인가(스위치 cm · 요일 · 미리보기 · 시각 · 장소 저장/후보). */
    private static boolean cmInlineOwns(ScreenCore.Act a) {
        if (a == null) return false;
        if ("set".equals(a.a)) return "cm".equals(a.key);
        return "call".equals(a.a) && a.v != null && (a.v.startsWith("cm.") || a.v.startsWith("pk."));
    }
    private void cmInlineAct(String a, String v, String key, boolean on, String q) {
        int r = cm.act(store, a, v, key, on, q);
        if ((r & CmCore.R_RESCHED) != 0) { CommuteAlarm.rescheduleAsync(this); gwSync(false); }
        if ((r & CmCore.R_TEST) != 0) { testBrief(); return; }
        if ("tp".equals(cm.sub)) { cm.pop = true; openSetPage("cm"); cmFromInline = true; return; }
        if ((r & CmCore.R_BUS) != 0) { cmBusSearch(cm.pkQ); return; }
        if ((r & CmCore.R_RENDER) != 0) cmReload();
    }
    /** 장소 입력칸의 글자 이벤트: focus(어느 칸인지) · edit(친 글자 — 잠깐 가만히 있으면 후보 갱신) · blur(저장 안 한 글자는 버린다; 후보 줄을 누르는 동안은 잠깐 기다린다). */
    private void cmText(final String k, final String value, String kind) {
        if ("focus".equals(kind)) { cm.focusInline(k, value); return; }
        if ("edit".equals(kind)) {
            final String q = value;
            deb.trailing("cmq", 40L, new Runnable() { @Override public void run() {          // 글자가 멈추면(0.04초) 지하철역 후보부터 바로 그린다
                int r = cm.onInline(k, q);
                if ((r & CmCore.R_RENDER) != 0) cmReload();
                if ((r & CmCore.R_BUS) != 0) cmBusSearch(cm.pkQ);                      // 버스정류장은 찾아 오는 대로 한 번 더
            } });
            return;
        }
        if ("blur".equals(kind)) {
            final String typed = value;
            main.postDelayed(new Runnable() { @Override public void run() {          // 후보 줄을 누른 게 아니면(그러면 이미 저장돼 inl 이 꺼져 있다) 친 글자를 그대로 자동 저장
                int r = cm.blurInline(store, k, typed);
                if ((r & CmCore.R_RESCHED) != 0) { CommuteAlarm.rescheduleAsync(ShellActivity.this); gwSync(false); }
                if ((r & CmCore.R_RENDER) != 0) cmReload();
            } }, 350L);
        }
    }
    /** 설정 화면을 지금 기기 사실(출퇴근 패널 포함)로 다시 받아 위치·입력은 그대로 두고 갱신한다. */
    private void cmReload() {
        final int li = slots.length - 1;
        if (li < 0 || !ShellCore.S_SETTINGS.equals(slots[li])) return;
        final ScreenView v = viewOfSlot(li);
        viewKey.put(v, ShellCore.cacheKey(ShellCore.S_SETTINGS, store));
        final int my = ++seqCmI;
        new Thread(new Runnable() { @Override public void run() {
            final String txt = fetchGeneric(ShellCore.S_SETTINGS); warm(txt);
            main.post(new Runnable() { @Override public void run() {
                if (my <= seqCmApplied || txt.length() == 0 || li != slots.length - 1 || !ShellCore.S_SETTINGS.equals(slots[li])) return;          // s285 (YJ: 역 후보가 너무 느려): 먼저 보낸 요청의 답도 더 새 답이 아직 안 왔으면 바로 그린다(예전엔 최신 요청이 아니면 버려, 버스 후보가 끼면 두 번 왕복을 기다렸다) — 더 새 답이 이미 그려졌으면 늦은 옛 답만 버린다
                seqCmApplied = my;
                present(v, txt, true);
            } });
        } }, "shell-cmi").start();
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
                NetPost.Res rb = suggestGet("b", q.trim(), HomeSearchCore.busUrl(HomeSearchCore.BUS_BASE, q.trim()));
                final List<Map<String, Object>> raw = rb.status == 200 ? HomeSearchCore.parseBus(rb.body) : new java.util.ArrayList<Map<String, Object>>();
                main.post(new Runnable() { @Override public void run() {
                    boolean inlOk = cm.inl && slots.length > 0 && ShellCore.S_SETTINGS.equals(slots[slots.length - 1]);
                    if (my != cmBusSeq || (!inlOk && (!"cm".equals(setPage) || !cm.picking() || sheet == null || !sheet.isShowing()))) return;
                    List<String> names = new java.util.ArrayList<String>(); List<double[]> geo = new java.util.ArrayList<double[]>();
                    for (Map<String, Object> m : raw) {
                        Object nm = m.get("nodenm") != null ? m.get("nodenm") : m.get("nodeNm");
                        double la = HomeSearchCore.pf(m.get("gpslati")), lo = HomeSearchCore.pf(m.get("gpslong"));
                        if (nm instanceof String && ((String) nm).length() > 0 && la != 0 && lo != 0) { names.add((String) nm); geo.add(new double[] { la, lo }); }
                    }
                    cm.setBus(names, geo);
                    if (inlOk) cmReload(); else loadSetPage();
                } });
            }
        }, "shell-cmbus").start();
    }
    /** '지금 미리보기': 출근/퇴근 중 어느 브리핑인지와 글은 엔진이 정해(kind:auto) 알림으로 한 번 띄운다. */
    private void testBrief() {
        toast("브리핑을 만드는 중이에요");
        final android.content.Context app = getApplicationContext();
        final String kind = "auto";                               // 출근/퇴근 어느 쪽인지는 엔진이 시각으로 정한다
        new Thread(new Runnable() { @Override public void run() { CommuteAlarm.send(app, kind); } }, "shell-cmtest").start();
    }
    private void setPageAct(String a, String v, String key, boolean on) {
        if ("cm".equals(setPage)) { cmAct(a, v, key, on, null); return; }
        if ("cmb".equals(setPage)) { if ("call".equals(a)) cmbAct(v); return; }
        int r = ShellCore.routePage(store, setPage, a, v, key, on, RideOverlay.allowed(this));
        if (r == ShellCore.PG_CLOSE) {
            if (locOk != null && ShellCore.isPolPage(setPage)) { openSetPage("locd"); return; }          // 안내에서 방침을 보러 갔다 오면 안내로 돌아온다
            closeSheet(); loadSlot(slots.length - 1, true); return;
        }
        if (r == ShellCore.PG_LOCOK) { closeSheet(); Runnable ok = locOk; locOk = null; locNo = null; if (ok != null) ok.run(); return; }
        if (r == ShellCore.PG_LOCNO) { closeSheet(); Runnable no = locNo; locOk = null; locNo = null; if (no != null) no.run(); return; }
        if (r == ShellCore.PG_ASKOK || r == ShellCore.PG_ASKNO) { String pg = setPage; closeSheet(); askDone(pg, r == ShellCore.PG_ASKOK); return; }
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


    // ───────────── 처음 설치 승인을 한 가지씩 차례로(웹과 같은 순서 · 하나가 끝나야 다음이 나온다) ─────────────
    // ① 알림 권한(기기 창) → ② 위치 정보 이용 안내(동의) → 위치 권한(기기 창) → ③ 배터리 최적화 안내(갤럭시는 자동 절전 제외까지 한 창) → ④ 다른 앱 위에 표시 안내.
    // 안내 글은 엔진(askbat · asksam · askovl), 여기는 차례와 기기 창 열기만 한다. 각 안내는 평생 한 번(저장소 열쇠) · 위치 안내를 거부하면 이번 실행엔 더 묻지 않는다.
    private static final int REQ_SETUP_NOTIF = 76;
    private int setupPhase;                                          // 0 없음 · 1 삼성 절전 목록에서 돌아오길 기다림(→ 기기 허용 창) · 2 기기 창/설정 화면에서 돌아오길 기다림
    private boolean setupDeclined;
    private final Runnable setupRun = new Runnable() { @Override public void run() { setupNext(); } };
    private void setupSoon() { main.removeCallbacks(setupRun); main.postDelayed(setupRun, 600L); }
    private void setupResume() {
        if (setupPhase == 1) {
            setupPhase = 2;
            main.postDelayed(new Runnable() { @Override public void run() { PowerInfo.requestIgnore(ShellActivity.this); } }, 350L);   // 삼성 목록에서 돌아오면 기기 허용 창
        } else if (setupPhase == 2) { setupPhase = 0; setupSoon(); }
        else setupSoon();
    }
    private boolean setupNoEngine;
    /** 서버 엔진이 이 안내를 아직 모른다 — '이미 물었다' 표시를 지워, 엔진이 알게 되면 그때 보여 준다. */
    private void askUnburn(String page) {
        if ("askbat".equals(page)) store.put(ShellCore.K_BATASK, "0");
        else if ("asksam".equals(page)) store.put(ShellCore.K_SAMASK, "0");
        else if ("askovl".equals(page)) store.put(ShellCore.K_OVLASK, "0");
    }
    private void setupNext() {
        if (!resumed || setupDeclined || setupNoEngine || setupPhase != 0 || (sheet != null && sheet.isShowing())) return;
        if (!"2".equals(store.get(ShellCore.K_SETUPV, ""))) { store.put(ShellCore.K_SETUPV, "2"); store.put(ShellCore.K_BATASK, "0"); store.put(ShellCore.K_SAMASK, "0"); store.put(ShellCore.K_OVLASK, "0"); }          // 안내가 엔진에 없어 건너뛰며 '물었다'로 굳은 기기를 한 번 되돌린다
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED && !"1".equals(store.get(ShellCore.K_NOTIFASK, "0"))) {
            store.put(ShellCore.K_NOTIFASK, "1");
            requestPermissions(new String[] { android.Manifest.permission.POST_NOTIFICATIONS }, REQ_SETUP_NOTIF);
            return;
        }
        if (!hasLocPerm() && !"1".equals(store.get(ShellCore.K_GPSASK, "0"))) {
            store.put(ShellCore.K_GPSASK, "1");
            locGate(new Runnable() { @Override public void run() { requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_LOC); } },
                new Runnable() { @Override public void run() { setupDeclined = true; toast("위치 정보 이용에 동의하지 않아 내 위치를 쓸 수 없어요"); } });
            return;
        }
        if (!"1".equals(store.get(ShellCore.K_LOCDISC, "0"))) return;                // 위치 안내에 동의한 뒤에만 이어서 묻는다
        PowerInfo pi = PowerInfo.read(this);
        boolean sam = PowerInfo.isSamsung();
        if (Build.VERSION.SDK_INT >= 23 && !"1".equals(store.get(ShellCore.K_BATASK, "0")) && !pi.ig) {
            store.put(ShellCore.K_BATASK, "1");
            if (sam) store.put(ShellCore.K_SAMASK, "1");                              // 갤럭시는 배터리 안내와 절전 제외 안내를 한 창이 맡는다
            openSetPage("askbat");
            return;
        }
        if (sam && !"1".equals(store.get(ShellCore.K_SAMASK, "0")) && !pi.ig) {      // 배터리 안내를 예전에 봤고 절전 안내만 아직인 갤럭시
            store.put(ShellCore.K_SAMASK, "1");
            openSetPage("asksam");
            return;
        }
        boolean batSettled = Build.VERSION.SDK_INT < 23 || "1".equals(store.get(ShellCore.K_BATASK, "0")) || pi.ig;
        if (batSettled && RideOverlay.supported() && !RideOverlay.allowed(this) && !"1".equals(store.get(ShellCore.K_OVLASK, "0"))) {
            store.put(ShellCore.K_OVLASK, "1");
            openSetPage("askovl");
        }
    }
    /** 안내 창의 [나중에] · [설정하기]: 나중에 = 바로 다음 승인으로, 설정하기 = 기기 창을 열고 돌아오면 다음 승인으로. */
    private void askDone(String page, boolean go) {
        if (!go) { setupSoon(); return; }
        if ("askbat".equals(page)) {
            if (PowerInfo.isSamsung()) { setupPhase = 1; PowerInfo.openSamsung(this); }       // 갤럭시: 먼저 절전 목록(이때는 아직 '최적화'라 길동무가 보인다) → 돌아오면 기기 허용 창
            else { setupPhase = 2; PowerInfo.requestIgnore(this); }
            return;
        }
        if ("asksam".equals(page)) { setupPhase = 2; PowerInfo.openSamsung(this); return; }
        if ("askovl".equals(page)) {
            store.put(ShellCore.K_OVL, "1");                                              // 켜기로 고른 것 — 허용하고 돌아오면 바로 뜬다
            setupPhase = 2;
            try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); }
            catch (Throwable t) { setupPhase = 0; toast("설정에서 '다른 앱 위에 표시'를 허용해 주세요"); }
        }
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
        final String favA = home.hasRoute() ? home.resA : home.text[HomeCore.START], favB = home.hasRoute() ? home.resB : home.text[HomeCore.DEST];
        final HomeCore.Loc favLa = home.loc[HomeCore.START], favLb = home.loc[HomeCore.DEST];                  // 같은 이름 역이 수도권·지방에 있으면 어느 쪽인지 노선으로 알린다(고르는 건 엔진)
        final String json = fav.request(ShellCore.CAP, ShellCore.theme(store), favA, favB,
            favLa != null && "subway".equals(favLa.type) && favLa.name.equals(favA) ? favLa.line : "", favLb != null && "subway".equals(favLb.type) && favLb.name.equals(favB) ? favLb.line : "");
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
                if (rideLocked()) break;
                home.setStation(HomeCore.START, g.sName, g.sLine, g.sLa, g.sLo);
                home.setStation(HomeCore.DEST, g.dName, g.dLine, g.dLa, g.dLo);
                home.clearRoute(); chatRouteSync();
                store.put(ShellCore.K_TAB, "home"); showTab("home");
                setHomeFields();
                goRoute();
                break;
            }
            default: break;
        }
    }
    private int seqRoute = 0, rideSeq = -1;
    /** sk: 이 결과를 SWR 보관함에 남길 열쇠(null 이면 남기지 않는다 — 근사 결과). 읽을 수 있는 결과만 남긴다. */
    private void postRoute(final int my, final String raw, final String a, final String b, final long bt, final long rb, final String sk, final boolean replace) {
        main.post(new Runnable() { @Override public void run() {
            if (my != seqRoute) return;
            rloadHideSoon();                                                                   // 결과가 화면에 그려지는 순간에 로딩 카드를 닫는다(받자마자 닫으면 그려지기 전 빈 화면이 몇 초 보인다)
            if (my == rideSeq && home.riding()) return;                                       // 이 찾기의 결과를 보고 이미 경로를 확정했다 — 뒤늦게 온 다른 결과(근사 → 전체)가 확정을 풀지 않게 한다
            if (replace && home.hasRoute()) {                                                  // 같은 찾기의 새 응답: 화면을 새로 시작하지 않고 바뀐 칸만 스프링으로 나타낸다
                if (home.replaceRouteSame(raw, rb)) { if (sk != null) routeSwr.put(sk, rb + "\n" + raw, System.currentTimeMillis()); body.springChanges(5000L); reloadHome(); } else toast("경로 응답을 읽지 못했어요");
                return;
            }
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
