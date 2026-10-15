// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.graphics;
public class Canvas { public Canvas(Bitmap b) {} public void drawColor(int c, PorterDuff.Mode m) {} public void setMatrix(Matrix m) {} public void scale(float x, float y) {} public int save() { return 0; } public void restore() {}
  public void translate(float x, float y) {} public void rotate(float d) {} public void drawBitmap(Bitmap b, Rect s, RectF d, Paint p) {} public void drawOval(RectF r, Paint p) {} public void drawCircle(float x, float y, float r, Paint p) {} public void drawPath(Path p, Paint pt) {} }
