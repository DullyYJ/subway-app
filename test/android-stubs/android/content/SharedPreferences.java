// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.content;
public interface SharedPreferences { String getString(String k, String d); long getLong(String k, long d); boolean getBoolean(String k, boolean d); Editor edit();
  interface Editor { Editor putString(String k, String v); Editor putLong(String k, long v); Editor putBoolean(String k, boolean v); Editor remove(String k); void apply(); } }
