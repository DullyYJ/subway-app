// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.graphics;
public class Rect { public int left, top, right, bottom; public Rect() {} public void set(int l, int t, int r, int b) {} public int width() { return 0; } }
