package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Map;
import java.util.TreeMap;

/**
 * 저장값 보관 플러그인 — 2026-10-19 (5번 4단계: 저장값·설정을 앱 본체에도).
 *
 *   예전: 설정 스위치·즐겨찾기 같은 저장값은 웹뷰 localStorage 에만 있었다 → 웹뷰 저장소가 지워지면 사라지고, 자바(서비스·오버레이·새 네이티브 화면)는 읽지 못했다.
 *   지금: 같은 값을 앱 본체(SharedPreferences 'gdm_store')에도 한 벌 보관한다. 어떤 키를 보관할지·웹과 어느 쪽을 따를지는 엔진(engine/store-sync.js)이 정한다.
 *   ★ 이 플러그인은 판단하지 않는다 — 받은 것을 구조 검사(StoreCore: 키 모양·길이·개수 한도)만 하고 저장한다. 키 이름 목록이 없다.
 *
 *   snapshot()                 → {ok, n, json}   보관 중인 전부 — json 은 {"키":"글자",…} 글자
 *   apply({json})              → {ok, set, del, rejected, n}   json = {"set":{키:글자},"del":[키…]} — 지우기 먼저, 그다음 쓰기. 한도 밖·이상한 것은 거절하고 나머지는 처리
 *   get({key})                 → {ok, has, value?}
 *   clear()                    → {ok}
 *   status()                   → {ok, n, bytes}
 *   (자바 쪽 다른 기능은 StorePlugin.read(context, key) 로 바로 읽는다)
 *   어떤 경우에도 호출은 resolve 로 끝난다(웹이 영영 기다리지 않게).
 */
@CapacitorPlugin(name = "Store")
public class StorePlugin extends Plugin {
    static final String PREFS = "gdm_store", PK = "kv";

    private final Object lock = new Object();
    private Map<String, String> mem = new TreeMap<String, String>();

    @Override
    public void load() {
        try {
            Context c = getContext();
            if (c != null) synchronized (lock) { mem = StoreCore.decode(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PK, "")); }
        } catch (Throwable ignored) { }
    }

    @PluginMethod
    public void snapshot(PluginCall call) {
        try {
            String j; int n;
            synchronized (lock) { j = StoreCore.encode(mem); n = mem.size(); }
            call.resolve(new JSObject().put("ok", true).put("n", n).put("json", j));
        } catch (Throwable t) {
            call.resolve(fail("snapshot"));
        }
    }

    @PluginMethod
    public void apply(PluginCall call) {
        try {
            String json = call.getString("json", "");
            synchronized (lock) {
                StoreCore.Result r = StoreCore.applyJson(mem, json);
                if (r == null) { call.resolve(fail("bad json")); return; }
                mem = r.state;
                save();
                call.resolve(new JSObject().put("ok", true).put("set", r.set).put("del", r.del).put("rejected", r.rejected).put("n", mem.size()));
            }
        } catch (Throwable t) {
            call.resolve(fail("apply"));
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        try {
            String k = call.getString("key", "");
            String v;
            synchronized (lock) { v = mem.get(k); }
            JSObject o = new JSObject().put("ok", true).put("has", v != null);
            if (v != null) o.put("value", v);
            call.resolve(o);
        } catch (Throwable t) {
            call.resolve(fail("get"));
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            synchronized (lock) { mem = new TreeMap<String, String>(); save(); }
            call.resolve(new JSObject().put("ok", true));
        } catch (Throwable t) {
            call.resolve(fail("clear"));
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        try {
            int n, b = 0;
            synchronized (lock) { n = mem.size(); for (String v : mem.values()) b += v.length(); }
            call.resolve(new JSObject().put("ok", true).put("n", n).put("bytes", b));
        } catch (Throwable t) {
            call.resolve(fail("status"));
        }
    }

    private void save() {
        try {
            Context c = getContext();
            if (c == null) return;
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PK, StoreCore.encode(mem)).apply();
        } catch (Throwable ignored) { }
    }

    private static JSObject fail(String why) {
        return new JSObject().put("ok", false).put("why", why);
    }

    /** 자바 쪽 다른 기능(서비스·오버레이 등)이 보관된 값을 바로 읽는다. 없거나 못 읽으면 def. */
    public static String read(Context c, String key, String def) {
        try {
            if (c == null) return def;
            String v = StoreCore.decode(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PK, "")).get(key);
            return v == null ? def : v;
        } catch (Throwable t) {
            return def;
        }
    }
}
