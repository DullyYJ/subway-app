package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;

/**
 * 홈 경로 입력 후보 검색 플러그인 — 2026-10-19 (5번 2단계: 데이터 계층을 웹뷰 밖으로).
 *
 *   예전: 웹(JS)이 버스정류장(TAGO)·장소(카카오)를 직접 물어보고(fetch) 결과를 모아 엔진에 넘겼다.
 *   지금: 이 플러그인이 같은 서버에 직접 물어본다 — 글자가 멈춘 뒤 한 번(디바운스) · 최신 검색어 하나만 · 저장본(장소 90일 · 버스 10분) · 실패하면 웹이 예전 방식으로 대신한다.
 *   계산(주소 만들기·응답 읽기·후보 뽑기·이벤트 JSON)은 순수 자바 코어(HomeSearchCore)가 하고, 이 파일은 통신·타이머·저장만 한다.
 *
 *   query({q[, base, delay]}) → {ok, gen}   검색어 q(2글자 이상)를 delay(기본 300ms) 뒤에 버스·장소로 찾는다. 새 query 가 오면 이전 것은 버려진다.
 *   cancel() · status() → {ok, gen, bus, place}
 *   이벤트 cands({q, kind:'b'|'p', ok:true, raw:[…], disp:[…]})  또는  cands({q, kind, ok:false, why}) — 종류마다 따로, 오는 대로.
 *   지하철역 후보는 여기서 하지 않는다(엔진이 /screen/home 에서 직접 거른다).
 */
@CapacitorPlugin(name = "HomeSearch")
public class HomeSearchPlugin extends Plugin {
    private static final String PREFS = "gdm_homesearch", PK_PLACE = "pc";
    private static final int CONNECT_MS = 6000, READ_MS = 8000, DEFAULT_DELAY_MS = 300;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Object lock = new Object();   // gen 올리기·pending 바꾸기는 한 번에 한 쪽만(플러그인 메서드는 웹뷰 다리 스레드에서 불린다)
    private volatile int gen = 0;
    private Runnable pending;
    private final HomeSearchCore.Cache busCache = new HomeSearchCore.Cache(HomeSearchCore.BUS_TTL_MS, HomeSearchCore.BUS_MAX);
    private final HomeSearchCore.Cache placeCache = new HomeSearchCore.Cache(HomeSearchCore.PLACE_TTL_MS, HomeSearchCore.PLACE_MAX);
    private final ExecutorService pool = Executors.newFixedThreadPool(3, new ThreadFactory() {
        @Override public Thread newThread(Runnable r) { Thread t = new Thread(r, "gdm-homesearch"); t.setDaemon(true); return t; }
    });

    @Override
    public void load() {
        try {
            Context c = getContext();
            if (c != null) placeCache.load(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PK_PLACE, ""));
        } catch (Throwable ignored) { }
    }

    @PluginMethod
    public void query(final PluginCall call) {
        final String q = HomeSearchCore.norm(call.getString("q", ""));
        final String base = call.getString("base", "");
        Integer dl = call.getInt("delay", DEFAULT_DELAY_MS);
        int delay = dl == null ? DEFAULT_DELAY_MS : Math.max(0, Math.min(1500, dl));
        final int my;
        synchronized (lock) {
            my = ++gen;
            if (pending != null) { ui.removeCallbacks(pending); pending = null; }
            if (q.length() >= HomeSearchCore.MIN_Q) {
                pending = new Runnable() {
                    @Override public void run() {
                        synchronized (lock) { pending = null; }
                        if (gen != my) return;
                        try {
                            pool.execute(new Runnable() { @Override public void run() { fetch(q, base, my, true); } });
                            pool.execute(new Runnable() { @Override public void run() { fetch(q, base, my, false); } });
                        } catch (Throwable ignored) { }
                    }
                };
                ui.postDelayed(pending, delay);
            }
        }
        JSObject r = new JSObject().put("ok", true).put("gen", my);
        if (q.length() < HomeSearchCore.MIN_Q) r.put("skipped", true);
        call.resolve(r);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        int g;
        synchronized (lock) { g = ++gen; if (pending != null) { ui.removeCallbacks(pending); pending = null; } }
        call.resolve(new JSObject().put("ok", true).put("gen", g));
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(new JSObject().put("ok", true).put("gen", gen).put("bus", busCache.size()).put("place", placeCache.size()));
    }

    /** 한 종류(버스 또는 장소)를 찾아 이벤트로 알린다. 그새 새 검색어가 왔으면(gen 이 바뀜) 조용히 버린다. */
    private void fetch(String q, String base, int my, boolean bus) {
        String kind = bus ? "b" : "p";
        try {
            HomeSearchCore.Cache cache = bus ? busCache : placeCache;
            String key = HomeSearchCore.key(kind, q);
            long now = System.currentTimeMillis();
            String hit = cache.get(key, now);
            List<Map<String, Object>> raw;
            if (hit != null) {
                raw = HomeSearchCore.rawListFrom(hit);
            } else {
                String body = get(bus ? HomeSearchCore.busUrl(base, q) : HomeSearchCore.placeUrl(base, q));
                raw = bus ? HomeSearchCore.parseBus(body) : HomeSearchCore.parsePlaces(body);
                if (!raw.isEmpty()) {                       // 빈 결과를 붙들고 있으면 안 된다(예전 웹 규칙)
                    cache.put(key, HomeSearchCore.rawListJson(raw), now);
                    if (!bus) savePlaceCache();
                }
            }
            if (gen != my) return;
            emit(HomeSearchCore.okEvent(q, kind, raw));
        } catch (Throwable t) {
            if (gen != my) return;
            emit(HomeSearchCore.failEvent(q, kind, String.valueOf(t.getMessage())));
        }
    }

    private void emit(String json) {
        try { notifyListeners("cands", new JSObject(json)); } catch (Throwable ignored) { }
    }

    private void savePlaceCache() {
        try {
            Context c = getContext();
            if (c == null) return;
            SharedPreferences.Editor e = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
            e.putString(PK_PLACE, placeCache.dump());
            e.apply();
        } catch (Throwable ignored) { }
    }

    private static String get(String u) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        try {
            c.setConnectTimeout(CONNECT_MS);
            c.setReadTimeout(READ_MS);
            c.setRequestMethod("GET");
            int code = c.getResponseCode();
            if (code != 200) throw new Exception("HTTP " + code);
            InputStream is = c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n, total = 0;
            while ((n = is.read(buf)) > 0) { bo.write(buf, 0, n); total += n; if (total > 1_000_000) throw new Exception("응답이 너무 큼"); }
            is.close();
            return bo.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    @Override
    protected void handleOnDestroy() {
        try { synchronized (lock) { gen++; if (pending != null) { ui.removeCallbacks(pending); pending = null; } } pool.shutdownNow(); } catch (Throwable ignored) { }
        super.handleOnDestroy();
    }
}
