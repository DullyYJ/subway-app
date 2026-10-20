package com.dullyyj.subway;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 앱 ↔ 캐릭터 시계 위젯.
 *  · setConfig({json}) — 앱의 출퇴근 설정(시각·요일·알림 켬·출발지 좌표)을 위젯에 넘긴다. 위젯이 알람을 걸고 장면을 정한다.
 *  · takeLaunch() — 위젯 [출근하기]/[퇴근하기] 로 앱이 열렸으면 {go:'morn'|'eve'}, 위젯 본체를 눌러 열렸으면 {tab:'community'} (한 번만). 경로 탐색은 앱이 엔진에 묻는다.
 *  · state() — 깔린 위젯 수 · 지금 장면.   requestPin({type:'hb'|'hw'|'vb'|'vw'}) — 홈 화면에 추가 요청.
 */
@CapacitorPlugin(name = "GdmWidget")
public class GdmWidgetPlugin extends Plugin {
    @PluginMethod public void setConfig(PluginCall call) {
        String json = call.getString("json", "{}");
        WidgetCore.setConfigJson(getContext(), json);
        call.resolve();
    }
    @PluginMethod public void takeLaunch(PluginCall call) {
        JSObject o = new JSObject(); o.put("go", WidgetCore.takeLaunch(getContext())); o.put("tab", WidgetCore.takeTab()); call.resolve(o);
    }
    @PluginMethod public void state(PluginCall call) {
        JSObject o = new JSObject(); Context c = getContext();
        o.put("count", WidgetCore.ids(c).length);
        WidgetCore.Scene s = WidgetCore.scene(c); o.put("scene", s.kind); o.put("say", s.say1); o.put("fetched", s.fetched);
        call.resolve(o);
    }
    @PluginMethod public void requestPin(PluginCall call) {
        String t = call.getString("type", "hb");
        Class<?> k = "hw".equals(t) ? GdmWidgetHW.class : "vb".equals(t) ? GdmWidgetVB.class : "vw".equals(t) ? GdmWidgetVW.class : GdmWidgetHB.class;
        JSObject o = new JSObject(); boolean ok = false;
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                AppWidgetManager m = AppWidgetManager.getInstance(getContext());
                if (m.isRequestPinAppWidgetSupported()) ok = m.requestPinAppWidget(new ComponentName(getContext(), k), null, null);
            }
        } catch (Exception ignored) { }
        o.put("ok", ok); call.resolve(o);
    }
}
