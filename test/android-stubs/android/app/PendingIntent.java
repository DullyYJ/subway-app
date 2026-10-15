// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.app;
import android.content.Context; import android.content.Intent;
public class PendingIntent { public static final int FLAG_UPDATE_CURRENT = 0x8000000, FLAG_IMMUTABLE = 0x4000000;
  public static PendingIntent getBroadcast(Context c, int rc, Intent i, int f) { return null; } public static PendingIntent getActivity(Context c, int rc, Intent i, int f) { return null; } }
