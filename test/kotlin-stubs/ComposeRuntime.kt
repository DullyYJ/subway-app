// 컴파일 점검용 Jetpack Compose 스텁(실제 라이브러리가 아님) — SceneCompose.kt 가 쓰는 시그니처만 흉내 낸다. 진짜 컴파일은 CI 의 gradle 단계가 한다.
package androidx.compose.runtime

import kotlin.reflect.KProperty
import kotlinx.coroutines.CoroutineScope

@Target(AnnotationTarget.FUNCTION, AnnotationTarget.TYPE, AnnotationTarget.TYPE_PARAMETER, AnnotationTarget.PROPERTY_GETTER)
annotation class Composable

interface State<T> { val value: T }
interface MutableState<T> : State<T> { override var value: T }
interface MutableLongState : State<Long> { override var value: Long }
operator fun <T> State<T>.getValue(thisObj: Any?, property: KProperty<*>): T = value
operator fun <T> MutableState<T>.setValue(thisObj: Any?, property: KProperty<*>, value: T) { this.value = value }
operator fun MutableLongState.setValue(thisObj: Any?, property: KProperty<*>, value: Long) { this.value = value }
fun mutableLongStateOf(value: Long): MutableLongState = object : MutableLongState { override var value: Long = value }
@Composable fun <T> remember(calculation: () -> T): T = calculation()
@Composable fun LaunchedEffect(key1: Any?, block: suspend CoroutineScope.() -> Unit) {}
suspend fun <R> withFrameNanos(onFrame: (Long) -> R): R = onFrame(0L)
