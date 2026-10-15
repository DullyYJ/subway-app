package com.dullyyj.subway;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** 캐릭터 시계 위젯 4종의 공통 동작. 갱신 주기(updatePeriod)는 0 — 시계는 TextClock 이, 움직임은 화면 켜짐 때만 WidgetCore 가 맡는다. */
public class GdmWidgetBase extends AppWidgetProvider {
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        WidgetCore.evalScene(c);
        WidgetCore.refreshAll(c, true);
        WidgetCore.scheduleNext(c);
        WidgetCore.wake(c, "update");
    }
    @Override public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        WidgetCore.INST.remove(id);              // 크기가 바뀌었으니 자리·그림 판을 다시 만든다
        WidgetCore.refreshAll(c, true);
        WidgetCore.wake(c, "resize");
    }
    @Override public void onEnabled(Context c) { WidgetCore.scheduleNext(c); }
    @Override public void onDisabled(Context c) { WidgetCore.scheduleNext(c); }
    @Override public void onDeleted(Context c, int[] ids) { for (int id : ids) WidgetCore.INST.remove(id); WidgetCore.scheduleNext(c); }
}
