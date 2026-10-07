@file:OptIn(ExperimentalLayoutApi::class)

// Badges the admin makes and gives: they circle around a friend's photo on their page and line up under the
// name; the admin's tab to make them and give them out.
package space.avthsr.music.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import space.avthsr.music.api.Api
import space.avthsr.music.api.Badge
import space.avthsr.music.api.Friends
import space.avthsr.music.api.badgeHolders
import space.avthsr.music.api.badges
import space.avthsr.music.api.deleteBadge
import space.avthsr.music.api.giveBadge
import space.avthsr.music.api.saveBadge
import space.avthsr.music.api.takeBadge
import space.avthsr.music.res.*
import space.avthsr.music.tr
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

fun badgeColor(hex: String): Color = runCatching { Color(("FF" + hex.removePrefix("#")).toLong(16)) }.getOrDefault(Color(0xFFF2A0C4))

/** One badge: its emoji on a disc of its colour. */
@Composable
fun BadgeDot(b: Badge, size: Dp = 36.dp, onClick: (() -> Unit)? = null) {
  val c = badgeColor(b.color)
  Box(
    Modifier.size(size).clip(CircleShape).background(c.copy(alpha = 0.92f)).border(2.dp, MaterialTheme.colorScheme.surface, CircleShape)
      .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
    contentAlignment = Alignment.Center,
  ) { Text(b.emoji, fontSize = (size.value * 0.5f).sp) }
}

/** A photo with the person's badges slowly circling around it (each bobbing a little on its own). */
@Composable
fun BadgeOrbit(badges: List<Badge>, avatar: Dp, content: @Composable () -> Unit) {
  if (badges.isEmpty()) { content(); return }
  var shown by remember { mutableStateOf<Badge?>(null) }
  val t = rememberInfiniteTransition(label = "orbit")
  val turn by t.animateFloat(0f, 360f, infiniteRepeatable(tween(28_000, easing = LinearEasing)), label = "turn")
  val bob by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1800), RepeatMode.Reverse), label = "bob")
  val dot = 38.dp
  val radius = avatar / 2 + 26.dp
  val box = radius * 2 + dot
  Box(Modifier.size(box), contentAlignment = Alignment.Center) {
    content()
    badges.take(8).forEachIndexed { i, b ->
      val a = (turn + i * 360f / badges.size.coerceAtMost(8)) * PI.toFloat() / 180f
      val lift = (if (i % 2 == 0) bob else 1f - bob) * 4f
      Box(Modifier.offset(x = radius * cos(a), y = radius * sin(a) - lift.dp)) { BadgeDot(b, dot) { shown = b } }
    }
  }
  shown?.let { b ->
    AlertDialog(
      onDismissRequest = { shown = null },
      icon = { BadgeDot(b, 56.dp) },
      title = { Text(b.title) },
      text = { if (b.description.isNotBlank()) Text(b.description) },
      confirmButton = { TextButton(onClick = { shown = null }) { Text(tr("Круто")) } },
    )
  }
}

/** The badges as small chips with their names. */
@Composable
fun BadgeChips(badges: List<Badge>) {
  if (badges.isEmpty()) return
  FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(6.dp)) {
    badges.forEach { b ->
      Row(
        Modifier.clip(CircleShape).background(badgeColor(b.color).copy(alpha = 0.22f)).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text(b.emoji, fontSize = 14.sp)
        Spacer(Modifier.width(4.dp))
        Text(b.title, style = MaterialTheme.typography.labelLarge, maxLines = 1)
      }
    }
  }
}

/* ---------- the admin's tab ---------- */

private val COLORS = listOf("#F2A0C4", "#8E7CFF", "#4FC3A1", "#FFB74D", "#64B5F6", "#E57373", "#A1887F", "#90A4AE")

@Composable
internal fun AdminBadges() {
  val loader = rememberLoad(Unit) { Api.badges() }
  var edit by remember { mutableStateOf<Badge?>(null) }
  var creating by remember { mutableStateOf(false) }
  var give by remember { mutableStateOf<Badge?>(null) }
  LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 8.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    item {
      Text(tr("Свои ачивки: эмодзи, название и цвет. Выдайте их друзьям — они появятся в профиле и будут летать вокруг аватарки."), color = MaterialTheme.colorScheme.onSurfaceVariant)
      Spacer(Modifier.height(10.dp))
      Button(onClick = { creating = true }, shapes = ButtonDefaults.shapes()) { Ico(Res.drawable.ic_add, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Новая ачивка")) }
    }
    items(loader.data.orEmpty(), key = { it.id }) { b ->
      Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        BadgeDot(b, 44.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
          Text(b.title, style = MaterialTheme.typography.titleMedium)
          Text(listOfNotNull(b.description.takeIf { it.isNotBlank() }, tr("выдано: {}", b.holders ?: 0)).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        FilledTonalButton(onClick = { give = b }, shapes = ButtonDefaults.shapes()) { Text(tr("Выдать")) }
        IconButton(onClick = { edit = b }) { Ico(Res.drawable.ic_settings, tr("Изменить")) }
      }
    }
  }
  if (creating || edit != null) BadgeEditor(edit, onDismiss = { creating = false; edit = null }) { creating = false; edit = null; loader.reload() }
  give?.let { b -> GiveBadgeDialog(b, onDismiss = { give = null }) { give = null; loader.reload() } }
}

@Composable
private fun BadgeEditor(b: Badge?, onDismiss: () -> Unit, onDone: () -> Unit) {
  var emoji by remember { mutableStateOf(b?.emoji ?: "🐞") }
  var title by remember { mutableStateOf(b?.title ?: "") }
  var desc by remember { mutableStateOf(b?.description ?: "") }
  var color by remember { mutableStateOf(b?.color ?: COLORS.first()) }
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(if (b == null) tr("Новая ачивка") else tr("Ачивка")) },
    text = {
      Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          BadgeDot(Badge("", title, emoji.ifBlank { "?" }, color), 52.dp)
          Spacer(Modifier.width(12.dp))
          OutlinedTextField(emoji, { emoji = it.take(8) }, label = { Text(tr("Эмодзи")) }, singleLine = true, modifier = Modifier.width(110.dp))
        }
        OutlinedTextField(title, { title = it.take(40) }, label = { Text(tr("Название")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(desc, { desc = it.take(200) }, label = { Text(tr("За что (необязательно)")) }, modifier = Modifier.fillMaxWidth())
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          COLORS.forEach { c ->
            Box(Modifier.size(34.dp).clip(CircleShape).background(badgeColor(c)).border(if (c == color) 3.dp else 0.dp, MaterialTheme.colorScheme.onSurface, CircleShape).clickable { color = c })
          }
        }
        if (b != null) TextButton(onClick = { act(tr("Ачивка удалена"), onDone) { Api.deleteBadge(b.id) } }) { Text(tr("Удалить ачивку"), color = MaterialTheme.colorScheme.error) }
      }
    },
    confirmButton = {
      TextButton(enabled = title.isNotBlank() && emoji.isNotBlank(), onClick = { act(tr("Сохранено"), onDone) { Api.saveBadge(b?.id, title, emoji, color, desc) } }) { Text(tr("Сохранить")) }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Отмена")) } },
  )
}

@Composable
private fun GiveBadgeDialog(b: Badge, onDismiss: () -> Unit, onDone: () -> Unit) {
  val friends by Friends.list.collectAsStateWithLifecycle()
  LaunchedEffect(Unit) { Friends.refresh() }
  val holders = rememberLoad(b.id) { Api.badgeHolders(b.id) }
  val me = Api.user
  val people = remember(friends) { (listOfNotNull(me?.let { space.avthsr.music.api.FriendRef(it.id, it.displayName.ifBlank { it.username }, null) }) + friends.map { it.ref }) }
  var picked by remember { mutableStateOf(setOf<String>()) }
  val has = holders.data.orEmpty().map { it.id }.toSet()
  AlertDialog(
    onDismissRequest = onDismiss,
    icon = { BadgeDot(b, 48.dp) },
    title = { Text(tr("Выдать «{}»", b.title)) },
    text = {
      LazyColumn(Modifier.heightIn(max = 380.dp)) {
        items(people, key = { it.id }) { f ->
          val owned = f.id in has
          Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(enabled = !owned) { picked = if (f.id in picked) picked - f.id else picked + f.id }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = owned || f.id in picked, onCheckedChange = null, enabled = !owned)
            Spacer(Modifier.width(6.dp))
            Text(f.displayName, Modifier.weight(1f))
            if (owned) TextButton(onClick = { act(tr("Ачивка забрана"), { holders.reload() }) { Api.takeBadge(b.id, f.id) } }) { Text(tr("Забрать")) }
          }
        }
      }
    },
    confirmButton = { TextButton(enabled = picked.isNotEmpty(), onClick = { act(tr("Выдано — придёт во «Входящие»"), onDone) { Api.giveBadge(b.id, picked.toList()) } }) { Text(tr("Выдать")) } },
    dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Закрыть")) } },
  )
}
