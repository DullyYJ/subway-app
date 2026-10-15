// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.content;
public abstract class Context { public static final int MODE_PRIVATE = 0; public static final String ALARM_SERVICE = "alarm", POWER_SERVICE = "power";
  public abstract Context getApplicationContext(); public abstract SharedPreferences getSharedPreferences(String n, int m); public abstract Object getSystemService(String n);
  public abstract android.content.res.Resources getResources(); public abstract String getPackageName(); public abstract android.content.pm.PackageManager getPackageManager(); public abstract android.content.res.AssetManager getAssets();
  public abstract Intent registerReceiver(BroadcastReceiver r, IntentFilter f); }
