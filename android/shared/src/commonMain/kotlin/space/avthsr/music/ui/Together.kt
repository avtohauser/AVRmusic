package space.avthsr.music.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import space.avthsr.music.api.Api
import space.avthsr.music.api.JamSuggestion
import space.avthsr.music.api.JamView
import space.avthsr.music.api.jams
import space.avthsr.music.player.Jam
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.res.*
import space.avthsr.music.tr

/** In a session: who listens together, under the player's title. */
@Composable
fun JamBanner(v: JamView, onClick: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  Row(
    Modifier.clip(CircleShape).background(cs.tertiaryContainer).clickable(onClick = onClick).padding(start = 6.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    v.members.take(4).forEachIndexed { i, m ->
      Cover(m.avatarUrl, Modifier.offset(x = (-6 * i).dp).size(24.dp).border(1.5.dp, cs.tertiaryContainer, CircleShape), CircleShape, Res.drawable.ic_person)
    }
    Spacer(Modifier.width(2.dp))
    Text(
      tr("Вместе · {}", v.members.size), style = MaterialTheme.typography.labelLarge, color = cs.onTertiaryContainer,
      maxLines = 1, overflow = TextOverflow.Ellipsis,
    )
  }
}

/** Listen together: start a session with what plays, invite friends, join theirs, leave. */
@Composable
fun JamSheet(onDismiss: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  val view by Jam.view.collectAsStateWithLifecycle()
  val player by PlayerConn.state.collectAsStateWithLifecycle()
  var invite by remember { mutableStateOf(false) }
  val others = rememberLoad(view?.id) { Api.jams() }
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(48.dp).clip(LogoShape).background(cs.tertiary), contentAlignment = Alignment.Center) {
          Ico(Res.drawable.ic_headphones, null, Modifier.size(26.dp), cs.onTertiary)
        }
        Spacer(Modifier.width(12.dp))
        Column {
          Text(tr("Слушать вместе"), style = MaterialTheme.typography.titleLarge)
          Text(tr("Одна очередь и одно место в треке на всех"), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
        }
      }
      Spacer(Modifier.height(16.dp))
      val v = view
      if (v == null) {
        Text(
          tr("Друзья слышат то же, что и вы, в ту же секунду. Любой может ставить на паузу, переключать и добавлять треки."),
          style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant,
        )
        Spacer(Modifier.height(14.dp))
        Button(
          onClick = { act(tr("Сессия начата — позовите друзей")) { Jam.start(); invite = true } },
          enabled = player.track != null, shapes = ButtonDefaults.shapes(), modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
          Ico(Res.drawable.ic_play, null, Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)); Text(tr("Начать с того, что играет"))
        }
        val list = others.data.orEmpty()
        if (list.isNotEmpty()) {
          Spacer(Modifier.height(18.dp))
          Text(tr("Друзья уже слушают"), style = MaterialTheme.typography.titleMedium)
          list.forEach { j -> JamRow(j) }
        }
      } else {
        Text(tr("В сессии"), style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        v.members.forEach { m ->
          Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            FriendAvatar(m.avatarUrl, 40.dp, listening = v.playing)
            Spacer(Modifier.width(12.dp))
            Text(m.displayName + if (m.id == Api.user?.id) tr(" (вы)") else "", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
            if (m.id == v.host?.id) Text(tr("ведущий"), style = MaterialTheme.typography.labelMedium, color = cs.tertiary)
          }
        }
        v.queue.getOrNull(v.index)?.let { t ->
          Spacer(Modifier.height(10.dp))
          Text(tr("Сейчас: {} · {}", t.title, t.artists), style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(16.dp))
        Text(tr("Предложения"), style = MaterialTheme.typography.titleMedium)
        Text(
          tr("Голосуйте — трек с большинством голосов играет следующим. Предложить: ⋮ у любого трека."),
          style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant,
        )
        v.suggestions.forEach { s -> SuggestionRow(s) }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          FilledTonalButton(onClick = { invite = true }, shapes = ButtonDefaults.shapes(), modifier = Modifier.weight(1f)) {
            Ico(Res.drawable.ic_person_add, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Позвать"))
          }
          OutlinedButton(onClick = { Jam.leave(); onDismiss() }, shapes = ButtonDefaults.shapes(), modifier = Modifier.weight(1f)) {
            Ico(Res.drawable.ic_logout, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Выйти"))
          }
        }
      }
    }
  }
  val current = view
  if (invite && current != null) SendDialog("jam", current.id, tr("Приглашение слушать вместе")) { invite = false }
}

/** A suggested song: who wants it, how many votes, a thumb to vote; the leader is marked "next". */
@Composable
private fun SuggestionRow(s: JamSuggestion) {
  val cs = MaterialTheme.colorScheme
  Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
    Cover(s.track.coverUrl, Modifier.size(44.dp))
    Spacer(Modifier.width(12.dp))
    Column(Modifier.weight(1f)) {
      Text(s.track.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
      Text(
        listOfNotNull(if (s.next) tr("следующий") else null, s.track.artists, s.by?.let { tr("от {}", it.displayName) }).joinToString(" · "),
        style = MaterialTheme.typography.bodySmall, color = if (s.next) cs.tertiary else cs.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
      )
    }
    val on = s.voted
    Row(
      Modifier.clip(CircleShape).background(if (on) cs.tertiary else cs.surfaceContainerHigh).clickable { Jam.vote(s.track.id, !on) }
        .padding(horizontal = 12.dp, vertical = 6.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Ico(Res.drawable.ic_thumb_up, tr("Голосовать"), Modifier.size(18.dp), if (on) cs.onTertiary else cs.onSurface)
      Spacer(Modifier.width(6.dp))
      Text(s.votes.toString(), style = MaterialTheme.typography.labelLarge, color = if (on) cs.onTertiary else cs.onSurface)
    }
  }
}

/** Listening along with a friend: their name under the player's title; a tap stops it. */
@Composable
fun FollowChip(name: String, onStop: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  Row(
    Modifier.clip(CircleShape).background(cs.secondaryContainer).clickable(onClick = onStop).padding(horizontal = 12.dp, vertical = 5.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Ico(Res.drawable.ic_headphones, null, Modifier.size(16.dp), cs.onSecondaryContainer)
    Spacer(Modifier.width(6.dp))
    Text(tr("С {} · выйти", name), style = MaterialTheme.typography.labelLarge, color = cs.onSecondaryContainer, maxLines = 1, overflow = TextOverflow.Ellipsis)
  }
}
