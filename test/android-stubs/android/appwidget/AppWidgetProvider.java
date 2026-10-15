// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.appwidget;
import android.content.Context; import android.os.Bundle; import android.content.BroadcastReceiver; import android.content.Intent;
public class AppWidgetProvider extends BroadcastReceiver { public void onReceive(Context c, Intent i) {}
  public void onUpdate(Context c, AppWidgetManager m, int[] ids) {} public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {}
  public void onDeleted(Context c, int[] ids) {} public void onEnabled(Context c) {} public void onDisabled(Context c) {} }
