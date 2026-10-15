// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 위젯 코드가 쓰는 시그니처만 흉내 낸다.
package android.os;
public class Handler { public Handler(Looper l) {} public boolean post(Runnable r) { return true; } public boolean postDelayed(Runnable r, long d) { return true; } public void removeCallbacks(Runnable r) {} }
