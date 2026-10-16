// 컴파일 점검용 스텁 — 진짜 SceneCompose 는 native/SceneCompose.kt (kotlinc 가 있으면 그걸 컴파일한다).
package com.dullyyj.subway;
public final class SceneCompose {
    public static androidx.compose.ui.platform.ComposeView create(android.content.Context c) { return new androidx.compose.ui.platform.ComposeView(c); }
    public static void show(androidx.compose.ui.platform.ComposeView v, SceneDriver d) {}
    public static void hide(androidx.compose.ui.platform.ComposeView v) {}
}
