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
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Toast;

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
    private static final String PREFS = "gdm_shell";

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
    private int seqHome = 0, seqCand = 0;
    private volatile String lastRouteRaw = "";            // 가장 최근에 받은 경로 응답(결과 화면은 엔진 이식 뒤에 올린다)

    /** SharedPreferences 를 ShellCore.Store 로 감싼다. */
    private static final class PrefStore implements ShellCore.Store {
        private final SharedPreferences sp;
        PrefStore(SharedPreferences sp) { this.sp = sp; }
        @Override public String get(String k, String d) { try { return sp.getString(k, d); } catch (Throwable t) { return d; } }
        @Override public void put(String k, String v) { try { sp.edit().putString(k, v).apply(); } catch (Throwable ignored) { } }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        store = new PrefStore(getSharedPreferences(PREFS, Context.MODE_PRIVATE));
        dpr = getResources().getDisplayMetrics().density;
        ScreenView.preloadFaces(this);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        head = new ScreenView(this);
        head.setDpr(dpr);
        head.setListener(new Host(0));
        root.addView(head, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(44f * dpr)));
        FrameLayout holder = new FrameLayout(this);                 // 본문 칸의 검색 입력칸이 붙을 부모
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
        showTab(ShellCore.currentTab(store));
    }

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

    // ───────────── 화면 받기 ─────────────
    private void showTab(String tab) {
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
        new Thread(new Runnable() {
            @Override public void run() {
                String[] urls = ShellCore.feedUrls(screen), feeds = new String[urls.length];
                for (int k = 0; k < urls.length; k++) {
                    NetPost.Res fr = NetPost.get(urls[k], 8000);
                    feeds[k] = fr.status == 200 ? fr.body : "";
                }
                if (ShellCore.S_NEWS.equals(screen)) lastNews = ShellCore.NewsRows.from(feeds);
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
        } catch (Exception e) {
            toast("화면이 올바르지 않아요: " + String.valueOf(e.getMessage()));
        }
    }

    private void toast(String m) { try { Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); } catch (Throwable ignored) { } }

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
            else if (ShellCore.S_HOME.equals(screenName())) {
                if ("call".equals(a.a)) homeAct(a.v, body.fields());
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
            default: break;
        }
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

    /** 홈 화면: 입력 상태를 엔진에 보내고 받은 화면을 올린다. */
    private void loadHome(final ScreenView v, final boolean keep) {
        final int my = ++seqHome;
        final String json = home.request(homeEnv(), ShellCore.CAP);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/home", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqHome) return;
                    present(v, txt, keep);
                    if (txt.length() > 0) home.onScreen(txt);
                } });
            }
        }, "shell-home").start();
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
            requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_LOC);
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
                        reloadHome();
                    }
                }, c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), false).show();
            }
        }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show();
    }

    /** 경로 탐색: 좌표가 있는 두 장소로 경로 서버에 묻는다. 결과 화면은 엔진 이식(result) 뒤에 올린다. */
    private void goRoute() {
        final String qs = HomeCore.routeQuery(home.loc[HomeCore.START], home.loc[HomeCore.DEST],
            home.baseMs >= 0 ? home.baseMs : System.currentTimeMillis(), home.baseMs >= 0);
        if (qs == null) { toast("출발지와 도착지를 목록에서 골라 주세요"); return; }
        toast("경로를 찾는 중이에요");
        final String url = HomeCore.routeUrl(qs);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.get(RouteFetchCore.liveZero(url), 15000);
                final boolean ok = r.status == 200 && r.body != null && r.body.length() > 2;
                final String raw = ok ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    lastRouteRaw = raw;
                    toast(ok ? "경로를 받았어요" : "경로를 받지 못했어요");
                } });
            }
        }, "shell-route").start();
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
