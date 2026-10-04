// Reactions at a moment of a track: friends' emoji and words float up over the cover when the music
// reaches the second they were left at, and sit as little marks along the seek bar.
package space.avthsr.music.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.api.Api
import space.avthsr.music.api.Reaction
import space.avthsr.music.api.react
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.res.*
import space.avthsr.music.tr
import kotlin.random.Random

val REACTION_EMOJI = listOf("🔥", "❤️", "😍", "🤘", "😂", "😮", "😢", "👏", "💃", "🎧")

private class Floating(val id: Long, val r: Reaction, val x: Float)

/** Friends' reactions rising over the cover at their moment; [spawn] shows one at once (the listener's own). */
@Composable
fun ReactionBubbles(list: List<Reaction>, spawn: Flow<Reaction>, modifier: Modifier = Modifier) {
  val live = remember { mutableStateListOf<Floating>() }
  var seq by remember { mutableStateOf(0L) }
  fun show(r: Reaction) {
    if (live.size > 12) live.removeAt(0)
    live.add(Floating(seq++, r, Random.nextFloat() * 0.6f + 0.2f))
  }
  LaunchedEffect(list) {
    var prev = PlayerConn.position()
    while (true) {
      delay(150)
      val p = PlayerConn.position()
      // only while playing on: a jump (seek) shows nothing
      if (p > prev && p - prev < 2000) list.filter { it.atMs in (prev + 1)..p }.forEach { show(it) }
      prev = p
    }
  }
  LaunchedEffect(spawn) { spawn.collect { show(it) } }
  BoxWithConstraints(modifier) {
    val h = maxHeight
    val w = maxWidth
    live.toList().forEach { f ->
      key(f.id) {
        val t = remember { Animatable(0f) }
        LaunchedEffect(Unit) {
          t.animateTo(1f, tween(3600, easing = FastOutSlowInEasing))
          live.remove(f)
        }
        Column(
          Modifier
            .offset(x = w * f.x - 40.dp, y = h * 0.72f)
            .graphicsLayer {
              val p = t.value
              translationY = -h.toPx() * 0.55f * p
              translationX = kotlin.math.sin(p * 6f + f.x * 10f) * 10.dp.toPx()
              alpha = when { p < 0.08f -> p / 0.08f; p > 0.7f -> (1f - p) / 0.3f; else -> 1f }
              val pop = if (p < 0.12f) 0.6f + 0.4f * (p / 0.12f) * 1.15f else 1f + 0.05f * (1f - p)
              scaleX = pop; scaleY = pop
            }
            .widthIn(max = 160.dp),
          horizontalAlignment = Alignment.CenterHorizontally,
        ) {
          if (f.r.emoji.isNotBlank()) Text(f.r.emoji, fontSize = 44.sp)
          ReactionChip(f.r)
        }
      }
    }
  }
}

@Composable
private fun ReactionChip(r: Reaction) {
  val cs = MaterialTheme.colorScheme
  Row(
    Modifier.clip(CircleShape).background(cs.surfaceContainerHighest.copy(alpha = 0.92f)).padding(start = 3.dp, end = 10.dp, top = 3.dp, bottom = 3.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Cover(r.user?.avatarUrl, Modifier.size(20.dp), CircleShape, Res.drawable.ic_person)
    Spacer(Modifier.width(5.dp))
    Text(
      listOfNotNull(r.user?.displayName, r.text.takeIf { it.isNotBlank() }).joinToString(": "),
      style = MaterialTheme.typography.labelMedium, color = cs.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis,
    )
  }
}

/** The reactions' marks along the seek bar: a tiny emoji at each moment (close ones share one). */
@Composable
fun ReactionMarks(list: List<Reaction>, durationMs: Long, modifier: Modifier = Modifier) {
  if (list.isEmpty() || durationMs <= 0) return
  BoxWithConstraints(modifier.fillMaxWidth().height(16.dp).padding(horizontal = 10.dp)) {
    val w = maxWidth
    list.groupBy { (it.atMs * 60 / durationMs).toInt() }.forEach { (_, group) ->
      val r = group.first()
      val frac = (r.atMs.toFloat() / durationMs).coerceIn(0f, 1f)
      Text(
        r.emoji.ifBlank { "💬" }, fontSize = 11.sp,
        modifier = Modifier.offset(x = w * frac - 7.dp).clickable { PlayerConn.seek((r.atMs - 1500).coerceAtLeast(0)) },
      )
    }
  }
}

/** Leave a reaction at this second of the track: an emoji, a word, or both. */
@Composable
fun ReactDialog(trackId: String, atMs: Long, onPosted: (Reaction) -> Unit, onDone: () -> Unit) {
  var emoji by remember { mutableStateOf("🔥") }
  var text by remember { mutableStateOf("") }
  val cs = MaterialTheme.colorScheme
  AlertDialog(
    onDismissRequest = onDone,
    title = { Text(tr("Реакция на {}", fmtTime(atMs))) },
    text = {
      Column {
        Text(tr("Друзья увидят её на этой секунде трека"), style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
          REACTION_EMOJI.forEach { e ->
            val on = e == emoji
            Box(
              Modifier.size(48.dp).clip(if (on) LogoShape else CircleShape).background(if (on) cs.primaryContainer else cs.surfaceContainerHigh).clickable { emoji = if (on) "" else e },
              contentAlignment = Alignment.Center,
            ) { Text(e, fontSize = 24.sp) }
          }
        }
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(text, { text = it.take(200) }, label = { Text(tr("Комментарий к моменту")) }, modifier = Modifier.fillMaxWidth(), maxLines = 2)
      }
    },
    confirmButton = {
      TextButton(enabled = emoji.isNotBlank() || text.isNotBlank(), onClick = {
        val e = emoji
        val t = text
        onDone()
        App.scope.launch {
          runCatching { Api.react(trackId, atMs, e, t) }
            .onSuccess(onPosted)
            .onFailure { App.say(it.message ?: tr("Не получилось")) }
        }
      }) { Text(tr("Оставить")) }
    },
    dismissButton = { TextButton(onClick = onDone) { Text(tr("Отмена")) } },
  )
}
