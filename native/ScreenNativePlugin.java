package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 서버 구동 네이티브 화면 플러그인 — 2026-10-18 (YJ: "최종목표는 웹뷰를 100% 네이티브로 — 엔진이 화면 구성까지 내려주는 방식").
 *
 * 역할 분담(원칙: 계산은 엔진이, 그림은 앱이)
 *   · 엔진: 무엇을 어떤 순서로 보일지 정해 화면 JSON 으로 내려 준다(GET /screen/shop).
 *   · 웹(JS): JSON 을 받아(또는 저장해 둔 마지막 정상본을 꺼내) 그대로 이 플러그인에 넘긴다. 눌린 행동(action)만 받아 처리한다.
 *   · 이 플러그인: JSON 을 검증(ScreenCore.load)한다. 모양이 틀리면 그리지 않고 reject + error 이벤트 → 웹이 저장본/예전 웹 화면으로 폴백한다.
 *   · ScreenView: 검증된 화면을 그린다 — 자체 세로/가로 스크롤(관성), 눌림 처리.
 *
 *   show({id,x,y,w,h,dpr,clip,json,palette,keepScroll}) · update({id,json,palette,keepScroll}) · setRect({id,x,y,w,h,dpr,clip}) · setField({id,key,value}) · hide({id}) · destroy({id}) · status({id}) → {visible,items,age,scroll}
 *   이벤트: ready({id}) 첫 그림 · error({id,message,kind}) · action({id,a,v,url[,empty]}) · input({id,on}) 검색 입력칸 포커스
 *   검색줄(search 노드): 기기의 진짜 입력칸(EditText)을 검색줄 자리에 올린다. 검색 실행 → action {a:'search', v:검색어, url:엔진의 tpl, empty:엔진의 empty}.
 *   palette: { bg, card, card2, nav, border, border2, text, sub, gold, orange, imgbg } CSS 색 문자열 — 앱 테마(다크/파스텔)를 웹이 읽어 넘긴다.
 */
@CapacitorPlugin(name = "ScreenNative")
public class ScreenNativePlugin extends Plugin {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Map<String, ScreenView> views = new HashMap<String, ScreenView>();
    private final Map<String, Boolean> shownMap = new HashMap<String, Boolean>();
    private final Map<String, Float> dprMap = new HashMap<String, Float>();
    private ViewGroup root;

    // 글꼴(Noto Sans KR)은 앱이 뜰 때 뒤에서 미리 읽어 둔다 — 첫 화면에서 글꼴 읽느라 멈추지 않게.
    @Override
    public void load() {
        final android.content.Context c = getContext();
        if (c == null) return;
        new Thread(new Runnable() { @Override public void run() { try { ScreenView.preloadFaces(c); } catch (Throwable ignored) { } } }, "scr-font").start();
    }

    private interface Job { void run() throws Exception; }
    private void runUi(final PluginCall call, final Job job) {
        ui.post(new Runnable() {
            @Override public void run() {
                try { job.run(); }
                catch (Throwable t) {
                    try { call.reject(String.valueOf(t.getMessage())); } catch (Throwable ignored) { }
                    try { notifyListeners("error", new JSObject().put("message", String.valueOf(t)).put("kind", "exception")); } catch (Throwable ignored) { }
                }
            }
        });
    }
    private static float f(PluginCall c, String k) { Float v = c.getFloat(k); return v == null ? 0f : v; }
    private static boolean has(PluginCall c, String k) { try { return c.getData() != null && c.getData().has(k); } catch (Throwable t) { return false; } }
    private static String idOf(PluginCall c) { String s = c.getString("id", "shop"); return (s == null || s.length() == 0) ? "shop" : s; }
    private float dprOf(String id) { Float d = dprMap.get(id); return d == null ? 1f : d; }
    private boolean isShown(String id) { Boolean b = shownMap.get(id); return b != null && b; }

    @PluginMethod
    public void show(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                final String id = idOf(call);
                float w = f(call, "w"), h = f(call, "h");
                if (!(w > 8f && h > 8f)) { call.reject("사각형 크기가 없다"); return; }
                ScreenCore.Screen sc = parse(call, id);
                if (sc == null) return;
                Activity act = getActivity();
                root = (ViewGroup) act.findViewById(android.R.id.content);
                if (root == null) { call.reject("루트 뷰가 없다"); return; }
                float d = call.getFloat("dpr", 0f) > 0f ? call.getFloat("dpr", 1f) : getContext().getResources().getDisplayMetrics().density;
                dprMap.put(id, d);
                ScreenView view = views.get(id);
                if (view == null) {
                    view = new ScreenView(getContext());
                    view.setListener(listenerFor(id));
                    root.addView(view, new FrameLayout.LayoutParams(1, 1));
                    views.put(id, view);
                }
                view.setDpr(d);
                applyPalette(view, call);
                place(view, id, call);
                view.setScreen(sc, call.getBoolean("keepScroll", false));
                view.bringToFront();
                view.setVisibility(View.VISIBLE);
                shownMap.put(id, true);
                call.resolve(new JSObject().put("items", view.itemCount()));
            }
        });
    }

    @PluginMethod
    public void update(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                String id = idOf(call);
                ScreenView view = views.get(id);
                if (view == null) { call.resolve(); return; }
                applyPalette(view, call);
                if (has(call, "json")) {
                    ScreenCore.Screen sc = parse(call, id);
                    if (sc == null) return;
                    view.setScreen(sc, call.getBoolean("keepScroll", false));
                }
                call.resolve(new JSObject().put("items", view.itemCount()));
            }
        });
    }

    @PluginMethod
    public void setRect(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                String id = idOf(call); ScreenView view = views.get(id);
                if (view == null) { call.resolve(); return; }
                if (!(f(call, "w") > 8f && f(call, "h") > 8f)) { call.resolve(); return; }
                if (call.getFloat("dpr", 0f) > 0f) { float d = call.getFloat("dpr", 1f); dprMap.put(id, d); view.setDpr(d); }
                place(view, id, call);
                call.resolve();
            }
        });
    }

    /** 입력칸(field·inbar) 글자를 웹이 바꾼다 — 보낸 뒤 비우기 등. setField({id,key,value}) */
    @PluginMethod
    public void setField(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                ScreenView view = views.get(idOf(call));
                String key = call.getString("key", "");
                if (view != null && key != null && key.length() > 0) view.setField(key, call.getString("value", ""));
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void hide(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception { if (has(call, "id")) hideOne(idOf(call)); else for (String k : new ArrayList<String>(views.keySet())) hideOne(k); call.resolve(); }
        });
    }

    private void hideOne(String id) {
        ScreenView v = views.get(id);
        if (v != null) v.setVisibility(View.GONE);
        shownMap.put(id, false);
    }

    @PluginMethod
    public void destroy(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                List<String> ids = new ArrayList<String>();
                if (has(call, "id")) ids.add(idOf(call)); else ids.addAll(views.keySet());
                for (String k : ids) {
                    hideOne(k);
                    try { ScreenView v = views.get(k); if (root != null && v != null) root.removeView(v); } catch (Throwable ignored) { }
                    views.remove(k);
                }
                call.resolve();
            }
        });
    }

    /** 짧은 알림 — 네이티브 화면이 웹뷰를 덮고 있으면 웹의 토스트가 가려지므로 앱이 직접 띄운다. */
    @PluginMethod
    public void toast(final PluginCall call) {
        final String text = call.getString("text", "");
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                if (text != null && text.length() > 0) android.widget.Toast.makeText(getContext(), text, android.widget.Toast.LENGTH_SHORT).show();
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void status(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                String id = idOf(call); ScreenView view = views.get(id);
                JSObject o = new JSObject();
                o.put("visible", view != null && view.getVisibility() == View.VISIBLE && isShown(id));
                o.put("items", view == null ? 0 : view.itemCount());
                o.put("age", view == null ? -1 : (int) Math.min(Integer.MAX_VALUE, view.drawAgeMs()));
                o.put("scroll", view == null ? 0 : Math.round(view.scrollPos()));
                call.resolve(o);
            }
        });
    }

    // ───────────── 받은 값 적용 ─────────────
    /** JSON 을 검증한다. 틀리면 reject + error 이벤트(kind=invalid)를 내고 null. */
    private ScreenCore.Screen parse(PluginCall call, String id) {
        String json = call.getString("json", "");
        try { return ScreenCore.load(json); }
        catch (ScreenCore.ParseError e) {
            try { call.reject("invalid: " + e.getMessage()); } catch (Throwable ignored) { }
            try { notifyListeners("error", new JSObject().put("id", id).put("message", String.valueOf(e.getMessage())).put("kind", "invalid")); } catch (Throwable ignored) { }
            return null;
        }
    }

    private ScreenView.Listener listenerFor(final String id) {
        return new ScreenView.Listener() {
            private JSObject base(ScreenCore.Act a) {
                JSObject o = new JSObject().put("id", id).put("a", a.a).put("v", a.v).put("url", a.url).put("key", a.key);
                try {
                    ScreenView sv = views.get(id);
                    JSObject fo = new JSObject();
                    if (sv != null) for (Map.Entry<String, String> e : sv.fields().entrySet()) fo.put(e.getKey(), e.getValue());
                    o.put("fields", fo);
                } catch (Throwable ignored) { }
                return o;
            }
            @Override public void onAction(ScreenCore.Act a) {
                try { notifyListeners("action", base(a)); } catch (Throwable ignored) { }
            }
            @Override public void onSet(ScreenCore.Act a, boolean on) {
                try { notifyListeners("action", base(a).put("on", on)); } catch (Throwable ignored) { }
            }
            @Override public void onSearch(ScreenCore.Act a, String q) {
                try { notifyListeners("action", new JSObject().put("id", id).put("a", a.a).put("v", q == null ? "" : q).put("url", a.tpl).put("empty", a.empty)); } catch (Throwable ignored) { }
            }
            @Override public void onInputFocus(boolean on) {
                try { notifyListeners("input", new JSObject().put("id", id).put("on", on)); } catch (Throwable ignored) { }
            }
            @Override public void onFirstDraw() {
                try { notifyListeners("ready", new JSObject().put("id", id)); } catch (Throwable ignored) { }
            }
        };
    }

    private void applyPalette(ScreenView view, PluginCall call) {
        JSObject t = null;
        try { t = call.getObject("palette"); } catch (Throwable e) { t = null; }
        if (t == null) return;
        int[] c = new int[12];
        c[ScreenView.R_BG] = ScreenCore.color(t.optString("bg", ""), 0xFF0B0F14);
        c[ScreenView.R_CARD] = ScreenCore.color(t.optString("card", ""), 0xFF1B2129);
        c[ScreenView.R_BORDER] = ScreenCore.color(t.optString("border", ""), 0x33FFFFFF);
        c[ScreenView.R_TEXT] = ScreenCore.color(t.optString("text", ""), 0xFFF2F4F7);
        c[ScreenView.R_SUB] = ScreenCore.color(t.optString("sub", ""), 0xFF9AA4B2);
        c[ScreenView.R_GOLD] = ScreenCore.color(t.optString("gold", ""), 0xFFF0B429);
        c[ScreenView.R_ORANGE] = ScreenCore.color(t.optString("orange", ""), 0xFFF07830);
        c[ScreenView.R_IMGBG] = ScreenCore.color(t.optString("imgbg", ""), 0xFF252528);
        c[ScreenView.R_WHITE] = 0xFFFFFFFF;
        c[ScreenView.R_BORDER2] = ScreenCore.color(t.optString("border2", ""), 0xFF3A3A3C);
        c[ScreenView.R_CARD2] = ScreenCore.color(t.optString("card2", ""), 0xFF2C2C2E);
        c[ScreenView.R_NAV] = ScreenCore.color(t.optString("nav", ""), 0xFF161618);
        view.setPalette(c);
    }

    /** 틀의 자리·크기·잘림. 좌표는 CSS px(웹뷰 기준). */
    private void place(ScreenView view, String id, PluginCall call) {
        float dpr = dprOf(id);
        float x = f(call, "x"), y = f(call, "y"), w = f(call, "w"), h = f(call, "h");
        int offX = 0, offY = 0;
        try {
            View wv = getBridge().getWebView();
            int[] a = new int[2], b = new int[2];
            wv.getLocationInWindow(a); root.getLocationInWindow(b);
            offX = a[0] - b[0]; offY = a[1] - b[1];
        } catch (Throwable t) { /* 못 구하면 0 */ }
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr)));
        lp.leftMargin = offX + Math.round(x * dpr); lp.topMargin = offY + Math.round(y * dpr);
        view.setLayoutParams(lp);
        JSObject c = null;
        try { c = call.getObject("clip"); } catch (Throwable t) { c = null; }
        Rect r = null;
        if (c != null && c.has("l") && c.has("t") && c.has("r") && c.has("b")) {
            r = new Rect(Math.round((float) c.optDouble("l", 0) * dpr), Math.round((float) c.optDouble("t", 0) * dpr),
                    Math.round((float) c.optDouble("r", w) * dpr), Math.round((float) c.optDouble("b", h) * dpr));
            if (r.right <= r.left || r.bottom <= r.top) r.set(0, 0, 1, 1);
        }
        try { view.setClipBounds(r); } catch (Throwable t) { /* 무시 */ }
        try { view.resyncInput(); } catch (Throwable t) { /* 무시 */ }
    }
}
