// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 코드가 쓰는 시그니처만 흉내 낸다.
package com.getcapacitor;
public class Plugin { public android.content.Context getContext() { return null; } public android.app.Activity getActivity() { return null; } public Bridge getBridge() { return null; }
  protected void notifyListeners(String event, JSObject data) {} protected void handleOnDestroy() {} }
