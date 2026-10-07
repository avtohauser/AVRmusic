// "Guess the melody": a few friends hear the same 15 seconds of a song and pick its title out of four —
// the faster a right answer, the more points. The server runs the game; every phone follows it with a
// long poll and plays each round's piece at the same moment (the music pauses meanwhile).
package space.avthsr.music.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.ApiException
import space.avthsr.music.api.GameView
import space.avthsr.music.api.createGame
import space.avthsr.music.api.game
import space.avthsr.music.api.gameAnswer
import space.avthsr.music.api.gameNext
import space.avthsr.music.api.joinGame
import space.avthsr.music.api.leaveGame
import space.avthsr.music.api.myGame
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.player.Preview
import space.avthsr.music.res.*
import space.avthsr.music.tr

/** The game the listener is in, followed with a long poll; each round's piece plays on time. */
object GameRoom {
  private val _view = MutableStateFlow<GameView?>(null)
  val view: StateFlow<GameView?> = _view.asStateFlow()
  /** server time minus this phone's time */
  private var skew = 0L
  private var loop: Job? = null
  private var clipJob: Job? = null
  private var playedRound = -1

  fun serverNow() = Platform.nowMs() + skew

  suspend fun create(source: String, rounds: Int) = enter(Api.createGame(source, rounds))
  suspend fun join(id: String) = enter(Api.joinGame(id))
  suspend fun resume() { if (_view.value == null) Api.myGame()?.let { enter(it) } }

  fun leave() {
    val v = _view.value ?: return
    stop()
    App.scope.launch { runCatching { Api.leaveGame(v.id) } }
  }

  fun next() = send { Api.gameNext(it) }
  fun answer(n: Int) = send { Api.gameAnswer(it, n) }

  private fun send(work: suspend (String) -> GameView) {
    val v = _view.value ?: return
    App.scope.launch { runCatching { work(v.id) }.onSuccess { update(it) }.onFailure { App.say(it.message ?: tr("Не получилось")) } }
  }

  private fun stop() {
    loop?.cancel(); loop = null
    clipJob?.cancel(); clipJob = null
    if (Preview.playing.value == -1L) Preview.stop()
    _view.value = null
    playedRound = -1
  }

  private fun enter(v: GameView) {
    update(v)
    loop?.cancel()
    loop = App.scope.launch {
      while (isActive) {
        val cur = _view.value?.takeIf { it.id == v.id } ?: break
        val next = try {
          Api.game(cur.id, cur.version)
        } catch (e: CancellationException) {
          throw e
        } catch (e: ApiException) {
          if (e.status == 403 || e.status == 404) null else { delay(2000); continue }
        } catch (e: Exception) {
          delay(2000); continue
        }
        if (next == null) { if (_view.value?.id == v.id) { stop(); App.say(tr("Игра закончилась")) }; break }
        if (_view.value?.id != v.id) break
        update(next)
      }
    }
  }

  private fun update(v: GameView) {
    if (v.serverNow > 0) skew = v.serverNow - Platform.nowMs()
    _view.value = v
    // a new round: its piece plays when the round starts, for everyone at once
    if (v.state == "round" && v.round != playedRound && v.clipUrl != null) {
      playedRound = v.round
      val url = Api.downloadUrl(v.clipUrl)
      val startsIn = (v.startsAt ?: 0) - serverNow()
      clipJob?.cancel()
      clipJob = App.scope.launch {
        if (PlayerConn.state.value.playing) PlayerConn.toggle()
        delay(startsIn.coerceIn(0, 5000))
        Preview.clip(url, v.clipOffsetMs, v.clipMs)
        delay(v.clipMs + 300)
        if (Preview.playing.value == -1L) Preview.stop()
      }
    }
    if (v.state != "round" && Preview.playing.value == -1L) { clipJob?.cancel(); Preview.stop() }
  }
}

@Composable
fun GameScreen(join: String? = null) {
  val view by GameRoom.view.collectAsStateWithLifecycle()
  // an invitation (from its notification or banner): straight into that game
  LaunchedEffect(join) {
    if (join != null && view?.id != join) runCatching { GameRoom.join(join) }.onFailure { App.say(it.message ?: tr("Игра уже закончилась")) }
    else runCatching { GameRoom.resume() }
  }
  Page {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(screenPadding(top = 8.dp, bottom = 24.dp)).padding(horizontal = 20.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(48.dp).clip(LogoShape).background(MaterialTheme.colorScheme.tertiary), contentAlignment = Alignment.Center) {
          Ico(Res.drawable.ic_quiz, null, Modifier.size(26.dp), MaterialTheme.colorScheme.onTertiary)
        }
        Spacer(Modifier.width(12.dp))
        Column {
          Text(tr("Угадай мелодию"), style = MaterialTheme.typography.headlineSmall)
          view?.let { v -> if (v.state != "lobby") Text(tr("Раунд {} из {}", v.round, v.rounds), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
      }
      Spacer(Modifier.height(20.dp))
      val v = view
      AnimatedContent(v?.state ?: "none", label = "game") { state ->
        Column {
          when {
            v == null || state == "none" -> NewGame()
            state == "lobby" -> Lobby(v)
            state == "round" -> RoundView(v)
            else -> Reveal(v)
          }
        }
      }
    }
  }
}

@Composable
private fun NewGame() {
  val cs = MaterialTheme.colorScheme
  var source by remember { mutableStateOf("ours") }
  var rounds by remember { mutableStateOf(10) }
  Text(
    tr("Все слышат один и тот же отрывок и выбирают название из четырёх. Чем быстрее верный ответ — тем больше очков."),
    style = MaterialTheme.typography.bodyLarge, color = cs.onSurfaceVariant,
  )
  Spacer(Modifier.height(18.dp))
  Text(tr("Какая музыка"), style = MaterialTheme.typography.titleSmall)
  Spacer(Modifier.height(6.dp))
  Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    FilterChip(source == "ours", { source = "ours" }, { Text(tr("Что мы слушаем")) })
    FilterChip(source == "library", { source = "library" }, { Text(tr("Вся библиотека")) })
  }
  Spacer(Modifier.height(14.dp))
  Text(tr("Раундов"), style = MaterialTheme.typography.titleSmall)
  Spacer(Modifier.height(6.dp))
  Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    listOf(5, 10, 15, 20).forEach { n -> FilterChip(rounds == n, { rounds = n }, { Text(n.toString()) }) }
  }
  Spacer(Modifier.height(22.dp))
  Button(onClick = { act { GameRoom.create(source, rounds) } }, shapes = ButtonDefaults.shapes(), modifier = Modifier.fillMaxWidth().height(56.dp)) {
    Ico(Res.drawable.ic_play, null, Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)); Text(tr("Создать игру"))
  }
  Spacer(Modifier.height(10.dp))
  Text(tr("Друзья заходят по приглашению — оно придёт им во «Входящие»."), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
}

@Composable
private fun Players(v: GameView, showPoints: Boolean) {
  val cs = MaterialTheme.colorScheme
  v.players.forEachIndexed { i, p ->
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
      Text("${i + 1}", Modifier.width(22.dp), style = MaterialTheme.typography.titleMedium, color = cs.onSurfaceVariant)
      FriendAvatar(p.user.avatarUrl, 36.dp, listening = false)
      Spacer(Modifier.width(10.dp))
      Text(p.user.displayName + if (p.user.id == Api.user?.id) tr(" (вы)") else "", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
      if (showPoints && p.points != null) {
        Text(if (p.correct == true) "+${p.points}" else "✕", color = if (p.correct == true) cs.tertiary else cs.error, style = MaterialTheme.typography.labelLarge)
        Spacer(Modifier.width(10.dp))
      } else if (v.state == "round") {
        Ico(if (p.answered) Res.drawable.ic_check else Res.drawable.ic_more, null, Modifier.size(18.dp), if (p.answered) cs.tertiary else cs.outline)
        Spacer(Modifier.width(10.dp))
      }
      Text(p.score.toString(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    }
  }
}

@Composable
private fun Lobby(v: GameView) {
  var invite by remember { mutableStateOf(false) }
  val host = v.host?.id == Api.user?.id
  Text(tr("Игроки"), style = MaterialTheme.typography.titleMedium)
  Spacer(Modifier.height(6.dp))
  Players(v, showPoints = false)
  Spacer(Modifier.height(18.dp))
  Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
    FilledTonalButton(onClick = { invite = true }, shapes = ButtonDefaults.shapes(), modifier = Modifier.weight(1f)) {
      Ico(Res.drawable.ic_person_add, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Позвать"))
    }
    OutlinedButton(onClick = { GameRoom.leave() }, shapes = ButtonDefaults.shapes(), modifier = Modifier.weight(1f)) { Text(tr("Выйти")) }
  }
  Spacer(Modifier.height(12.dp))
  if (host) Button(onClick = { GameRoom.next() }, shapes = ButtonDefaults.shapes(), modifier = Modifier.fillMaxWidth().height(56.dp)) { Text(tr("Начать")) }
  else Text(tr("Ждём, когда {} начнёт игру", v.host?.displayName.orEmpty()), color = MaterialTheme.colorScheme.onSurfaceVariant)
  if (invite) SendDialog("game", v.id, tr("Приглашение в «Угадай мелодию»")) { invite = false }
}

@Composable
private fun RoundView(v: GameView) {
  val cs = MaterialTheme.colorScheme
  var now by remember { mutableLongStateOf(GameRoom.serverNow()) }
  LaunchedEffect(v.round) { while (true) { now = GameRoom.serverNow(); delay(100) } }
  val starts = v.startsAt ?: now
  val ends = v.endsAt ?: now
  if (now < starts) {
    Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
      Text(((starts - now) / 1000 + 1).toString(), style = MaterialTheme.typography.displayLarge, color = cs.tertiary)
    }
  } else {
    val left = ((ends - now).coerceAtLeast(0)).toFloat() / (ends - starts).coerceAtLeast(1)
    LinearWavyProgressIndicator(progress = { left }, modifier = Modifier.fillMaxWidth().height(12.dp))
    Spacer(Modifier.height(8.dp))
    Text(tr("Что это за песня?"), style = MaterialTheme.typography.titleLarge)
    Spacer(Modifier.height(12.dp))
    v.options.forEach { o ->
      val mine = v.myChoice == o.n
      val answered = v.myChoice != null
      Column(
        Modifier.fillMaxWidth().padding(vertical = 5.dp).clip(RoundedCornerShape(20.dp))
          .background(if (mine) cs.primary else cs.surfaceContainerHigh)
          .clickable(enabled = !answered) { GameRoom.answer(o.n) }.padding(horizontal = 18.dp, vertical = 14.dp),
      ) {
        Text(o.title, style = MaterialTheme.typography.titleMedium, color = if (mine) cs.onPrimary else cs.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(o.artist, style = MaterialTheme.typography.bodyMedium, color = if (mine) cs.onPrimary.copy(alpha = 0.8f) else cs.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    }
    if (v.myChoice != null) Text(tr("Ответ принят — ждём остальных"), Modifier.padding(top = 8.dp), color = cs.onSurfaceVariant)
  }
  Spacer(Modifier.height(18.dp))
  Players(v, showPoints = false)
}

@Composable
private fun Reveal(v: GameView) {
  val cs = MaterialTheme.colorScheme
  val done = v.state == "done"
  val right = v.answer
  val shown = right?.track
  if (right != null && shown != null) {
    val t = shown
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(cs.tertiaryContainer).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
      Cover(t.coverUrl, Modifier.size(64.dp))
      Spacer(Modifier.width(14.dp))
      Column(Modifier.weight(1f)) {
        Text(tr("Это было"), style = MaterialTheme.typography.labelLarge, color = cs.onTertiaryContainer.copy(alpha = 0.8f))
        Text(t.title, style = MaterialTheme.typography.titleMedium, color = cs.onTertiaryContainer, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(t.artists, style = MaterialTheme.typography.bodyMedium, color = cs.onTertiaryContainer.copy(alpha = 0.8f), maxLines = 1)
      }
    }
    if (v.myChoice != null) {
      val ok = v.myChoice == right.n
      Text(
        if (ok) tr("Верно!") else tr("Мимо"), Modifier.fillMaxWidth().padding(top = 12.dp), textAlign = TextAlign.Center,
        style = MaterialTheme.typography.headlineSmall, color = if (ok) cs.tertiary else cs.error,
      )
    }
  }
  Spacer(Modifier.height(16.dp))
  Text(if (done) tr("Итог") else tr("Счёт"), style = MaterialTheme.typography.titleMedium)
  Spacer(Modifier.height(6.dp))
  Players(v, showPoints = !done)
  Spacer(Modifier.height(18.dp))
  if (done) {
    if (v.played.isNotEmpty()) {
      Text(tr("Звучало в игре"), style = MaterialTheme.typography.titleMedium)
      v.played.forEachIndexed { i, t -> TrackRow(t, onClick = { PlayerConn.play(v.played, i, "game") }) }
      Spacer(Modifier.height(14.dp))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
      Button(onClick = { act { val s = v.source; val n = v.rounds; GameRoom.leave(); GameRoom.create(s, n) } }, shapes = ButtonDefaults.shapes(), modifier = Modifier.weight(1f)) { Text(tr("Ещё игра")) }
      OutlinedButton(onClick = { GameRoom.leave() }, shapes = ButtonDefaults.shapes(), modifier = Modifier.weight(1f)) { Text(tr("Выйти")) }
    }
  } else {
    FilledTonalButton(onClick = { GameRoom.next() }, shapes = ButtonDefaults.shapes(), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(tr("Дальше")) }
  }
}

/** The way into the game from the friends' screen. */
@Composable
fun GameCard(onClick: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  Row(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(cs.secondaryContainer).clickable(onClick = onClick).padding(16.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(Modifier.size(44.dp).clip(CircleShape).background(cs.secondary), contentAlignment = Alignment.Center) { Ico(Res.drawable.ic_quiz, null, Modifier.size(24.dp), cs.onSecondary) }
    Spacer(Modifier.width(14.dp))
    Column(Modifier.weight(1f)) {
      Text(tr("Угадай мелодию"), style = MaterialTheme.typography.titleMedium, color = cs.onSecondaryContainer)
      Text(tr("Игра с друзьями на скорость"), style = MaterialTheme.typography.bodySmall, color = cs.onSecondaryContainer.copy(alpha = 0.8f))
    }
    Ico(Res.drawable.ic_play, null, Modifier.size(22.dp), cs.onSecondaryContainer)
  }
}
