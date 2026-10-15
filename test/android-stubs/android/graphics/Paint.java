// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.graphics;
public class Paint { public static final int ANTI_ALIAS_FLAG = 1, FILTER_BITMAP_FLAG = 2; public enum Style { FILL, STROKE } public Paint(int f) {} public void setTypeface(Typeface t) {} public void setTextSize(float s) {}
  public FontMetrics getFontMetrics() { return null; } public void getTextBounds(String t, int a, int b, Rect r) {} public float measureText(String t) { return 0f; } public float measureText(String t, int a, int b) { return 0f; } public void setStyle(Style s) {} public void setAlpha(int a) {} public void setColor(int c) {} public Shader setShader(Shader sh) { return sh; }
  public static class FontMetrics { public float ascent, descent; } }
