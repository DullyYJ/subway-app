package com.dullyyj.subway;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 위젯의 손길·알람·재부팅. 출퇴근 시각 알람(ACTION_TICK) → 장면을 열고, 위젯을 탭하면(ACTION_POKE) 잠깐 움직인다. */
public class GdmWidgetReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent it) {
        String a = it == null ? null : it.getAction();
        if (a == null) return;
        if (WidgetCore.ACTION_POKE.equals(a)) { WidgetCore.evalScene(c); WidgetCore.refreshAll(c, true); WidgetCore.wake(c, "poke"); return; }
        // 알람(출퇴근 시각 · 장면 끝) · 재부팅 · 시간/시간대 바뀜 · 앱 업데이트
        WidgetCore.evalScene(c);
        WidgetCore.refreshAll(c, true);
        WidgetCore.scheduleNext(c);
        WidgetCore.wake(c, "alarm");
    }
}
