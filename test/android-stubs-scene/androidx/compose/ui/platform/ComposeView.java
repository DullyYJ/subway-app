// 컴파일 점검용 스텁(실제 Compose 가 아님) — kotlinc 가 없는 환경에서 SceneNativePlugin.java 만 컴파일해 볼 때 쓴다.
package androidx.compose.ui.platform;
public class ComposeView extends android.view.ViewGroup {
    public ComposeView(android.content.Context c) { super(c); }
    @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {}
    public void disposeComposition() {}
}
