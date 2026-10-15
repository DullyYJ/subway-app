// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.content;
public class Intent implements android.os.Parcelable { public static final String ACTION_SCREEN_ON = "a", ACTION_SCREEN_OFF = "b", ACTION_USER_PRESENT = "c"; public static final int FLAG_ACTIVITY_NEW_TASK = 1, FLAG_ACTIVITY_CLEAR_TOP = 2, FLAG_ACTIVITY_SINGLE_TOP = 4, FLAG_GRANT_READ_URI_PERMISSION = 1; public static final String ACTION_SEND = "send", EXTRA_STREAM = "s", EXTRA_TEXT = "t", EXTRA_SUBJECT = "u", EXTRA_INITIAL_INTENTS = "i";
  public Intent() {} public Intent(Context c, Class<?> k) {} public Intent setAction(String a) { return this; } public String getAction() { return null; } public Intent putExtra(String k, String v) { return this; } public Intent putExtra(String k, int v) { return this; }
  public boolean hasExtra(String k) { return false; } public String getStringExtra(String k) { return null; } public void removeExtra(String k) {} public Intent setFlags(int f) { return this; } public Intent addFlags(int f) { return this; }
  public Intent(String action) {} public Intent(Intent o) {} public Intent setType(String t) { return this; } public Intent setPackage(String p) { return this; } public Intent putExtra(String k, android.os.Parcelable v) { return this; }
  public Intent setClipData(ClipData d) { return this; } public Intent putExtra(String k, android.os.Parcelable[] v) { return this; }
  public static Intent createChooser(Intent i, CharSequence t) { return i; } }
