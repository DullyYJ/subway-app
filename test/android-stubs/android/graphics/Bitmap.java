// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.graphics;
public class Bitmap { public enum Config { ARGB_8888 } public static Bitmap createBitmap(int w, int h, Config c) { return null; } public static Bitmap createScaledBitmap(Bitmap b, int w, int h, boolean f) { return null; }
  public int getWidth() { return 0; } public void recycle() {} }
