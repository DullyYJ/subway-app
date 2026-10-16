package androidx.compose.ui.graphics.drawscope

import androidx.compose.ui.graphics.Canvas

interface DrawScope
fun DrawScope.drawIntoCanvas(block: (Canvas) -> Unit) {}
