package androidx.compose.foundation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.DrawScope

@Composable fun Canvas(modifier: Modifier, onDraw: DrawScope.() -> Unit) {}
