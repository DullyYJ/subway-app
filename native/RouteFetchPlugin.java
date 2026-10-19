package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 경로 요청 플러그인 — 2026-10-19 (5번 3단계: 경로 탐색 요청·결과 상태를 웹뷰 밖으로).
 *
 *   예전: 웹(JS)이 경로 서버(/route-v2-app)에 직접 fetch 하고 응답을 변수에 쥐고 있었다. 앱이 가려지면 웹뷰 JS 가 느려져 응답 처리가 늦었고, 결과는 웹뷰 안에만 있었다.
 *   지금: 이 플러그인이 같은 주소에 직접 요청하고(HttpURLConnection) 가장 최근 결과를 자바에 보관한다. 웹은 받은 응답을 예전과 똑같이 그린다.
 *   ★ 판단은 하지 않는다 — 어떤 응답을 그릴지·전체를 뒤따라 받을지·언제 다시 조회할지는 엔진이 응답 맨 앞에 실어 보내는 `follow` 가 정한다(RouteFetchCore 참고).
 *
 *   request({id, url[, timeoutMs]}) → 첫 응답이 준비되면 resolve:  {id, stage:'first', ok, raw?, why?, legacy?, forced?, stale?, log:[…], bytes}
 *        뒤따라 받을 전체 응답이 있으면 이벤트 route({id, stage:'full', ok, raw?, why?, log, bytes}) 로 알린다. 새 request 가 오면 이전 것은 버려진다(stale).
 *   once({id, url[, timeoutMs]})    → 재조회 한 건: {id, stage:'retry', ok, raw?, why?, legacy?, log, bytes}
 *   last() → {ok, id, url, stage, at, n, raw} 가장 최근에 받은 '경로 있는 응답'(없으면 {ok:false}) · cancel() · status() → {ok, gen, has}
 *   주소는 https 이고 /route-v2-app 경로인 것만 받는다(그 밖은 reject).
 */
@CapacitorPlugin(name = "RouteFetch")
public class RouteFetchPlugin extends Plugin {
    private static final int CONNECT_MS = 8000;

    private final Object lock = new Object();
    private volatile int gen = 0;
    private volatile boolean dead = false;
    private final RouteFetchCore.State state = new RouteFetchCore.State();
    private final ExecutorService pool = Executors.newFixedThreadPool(3, new ThreadFactory() {
        @Override public Thread newThread(Runnable r) { Thread t = new Thread(r, "gdm-routefetch"); t.setDaemon(true); return t; }
    });

    @PluginMethod
    public void request(final PluginCall call) {
        final String id = String.valueOf(call.getString("id", ""));
        final String url = call.getString("url", "");
        final int timeout = RouteFetchCore.clampTimeout(call.getInt("timeoutMs", RouteFetchCore.DEFAULT_TIMEOUT_MS));
        if (!RouteFetchCore.isRouteUrl(url)) { call.reject("경로 주소가 아님"); return; }
        final int my;
        synchronized (lock) { my = ++gen; }
        final AtomicBoolean resolved = new AtomicBoolean(false);
        try {
            pool.execute(new Runnable() {
                @Override public void run() {
                    try {
                        RouteFetchCore.run(id, url, timeout, new RouteFetchCore.Env() {
                            @Override public RouteFetchCore.Res get(String u, int ms) { return http(u, ms); }
                            @Override public long now() { return System.currentTimeMillis(); }
                            @Override public boolean stale() { return dead || gen != my; }
                            @Override public void emit(Map<String, Object> ev) {
                                if ("first".equals(ev.get("stage"))) { if (resolved.compareAndSet(false, true)) resolveWith(call, ev); }
                                else notifyRoute(ev);
                            }
                        }, state);
                    } catch (Throwable t) {
                        // 어떤 경우든 호출은 끝나야 한다(웹이 영영 기다리지 않게)
                        if (resolved.compareAndSet(false, true)) call.resolve(failObj(id, "first", String.valueOf(t.getMessage())));
                    }
                }
            });
        } catch (Throwable t) {
            if (resolved.compareAndSet(false, true)) call.resolve(failObj(id, "first", "실행 못 함"));
        }
    }

    @PluginMethod
    public void once(final PluginCall call) {
        final String id = String.valueOf(call.getString("id", ""));
        final String url = call.getString("url", "");
        final int timeout = RouteFetchCore.clampTimeout(call.getInt("timeoutMs", RouteFetchCore.DEFAULT_TIMEOUT_MS));
        if (!RouteFetchCore.isRouteUrl(url)) { call.reject("경로 주소가 아님"); return; }
        try {
            pool.execute(new Runnable() {
                @Override public void run() {
                    try {
                        Map<String, Object> m = RouteFetchCore.once(id, url, timeout, new RouteFetchCore.Env() {
                            @Override public RouteFetchCore.Res get(String u, int ms) { return http(u, ms); }
                            @Override public long now() { return System.currentTimeMillis(); }
                            @Override public boolean stale() { return dead; }
                            @Override public void emit(Map<String, Object> ev) { }
                        }, state);
                        resolveWith(call, m);
                    } catch (Throwable t) {
                        call.resolve(failObj(id, "retry", String.valueOf(t.getMessage())));
                    }
                }
            });
        } catch (Throwable t) {
            call.resolve(failObj(id, "retry", "실행 못 함"));
        }
    }

    @PluginMethod
    public void last(PluginCall call) {
        JSObject r = new JSObject();
        if (!state.has()) { call.resolve(r.put("ok", false)); return; }
        r.put("ok", true).put("id", state.id()).put("url", state.url()).put("stage", state.stage()).put("at", (double) state.at()).put("n", state.n()).put("raw", state.raw());
        call.resolve(r);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        int g;
        synchronized (lock) { g = ++gen; }
        call.resolve(new JSObject().put("ok", true).put("gen", g));
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(new JSObject().put("ok", true).put("gen", gen).put("has", state.has()));
    }

    // ── 웹으로 알리기 ──
    private static JSObject failObj(String id, String stage, String why) {
        JSObject o = new JSObject();
        o.put("id", id); o.put("stage", stage); o.put("ok", false); o.put("why", why == null ? "" : (why.length() > 80 ? why.substring(0, 80) : why));
        return o;
    }

    private static void resolveWith(PluginCall call, Map<String, Object> ev) {
        try { call.resolve(new JSObject(HomeSearchCore.toJson(ev))); }
        catch (Throwable t) { call.resolve(failObj(String.valueOf(ev.get("id")), String.valueOf(ev.get("stage")), "결과를 웹으로 보내지 못함")); }
    }

    private void notifyRoute(Map<String, Object> ev) {
        try { notifyListeners("route", new JSObject(HomeSearchCore.toJson(ev))); } catch (Throwable ignored) { }
    }

    // ── 통신 ──
    private static RouteFetchCore.Res http(String u, int timeoutMs) {
        long t0 = System.currentTimeMillis();
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(u).openConnection();
            c.setConnectTimeout(Math.min(timeoutMs, CONNECT_MS));
            c.setReadTimeout(timeoutMs);
            c.setRequestMethod("GET");
            c.setRequestProperty("Accept", "application/json");
            int code = c.getResponseCode();
            if (code != 200) return RouteFetchCore.Res.bad("HTTP " + code, System.currentTimeMillis() - t0);
            InputStream is = c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n, total = 0;
            while ((n = is.read(buf)) > 0) {
                bo.write(buf, 0, n); total += n;
                if (total > RouteFetchCore.MAX_BODY) return RouteFetchCore.Res.bad("응답이 너무 큼", System.currentTimeMillis() - t0);
                if (System.currentTimeMillis() - t0 > timeoutMs) return RouteFetchCore.Res.bad("timeout", System.currentTimeMillis() - t0);
            }
            is.close();
            return RouteFetchCore.Res.good(bo.toString("UTF-8"), System.currentTimeMillis() - t0);
        } catch (SocketTimeoutException e) {
            return RouteFetchCore.Res.bad("timeout", System.currentTimeMillis() - t0);
        } catch (Throwable e) {
            return RouteFetchCore.Res.bad(String.valueOf(e.getMessage()), System.currentTimeMillis() - t0);
        } finally {
            if (c != null) c.disconnect();
        }
    }

    @Override
    protected void handleOnDestroy() {
        try { dead = true; synchronized (lock) { gen++; } pool.shutdownNow(); } catch (Throwable ignored) { }
        super.handleOnDestroy();
    }
}
