// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.graphics;
public class BitmapFactory { public static class Options { public int inSampleSize; public Bitmap.Config inPreferredConfig; } public static Bitmap decodeStream(java.io.InputStream in, Rect pad, Options o) { return null; } }
