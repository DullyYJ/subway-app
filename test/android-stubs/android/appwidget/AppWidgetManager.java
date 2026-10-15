// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.appwidget;
import android.content.ComponentName; import android.content.Context; import android.os.Bundle; import android.widget.RemoteViews;
public class AppWidgetManager { public static final String OPTION_APPWIDGET_MIN_WIDTH = "appWidgetMinWidth", OPTION_APPWIDGET_MAX_WIDTH = "appWidgetMaxWidth", OPTION_APPWIDGET_MIN_HEIGHT = "appWidgetMinHeight", OPTION_APPWIDGET_MAX_HEIGHT = "appWidgetMaxHeight";
  public static AppWidgetManager getInstance(Context c) { return null; } public int[] getAppWidgetIds(ComponentName n) { return null; } public AppWidgetProviderInfo getAppWidgetInfo(int id) { return null; }
  public Bundle getAppWidgetOptions(int id) { return null; } public void updateAppWidget(int id, RemoteViews v) {} public void partiallyUpdateAppWidget(int id, RemoteViews v) {}
  public boolean isRequestPinAppWidgetSupported() { return false; } public boolean requestPinAppWidget(ComponentName n, Bundle extras, android.app.PendingIntent cb) { return false; } }
