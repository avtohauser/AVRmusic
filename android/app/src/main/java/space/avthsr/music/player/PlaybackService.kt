// The player. ExoPlayer holds the whole queue inside a Media3 session service, so Android shows the
// regular media player in the notification shade and on the lock screen — previous, play/pause, next
// and ♥ "Add to favourites" — and music keeps playing with the screen off or the app closed.
// "My Wave" is topped up here as it plays, and every play is reported to the server for the stats.
package space.avthsr.music.player

import space.avthsr.music.tr
import android.app.PendingIntent
import android.content.Intent
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt
import space.avthsr.music.App
import space.avthsr.music.BuildConfig
import space.avthsr.music.MainActivity
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.api.Likes

@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
  companion object {
    const val CMD_LIKE = "avr.like"
  }

  private lateinit var player: ExoPlayer
  private var session: MediaSession? = null
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  // the current track and how long it has actually been heard
  private var currentId: String? = null
  private var playedMs = 0L
  private var playingSince = 0L
  private var topping = false

  // volume (fades, normalization, sleep timer), the equalizer, "now listening" for friends
  private var ticker: Job? = null
  private var eq: Equalizer? = null
  private var booster: LoudnessEnhancer? = null
  private var boostMb = -1

  override fun onCreate() {
    super.onCreate()
    val http = DefaultHttpDataSource.Factory()
      .setUserAgent("AVRmusic-Android/${BuildConfig.VERSION_NAME}")
      .setAllowCrossProtocolRedirects(true)
      .setConnectTimeoutMs(15_000)
      .setReadTimeoutMs(30_000)
    val data = CacheDataSource.Factory()
      .setCache(MediaCache.get(this))
      .setUpstreamDataSourceFactory(DefaultDataSource.Factory(this, http))
      // the stream URL carries a token that changes; the track's path does not
      .setCacheKeyFactory { spec -> spec.key ?: spec.uri.path ?: spec.uri.toString() }
      .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    player = ExoPlayer.Builder(this)
      .setMediaSourceFactory(DefaultMediaSourceFactory(LocalFirstDataSourceFactory(DefaultDataSource.Factory(this), data)))
      .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
      .setHandleAudioBecomingNoisy(true)
      .setWakeMode(C.WAKE_MODE_NETWORK)
      .build()
    player.addListener(listener)

    val open = Intent(this, MainActivity::class.java)
      .setAction(MainActivity.ACTION_OPEN_PLAYER)
      .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
    session = MediaSession.Builder(this, player)
      .setSessionActivity(PendingIntent.getActivity(this, 1, open, flags))
      .setCallback(Callback())
      .build()

    val notifications = DefaultMediaNotificationProvider.Builder(this).build()
    notifications.setSmallIcon(R.drawable.ic_notification_icon)
    setMediaNotificationProvider(notifications)

    scope.launch { Likes.tracks.collect { showLike() } }
    scope.launch { combine(Gain.eqOn, Gain.eqBands) { on, bands -> on to bands }.collect { applyEq() } }
    scope.launch { Gain.normalize.collect { applyBoost() } }
    attachEffects(player.audioSessionId)
  }

  /* ---------- volume, equalizer, booster ---------- */

  /** While playing: the volume follows the fades several times a second, friends hear what plays. */
  private fun startTicker() {
    if (ticker?.isActive == true) return
    // a sleep timer whose time came while paused is over
    if (Gain.sleepDue(System.currentTimeMillis())) Gain.sleepAt.value = null
    ticker = scope.launch {
      var n = 0
      while (isActive) {
        if (Gain.sleepDue(System.currentTimeMillis())) { player.pause(); Gain.slept() }
        Alarm.rise()
        applyVolume()
        if (n++ % 25 == 0) reportNow()
        delay(120)
      }
    }
  }

  private fun stopTicker() {
    ticker?.cancel()
    ticker = null
    applyVolume()
    reportNow()
  }

  private fun applyVolume() {
    val d = player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
    val v = Gain.volume(Queue.track(player.currentMediaItem?.mediaId), player.currentPosition, d)
    if (abs(player.volume - v) > 0.005f) player.volume = v
  }

  private fun reportNow() {
    NowReport.update(player.currentMediaItem?.mediaId, player.currentPosition, player.playWhenReady && player.playbackState != Player.STATE_ENDED)
  }

  /** The equalizer and the booster live on the player's audio session (a new one after some changes). */
  private fun attachEffects(sessionId: Int) {
    runCatching { eq?.release() }
    runCatching { booster?.release() }
    eq = null; booster = null; boostMb = -1
    if (sessionId == C.AUDIO_SESSION_ID_UNSET || sessionId == 0) return
    eq = runCatching { Equalizer(0, sessionId) }.getOrNull()
    booster = runCatching { LoudnessEnhancer(sessionId) }.getOrNull()
    applyEq()
    applyBoost()
  }

  /** The five bands of the settings, each set on the phone's band nearest to it. */
  private fun applyEq() {
    val e = eq ?: return
    runCatching {
      if (!Gain.eqOn.value) { e.enabled = false; return }
      val range = e.bandLevelRange
      val bands = Gain.eqBands.value
      for (b in 0 until e.numberOfBands) {
        val hz = e.getCenterFreq(b.toShort()) / 1000
        val i = EQ_FREQS.indices.minByOrNull { abs(kotlin.math.ln(EQ_FREQS[it].toDouble()) - kotlin.math.ln(hz.coerceAtLeast(1).toDouble())) } ?: continue
        val mb = (bands[i] * 100).roundToInt().coerceIn(range[0].toInt(), range[1].toInt())
        e.setBandLevel(b.toShort(), mb.toShort())
      }
      e.enabled = true
    }
  }

  /** Quieter tracks are raised by the booster (louder ones are turned down by the volume). */
  private fun applyBoost() {
    val b = booster ?: return
    val db = Gain.normDb(Queue.track(player.currentMediaItem?.mediaId)?.loudness)
    val mb = if (db > 0) (db * 100).roundToInt() else 0
    if (mb == boostMb) return
    boostMb = mb
    runCatching {
      b.setTargetGain(mb)
      b.enabled = mb > 0
    }
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  /** The system's alarm clock woke the service: the alarm's music starts, rising from quiet. */
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val r = super.onStartCommand(intent, flags, startId)
    if (intent?.action == AlarmClock.ACTION_ALARM) ringAlarm()
    return r
  }

  private fun ringAlarm() {
    val s = Alarm.setting.value
    fun start(list: List<space.avthsr.music.api.Track>) {
      if (list.isEmpty()) return
      Alarm.fired()
      Queue.remember(list)
      if (s.source != "liked") Queue.setWaveMode(s.source)
      Queue.context.value = if (s.source == "liked") "liked" else Queue.WAVE
      applyVolume()
      player.setMediaItems(list.map { mediaItemOf(it) })
      player.prepare()
      player.play()
    }
    val kept = Alarm.storedTracks()
    if (kept.isNotEmpty()) start(kept)
    else scope.launch {
      start(runCatching { if (s.source == "liked") Api.likedTracks().shuffled().take(40) else Api.waveNext(s.source, emptyList()).tracks }.getOrDefault(emptyList()))
    }
  }

  /** Swiped away from the recent apps: keep playing if music is on, otherwise go. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!player.playWhenReady || player.mediaItemCount == 0) stopSelf()
  }

  override fun onDestroy() {
    flushPlay()
    NowReport.update(null, 0, false)
    runCatching { eq?.release() }
    runCatching { booster?.release() }
    scope.cancel()
    player.removeListener(listener)
    session?.release()
    session = null
    player.release()
    super.onDestroy()
  }

  private val listener = object : Player.Listener {
    override fun onIsPlayingChanged(isPlaying: Boolean) {
      val now = SystemClock.elapsedRealtime()
      if (isPlaying) playingSince = now
      else if (playingSince > 0) { playedMs += now - playingSince; playingSince = 0 }
      if (isPlaying) startTicker() else stopTicker()
    }

    override fun onAudioSessionIdChanged(audioSessionId: Int) {
      attachEffects(audioSessionId)
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      // the sleep timer "at the end of the track": the next one does not start
      if (Gain.sleepAtTrackEnd.value && (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO || reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT)) {
        player.pause()
        player.seekTo(0)
        Gain.slept()
      }
      flushPlay()
      currentId = mediaItem?.mediaId
      playingSince = if (player.isPlaying) SystemClock.elapsedRealtime() else 0
      showLike()
      topUpWave()
      applyBoost()
      applyVolume()
      reportNow()
    }

    override fun onPlayerError(error: PlaybackException) {
      App.say(tr("Не удалось воспроизвести трек ({})", error.errorCodeName))
    }
  }

  /** Reports how long the track that just ended or was skipped was heard (5 s or more). */
  private fun flushPlay() {
    val id = currentId ?: return
    if (playingSince > 0) {
      val now = SystemClock.elapsedRealtime()
      playedMs += now - playingSince
      playingSince = now
    }
    val ms = playedMs
    playedMs = 0
    if (ms < 5_000) return
    val context = Queue.context.value
    App.scope.launch { runCatching { Api.reportPlay(id, ms, context) } }
  }

  /** "My Wave" never ends: with three tracks left the next batch is appended. */
  private fun topUpWave() {
    if (Queue.context.value != Queue.WAVE || topping) return
    if (player.mediaItemCount - player.currentMediaItemIndex > 3) return
    topping = true
    val have = (0 until player.mediaItemCount).map { player.getMediaItemAt(it).mediaId }
    scope.launch {
      try {
        val batch = Api.waveNext(Queue.waveMode.value, have)
        if (Queue.context.value == Queue.WAVE && batch.tracks.isNotEmpty()) {
          Queue.remember(batch.tracks)
          player.addMediaItems(batch.tracks.map { mediaItemOf(it) })
        }
      } catch (e: Exception) {
        // tried again on the next track
      } finally {
        topping = false
      }
    }
  }

  private fun liked(): Boolean {
    val id = player.currentMediaItem?.mediaId ?: return false
    return id in Likes.tracks.value
  }

  private fun likeButton(liked: Boolean): CommandButton = CommandButton.Builder()
    .setDisplayName(getString(if (liked) R.string.unlike else R.string.like))
    .setIconResId(if (liked) R.drawable.ic_heart_filled else R.drawable.ic_heart_outline)
    .setSessionCommand(SessionCommand(CMD_LIKE, Bundle.EMPTY))
    .build()

  /** The ♥ in the shade follows the like state of the current track. */
  private fun showLike() {
    session?.setCustomLayout(ImmutableList.of(likeButton(liked())))
  }

  private inner class Callback : MediaSession.Callback {
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
      val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
        .add(SessionCommand(CMD_LIKE, Bundle.EMPTY))
        .build()
      return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
        .setAvailableSessionCommands(commands)
        .setCustomLayout(ImmutableList.of(likeButton(liked())))
        .build()
    }

    override fun onCustomCommand(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
      customCommand: SessionCommand,
      args: Bundle,
    ): ListenableFuture<SessionResult> {
      if (customCommand.customAction != CMD_LIKE) return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED))
      val id = player.currentMediaItem?.mediaId
      if (id != null) App.scope.launch {
        runCatching { Likes.toggle("track", id) }.onFailure { App.say(it.message ?: tr("Не получилось")) }
      }
      return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
    }

    /** Items sent by the app's screens arrive without their address: give them the stream URL again. */
    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> = Futures.immediateFuture(
      mediaItems.map { item -> Queue.track(item.mediaId)?.let { mediaItemOf(it) } ?: item.buildUpon().setUri(Api.streamUrl(item.mediaId)).build() }.toMutableList()
    )
  }
}
