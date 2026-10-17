package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import java.util.HashMap;
import java.util.Map;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 홈 경로 화면 가로 타임라인 네이티브 플러그인 — 2026-10-17 네이티브 이전 P1 (YJ: "앱 자체를 웹뷰에서 네이티브로, 화면 단위 점진 이전 — 첫 화면은 홈 경로 화면").
 *
 * 역할 분담(원칙: 계산은 엔진이, 그림은 앱이)
 *   · 엔진·웹: 경로·시각·마커 위치(어느 칸 사이 몇 %)·승차 대기 여부를 정한다. 바뀌지 않았다.
 *   · 웹(JS): 이미 그린 DOM 에서 칸 목록과 자리(x·폭)를 읽어 이 플러그인에 그대로 넘기고, 타임라인 칸의 사각형·스크롤·마커 이동만 알려 준다.
 *   · 이 플러그인 + HtlView + HtlCore: 받은 값을 그대로 그린다. 손가락은 받지 않는다(웹뷰가 스크롤).
 *   · 안전장치: 실패하면 error 이벤트를 보내고, 웹은 곧바로 예전 DOM 타임라인으로 돌아간다. 설정에서 끌 수도 있다(기본 꺼짐).
 *
 *   영역(id): "tl"=가로 타임라인(기본) · "hd"=경로 카드 머리줄(글자 덩어리). 모든 호출에 id 를 줄 수 있고(없으면 tl) 영역마다 뷰가 따로다.
 *   show({id,x,y,w,h,dpr,clip:{l,t,r,b},theme:{bg,fg,sub},cells:[…],runs:[{t,x,y,w,h,s,c,b}],tw,sx}) · setRect · update({cells,tw,theme}) · scroll({sx}) ·
 *   marker({on,x,y,ms,snap,wait,badge}) (x 가 없으면 wait·badge 만 바꾼다) · hide() · destroy() · status() → {visible,cells,age}
 */
@CapacitorPlugin(name = "HtlNative")
public class HtlNativePlugin extends Plugin {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Map<String, HtlView> views = new HashMap<String, HtlView>();
    private final Map<String, Boolean> shownMap = new HashMap<String, Boolean>();
    private final Map<String, Float> dprMap = new HashMap<String, Float>();
    private ViewGroup root;

    private interface Job { void run() throws Exception; }
    private void runUi(final PluginCall call, final Job job) {
        ui.post(new Runnable() {
            @Override public void run() {
                try { job.run(); }
                catch (Throwable t) {
                    try { call.reject(String.valueOf(t.getMessage())); } catch (Throwable ignored) { }
                    try { notifyListeners("error", new JSObject().put("message", String.valueOf(t))); } catch (Throwable ignored) { }
                }
            }
        });
    }
    private static float f(PluginCall c, String k) { Float v = c.getFloat(k); return v == null ? 0f : v; }
    private static boolean has(PluginCall c, String k) { try { return c.getData() != null && c.getData().has(k); } catch (Throwable t) { return false; } }
    private static String idOf(PluginCall c) { String s = c.getString("id", "tl"); return (s == null || s.length() == 0) ? "tl" : s; }
    private float dprOf(String id) { Float d = dprMap.get(id); return d == null ? 1f : d; }
    private boolean isShown(String id) { Boolean b = shownMap.get(id); return b != null && b; }

    @PluginMethod
    public void show(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                final String id = idOf(call);
                float w = f(call, "w"), h = f(call, "h");
                if (!(w > 8f && h > 8f)) { call.reject("사각형 크기가 없다"); return; }
                Activity act = getActivity();
                root = (ViewGroup) act.findViewById(android.R.id.content);
                if (root == null) { call.reject("루트 뷰가 없다"); return; }
                float d = call.getFloat("dpr", 0f) > 0f ? call.getFloat("dpr", 1f) : getContext().getResources().getDisplayMetrics().density;
                dprMap.put(id, d);
                HtlView view = views.get(id);
                if (view == null) {
                    view = new HtlView(getContext());
                    view.setFirstDraw(new Runnable() { @Override public void run() { try { notifyListeners("ready", new JSObject().put("id", id)); } catch (Throwable ignored) { } } });
                    root.addView(view, new FrameLayout.LayoutParams(1, 1));
                    views.put(id, view);
                }
                view.setDpr(d);
                applyTheme(view, call);
                applyContent(view, call);
                if (has(call, "sx")) view.setScroll(f(call, "sx"));
                place(view, id, call);
                view.bringToFront();
                view.setVisibility(View.VISIBLE);
                shownMap.put(id, true);
                call.resolve(new JSObject().put("cells", view.cellCount()));
            }
        });
    }

    @PluginMethod
    public void setRect(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                String id = idOf(call); HtlView view = views.get(id);
                if (view == null) { call.resolve(); return; }
                if (!(f(call, "w") > 8f && f(call, "h") > 8f)) { call.resolve(); return; }
                if (call.getFloat("dpr", 0f) > 0f) { float d = call.getFloat("dpr", 1f); dprMap.put(id, d); view.setDpr(d); }
                place(view, id, call);
                call.resolve();
            }
        });
    }

    /** 칸 목록·글자 덩어리·테마·트랙 폭을 바꾼다(보이는 상태는 그대로). */
    @PluginMethod
    public void update(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                HtlView view = views.get(idOf(call));
                if (view == null) { call.resolve(); return; }
                applyTheme(view, call);
                applyContent(view, call);
                if (has(call, "sx")) view.setScroll(f(call, "sx"));
                call.resolve(new JSObject().put("cells", view.cellCount()));
            }
        });
    }

    @PluginMethod
    public void scroll(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception { HtlView v = views.get(idOf(call)); if (v != null) v.setScroll(f(call, "sx")); call.resolve(); }
        });
    }

    @PluginMethod
    public void marker(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                HtlView view = views.get(idOf(call));
                if (view != null) {
                    boolean on = call.getBoolean("on", false);
                    if (on && !has(call, "x")) view.setMarkerFlags(call.getBoolean("wait", false), call.getString("badge", ""));      // 위치 없이 깜박임·뱃지만
                    else view.setMarker(on, f(call, "x"), f(call, "y"), (long) f(call, "ms"), call.getBoolean("snap", false),
                            call.getBoolean("wait", false), call.getString("badge", ""));
                }
                call.resolve();
            }
        });
    }

    /** id 가 있으면 그 영역만, 없으면 모든 영역을 숨긴다. */
    @PluginMethod
    public void hide(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception { if (has(call, "id")) hideOne(idOf(call)); else for (String k : new java.util.ArrayList<String>(views.keySet())) hideOne(k); call.resolve(); }
        });
    }

    private void hideOne(String id) {
        HtlView v = views.get(id);
        if (v != null) v.setVisibility(View.GONE);
        shownMap.put(id, false);
    }

    @PluginMethod
    public void destroy(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                java.util.List<String> ids = new java.util.ArrayList<String>();
                if (has(call, "id")) ids.add(idOf(call)); else ids.addAll(views.keySet());
                for (String k : ids) {
                    hideOne(k);
                    try { HtlView v = views.get(k); if (root != null && v != null) root.removeView(v); } catch (Throwable ignored) { }
                    views.remove(k);
                }
                call.resolve();
            }
        });
    }

    /** 웹이 '지금 켜져 있다'고 믿는 상태와 실제가 맞는지 확인하는 용도. */
    @PluginMethod
    public void status(final PluginCall call) {
        runUi(call, new Job() {
            @Override public void run() throws Exception {
                String id = idOf(call); HtlView view = views.get(id);
                JSObject o = new JSObject();
                o.put("visible", view != null && view.getVisibility() == View.VISIBLE && isShown(id));
                o.put("cells", view == null ? 0 : view.cellCount());
                o.put("age", view == null ? -1 : (int) Math.min(Integer.MAX_VALUE, view.drawAgeMs()));
                call.resolve(o);
            }
        });
    }

    // ───────────── 받은 값 적용 ─────────────
    private void applyTheme(HtlView view, PluginCall call) {
        JSObject t = null;
        try { t = call.getObject("theme"); } catch (Throwable e) { t = null; }
        if (t == null) return;
        view.setTheme(HtlCore.color(t.optString("bg", ""), 0xFFFFFFFF), HtlCore.color(t.optString("fg", ""), 0xFF111114), HtlCore.color(t.optString("sub", ""), 0xFF8E8E93));
    }

    private void applyContent(HtlView view, PluginCall call) throws Exception {
        if (has(call, "runs")) {                                     // 글자 덩어리 영역
            JSONArray ra = call.getData().optJSONArray("runs");
            if (ra != null) {
                HtlCore.Run[] rs = new HtlCore.Run[ra.length()];
                for (int i = 0; i < rs.length; i++) {
                    JSONObject o = ra.optJSONObject(i);
                    HtlCore.Run r = new HtlCore.Run();
                    if (o != null) {
                        r.t = o.optString("t", ""); r.x = (float) o.optDouble("x", 0); r.y = (float) o.optDouble("y", 0);
                        r.w = (float) o.optDouble("w", 0); r.h = (float) o.optDouble("h", 0); r.size = (float) o.optDouble("s", 12);
                        r.color = HtlCore.color(o.optString("c", ""), 0xFF111114); r.bold = o.optBoolean("b", false);
                        if ("r".equals(o.optString("k", ""))) {                     // 상자(배경·테두리)
                            r.box = true; r.r = (float) o.optDouble("r", 0); r.fill = HtlCore.color(o.optString("f", ""), 0); r.stroke = HtlCore.color(o.optString("sc", ""), 0); r.sw = (float) o.optDouble("sw", 0);
                        }
                    }
                    rs[i] = r;
                }
                view.setRuns(rs);
            }
            return;
        }
        if (!has(call, "cells")) return;
        JSONArray arr = call.getData().optJSONArray("cells");
        if (arr == null) return;
        HtlCore.Cell[] cs = new HtlCore.Cell[arr.length()];
        for (int i = 0; i < cs.length; i++) {
            JSONObject o = arr.optJSONObject(i);
            HtlCore.Cell c = new HtlCore.Cell();
            if (o != null) {
                c.n = o.optString("n", ""); c.t = o.optString("t", ""); c.g = o.optString("g", "");
                c.pill = o.optBoolean("gp", false);
                c.gc = HtlCore.color(o.optString("gc", ""), 0xFF8E8E93); c.gf = (float) o.optDouble("gf", 7.5);
                c.nc = HtlCore.color(o.optString("nc", ""), 0xFF111114); c.nf = (float) o.optDouble("nf", 10); c.nb = o.optBoolean("nb", true);
                c.tc = HtlCore.color(o.optString("tc", ""), 0xFF8E8E93); c.tf = (float) o.optDouble("tf", 9); c.tb = o.optBoolean("tb", true);
                c.lc = HtlCore.color(o.optString("lc", ""), 0xFF8E8E93); c.rc = HtlCore.color(o.optString("rc", ""), 0xFF8E8E93);
                c.hasL = o.optString("lc", "").length() > 0; c.hasR = o.optString("rc", "").length() > 0;
                c.dc = HtlCore.color(o.optString("dc", ""), 0xFF0A84FF); c.dk = o.optInt("dk", 0);
                c.x = (float) o.optDouble("x", 0); c.w = (float) o.optDouble("w", 64);
            }
            cs[i] = c;
        }
        view.setCells(cs, f(call, "tw"));
    }

    /** 틀의 자리·크기·잘림. 좌표는 CSS px(웹뷰 기준). */
    private void place(HtlView view, String id, PluginCall call) {
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
    }
}
