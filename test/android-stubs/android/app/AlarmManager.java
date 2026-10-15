// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.app;
public class AlarmManager { public static final int RTC_WAKEUP = 0;
  public void set(int t, long at, PendingIntent p) {} public void setAndAllowWhileIdle(int t, long at, PendingIntent p) {} public void setExactAndAllowWhileIdle(int t, long at, PendingIntent p) {}
  public void cancel(PendingIntent p) {} public boolean canScheduleExactAlarms() { return true; } }
