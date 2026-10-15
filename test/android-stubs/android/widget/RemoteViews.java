// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.widget;
import android.graphics.Bitmap; import android.app.PendingIntent;
public class RemoteViews { public RemoteViews(String pkg, int layout) {} public void setViewVisibility(int id, int v) {} public void setTextViewText(int id, CharSequence t) {} public void setTextViewTextSize(int id, int unit, float s) {}
  public void setViewPadding(int id, int l, int t, int r, int b) {} public void setImageViewBitmap(int id, Bitmap b) {} public void setOnClickPendingIntent(int id, PendingIntent p) {} }
