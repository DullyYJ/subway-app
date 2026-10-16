package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
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

/**
 * 경로 카드 맨 아래 줄(세부경로 · 확정 · 탑승/환승/도착) 전환 연출 플러그인 — 2026-10-16.
 *   원칙: 계산은 엔진이, 그림은 앱이. 어떤 칸이 되는지·전환 종류·시간·곡선은 엔진(/ride-eta op:'row')이 정하고, 앱(JS)은 받은 값과 웹 버튼의 겉모양을 넘기기만 한다.
 *   이 플러그인은 웹 줄(이미 최종 모양) 위에 RowOverlayView 를 잠깐 얹어 vsync 마다 그린 뒤 치운다. 실패하면 error 로 알리고 앱은 웹 연출로 돌아간다.
 *   play({x,y,w,h,dpr,gap,kind,ms,ease:[4],bg,items:{a,b,c,o:{t,bg,fg,bd,fs,br,b}}}) · cancel() · status()
 */
@CapacitorPlugin(name = "RowNative")
public class RowNativePlugin extends Plugin {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private RowOverlayView view;
    private ViewGroup root;

    @PluginMethod
    public void play(final PluginCall call) {
        ui.post(new Runnable() {
            @Override public void run() {
                try {
                    Activity act = getActivity();
                    root = (ViewGroup) act.findViewById(android.R.id.content);
                    if (root == null) { call.reject("루트 뷰가 없다"); return; }
                    float w = f(call, "w"), h = f(call, "h");
                    if (!(w > 8f && h > 8f)) { call.reject("사각형 크기가 없다"); return; }
                    float dpr = call.getFloat("dpr", 0f) > 0f ? call.getFloat("dpr", 1f) : getContext().getResources().getDisplayMetrics().density;
                    if (view == null) { view = new RowOverlayView(getContext()); root.addView(view, new FrameLayout.LayoutParams(1, 1)); }
                    int offX = 0, offY = 0;
                    try {
                        View wv = getBridge().getWebView(); int[] a = new int[2], b = new int[2];
                        wv.getLocationInWindow(a); root.getLocationInWindow(b); offX = a[0] - b[0]; offY = a[1] - b[1];
                    } catch (Throwable t) { /* 못 구하면 0 */ }
                    FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr)));
                    lp.leftMargin = offX + Math.round(f(call, "x") * dpr); lp.topMargin = offY + Math.round(f(call, "y") * dpr);
                    view.setLayoutParams(lp);
                    JSObject items = null; try { items = call.getObject("items"); } catch (Throwable t) { items = null; }
                    String[] ids = { "a", "b", "c", "o" };
                    for (int i = 0; i < 4; i++) {
                        org.json.JSONObject s = (items != null) ? items.optJSONObject(ids[i]) : null;
                        if (s == null) continue;
                        view.setSpec(i, s.optString("t", ""), RowCore.color(s.optString("bg", ""), 0xff2f7cf6), RowCore.color(s.optString("fg", ""), 0xffffffff),
                                RowCore.color(s.optString("bd", ""), 0), (float) s.optDouble("fs", 13), (float) s.optDouble("br", 12), s.optBoolean("b", true));
                    }
                    float[] ez = { 0.2f, 0f, 0f, 1f };
                    try { org.json.JSONArray ea = call.getData().getJSONArray("ease"); for (int i = 0; i < 4 && i < ea.length(); i++) ez[i] = (float) ea.getDouble(i); } catch (Throwable t) { /* 기본 곡선 */ }
                    view.bringToFront();
                    view.start(call.getData().optString("kind", "none"), call.getData().optLong("ms", 400L), ez, w, h, f(call, "gap"), dpr, RowCore.color(call.getData().optString("bg", ""), 0),
                            new RowOverlayView.Done() { @Override public void onDone() { try { notifyListeners("done", new JSObject()); } catch (Throwable t) { /* 무시 */ } } });
                    call.resolve(new JSObject().put("ok", true));
                } catch (Throwable t) {
                    call.reject(String.valueOf(t));
                }
            }
        });
    }

    @PluginMethod
    public void cancel(final PluginCall call) {
        ui.post(new Runnable() { @Override public void run() { if (view != null) view.stopNow(); call.resolve(); } });
    }

    @PluginMethod
    public void status(final PluginCall call) {
        call.resolve(new JSObject().put("ok", true).put("running", view != null && view.isRunning()));
    }

    @Override
    protected void handleOnDestroy() {
        try { if (root != null && view != null) root.removeView(view); } catch (Throwable t) { /* 이미 빠짐 */ }
        view = null;
    }

    private static float f(PluginCall c, String k) { Float v = c.getFloat(k); return v == null ? 0f : v; }
}
