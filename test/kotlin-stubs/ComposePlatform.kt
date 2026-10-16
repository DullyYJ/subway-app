package androidx.compose.ui.platform

import android.content.Context
import android.view.ViewGroup
import androidx.compose.runtime.Composable

open class AbstractComposeView(context: Context) : ViewGroup(context) {
    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {}
    fun disposeComposition() {}
}
class ComposeView(context: Context) : AbstractComposeView(context) {
    fun setContent(content: @Composable () -> Unit) {}
}
