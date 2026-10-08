// The player. ExoPlayer holds the whole queue inside a Media3 library session service, so Android shows the
// regular media player in the notification shade and on the lock screen — previous, play/pause, next
// and ♥ "Add to favourites" — and music keeps playing with the screen off or the app closed.
// The same service is the app in the car (Android Auto browses "My Wave", the favourites, playlists and
// recent tracks), hands the music to a Chromecast when one is chosen, keeps the home-screen widget up to
// date and starts the alarm's music. "My Wave" is topped up here as it plays, every play is reported to
// the server for the stats, and the volume follows the fades, the normalization and the sleep timer.
package space.avthsr.music.player

import space.avthsr.music.tr
import android.app.PendingIntent
import android.content.Intent
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.cast.CastPlayer
import androidx.media3.cast.SessionAvailabilityListener
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
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
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.android.gms.cast.framework.CastContext
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
import kotlinx.coroutines.guava.future
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
import space.avthsr.music.api.Track
import space.avthsr.music.api.history

@OptIn(UnstableApi::class)
class PlaybackService : MediaLibraryService() {
  companion object {
    const val CMD_LIKE = "avr.like"
    private const val ROOT = "root"
  }

  private lateinit var player: ExoPlayer
  /** a Chromecast's player, when the Cast framework is there */
  private var cast: CastPlayer? = null
  /** the player the music is on now: the phone's, or the Chromecast's */
  private lateinit var active: Player
  private var session: MediaLibrarySession? = null
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  /** the stream cache with the server behind it (the next songs are fetched into it ahead) */
  private lateinit var cacheData: CacheDataSource.Factory

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

  // the line being sung, shown in place of the artist in the shade and on the lock screen
  private var lyricLines: List<space.avthsr.music.api.LyricLine>? = null
  private var lyricsFor: String? = null
  private var shownLine: String? = null

  override fun onCreate() {
    super.onCreate()
    val http = DefaultHttpDataSource.Factory()
      .setUserAgent("AVRmusic-Android/${BuildConfig.VERSION_NAME}")
      .setAllowCrossProtocolRedirects(true)
      .setConnectTimeoutMs(15_000)
      .setReadTimeoutMs(30_000)
    val data = CacheDataSource.Factory().also { cacheData = it }
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
    active = player

    val open = Intent(this, MainActivity::class.java)
      .setAction(MainActivity.ACTION_OPEN_PLAYER)
      .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
    session = MediaLibrarySession.Builder(this, player, Callback())
      .setSessionActivity(PendingIntent.getActivity(this, 1, open, flags))
      .build()

    val notifications = DefaultMediaNotificationProvider.Builder(this).build()
    notifications.setSmallIcon(R.drawable.ic_notification_icon)
    setMediaNotificationProvider(notifications)

    // Chromecast: when a cast session starts the queue moves to it, and back when it ends
    cast = runCatching { CastPlayer(CastContext.getSharedInstance(this)) }.getOrNull()?.also { c ->
      c.addListener(listener)
      c.setSessionAvailabilityListener(object : SessionAvailabilityListener {
        override fun onCastSessionAvailable() = switchTo(c)
        override fun onCastSessionUnavailable() = switchTo(player)
      })
      if (c.isCastSessionAvailable) switchTo(c)
    }

    scope.launch { Likes.tracks.collect { showLike() } }
    scope.launch { combine(Gain.eqOn, Gain.eqBands) { on, bands -> on to bands }.collect { applyEq() } }
    scope.launch { Gain.normalize.collect { applyBoost() } }
    attachEffects(player.audioSessionId)
  }

  /* ---------- the phone or a Chromecast ---------- */

  /** The Chromecast needs the server's address and the format; the phone plays saved files itself. */
  private fun itemFor(target: Player, id: String, fallback: MediaItem): MediaItem {
    val t = Queue.track(id)
    if (target === player) return t?.let { mediaItemOf(it) } ?: fallback
    val mime = t?.mimeType ?: "audio/mpeg"
    return (t?.let { mediaItemOf(it) } ?: fallback).buildUpon().setUri(Uri.parse(Api.streamUrl(id))).setMimeType(mime).build()
  }

  private fun switchTo(target: Player) {
    val from = active
    if (from === target) return
    val items = (0 until from.mediaItemCount).map { from.getMediaItemAt(it).let { m -> itemFor(target, m.mediaId, m) } }
    val index = from.currentMediaItemIndex
    val position = from.currentPosition
    val playing = from.playWhenReady
    flushPlay()
    from.stop()
    active = target
    if (items.isNotEmpty()) {
      target.setMediaItems(items, index.coerceIn(0, items.size - 1), position)
      target.playWhenReady = playing
      target.prepare()
    }
    session?.player = target
    App.say(if (target === player) tr("Музыка снова на телефоне") else tr("Музыка на Chromecast"))
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
        if (Gain.sleepDue(System.currentTimeMillis())) { active.pause(); Gain.slept() }
        Alarm.rise()
        applyVolume()
        showLyricLine()
        if (n % 25 == 0) reportNow()
        if (n++ % 40 == 0) Session.notePosition(active.currentMediaItem?.mediaId, active.currentPosition)
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

  /** The phone's volume (a Chromecast keeps its own). */
  private fun applyVolume() {
    if (active !== player) return
    val d = player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
    val v = Gain.volume(Queue.track(player.currentMediaItem?.mediaId), player.currentPosition, d)
    if (abs(player.volume - v) > 0.005f) player.volume = v
  }

  /** The current line of the lyrics in place of the artist (the item's address stays: playback goes on). */
  private fun showLyricLine() {
    if (active !== player) return
    val item = player.currentMediaItem ?: return
    val track = Queue.track(item.mediaId)
    if (!LockLyrics.enabled.value || track == null) { if (shownLine != null) setArtistLine(null); return }
    if (lyricsFor != track.id) {
      lyricsFor = track.id
      lyricLines = null
      scope.launch { val l = LockLyrics.lines(track.id); if (lyricsFor == track.id) lyricLines = l }
    }
    val lines = lyricLines ?: run { if (shownLine != null) setArtistLine(null); return }
    val line = LockLyrics.lineAt(lines, player.currentPosition)?.let { "♪ $it" }
    if (line != shownLine) setArtistLine(line)
  }

  private fun setArtistLine(line: String?) {
    shownLine = line
    val i = player.currentMediaItemIndex
    val item = player.currentMediaItem ?: return
    val artist = line ?: Queue.track(item.mediaId)?.artists ?: item.mediaMetadata.artist?.toString()
    if (item.mediaMetadata.artist?.toString() == artist) return
    runCatching { player.replaceMediaItem(i, item.buildUpon().setMediaMetadata(item.mediaMetadata.buildUpon().setArtist(artist).build()).build()) }
  }

  private fun reportNow() {
    NowReport.update(active.currentMediaItem?.mediaId, active.currentPosition, active.playWhenReady && active.playbackState != Player.STATE_ENDED)
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

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

  /** The alarm clock and the widget's buttons start the service with their actions. */
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val r = super.onStartCommand(intent, flags, startId)
    when (intent?.action) {
      AlarmClock.ACTION_ALARM -> ringAlarm()
      PlayerWidget.ACTION_TOGGLE -> {
        if (active.mediaItemCount == 0) startWave(Queue.waveMode.value)
        else if (active.playWhenReady) active.pause()
        else { if (active.playbackState == Player.STATE_IDLE) active.prepare(); active.play() }
      }
      PlayerWidget.ACTION_NEXT -> active.seekToNext()
      PlayerWidget.ACTION_PREV -> active.seekToPrevious()
    }
    return r
  }

  private fun playList(list: List<Track>, context: String?, start: Int = 0) {
    if (list.isEmpty()) return
    Queue.remember(list)
    Queue.context.value = context
    active.setMediaItems(list.map { itemFor(active, it.id, mediaItemOf(it)) }, start.coerceIn(0, list.size - 1), 0L)
    active.prepare()
    active.play()
  }

  private fun startWave(mode: String) {
    scope.launch {
      val batch = runCatching { Api.waveNext(mode, emptyList()).tracks }.getOrDefault(emptyList())
      Queue.setWaveMode(mode)
      playList(batch, Queue.WAVE)
    }
  }

  /** The system's alarm clock woke the service: the alarm's music starts, rising from quiet. */
  private fun ringAlarm() {
    val s = Alarm.setting.value
    fun start(list: List<Track>) {
      if (list.isEmpty()) return
      Alarm.fired()
      if (s.source != "liked") Queue.setWaveMode(s.source)
      applyVolume()
      playList(list, if (s.source == "liked") "liked" else Queue.WAVE)
    }
    val kept = Alarm.storedTracks()
    if (kept.isNotEmpty()) start(kept)
    else scope.launch {
      start(runCatching { if (s.source == "liked") Api.likedTracks().shuffled().take(40) else Api.waveNext(s.source, emptyList()).tracks }.getOrDefault(emptyList()))
    }
  }

  /** Swiped away from the recent apps: keep playing if music is on, otherwise go. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!active.playWhenReady || active.mediaItemCount == 0) stopSelf()
  }

  override fun onDestroy() {
    flushPlay()
    NowReport.update(null, 0, false)
    PlayerWidget.update(this, null, false)
    runCatching { eq?.release() }
    runCatching { booster?.release() }
    scope.cancel()
    player.removeListener(listener)
    cast?.let { it.removeListener(listener); it.setSessionAvailabilityListener(null); it.release() }
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
      if (isPlaying && active === player) Prefetch.ahead(scope, cacheData, player)
    }

    override fun onAudioSessionIdChanged(audioSessionId: Int) {
      attachEffects(audioSessionId)
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      // the same item with a new lyric line in its metadata: nothing changed for playback
      if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED && mediaItem?.mediaId == currentId && mediaItem != null) return
      shownLine = null
      // the sleep timer "at the end of the track": the next one does not start
      if (Gain.sleepAtTrackEnd.value && (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO || reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT)) {
        active.pause()
        active.seekTo(0)
        Gain.slept()
      }
      flushPlay()
      currentId = mediaItem?.mediaId
      playingSince = if (active.isPlaying) SystemClock.elapsedRealtime() else 0
      showLike()
      topUpWave()
      applyBoost()
      applyVolume()
      reportNow()
      if (active === player) Prefetch.ahead(scope, cacheData, player)
    }

    override fun onEvents(p: Player, events: Player.Events) {
      if (p !== active) return
      if (events.containsAny(Player.EVENT_MEDIA_ITEM_TRANSITION, Player.EVENT_PLAY_WHEN_READY_CHANGED, Player.EVENT_PLAYBACK_STATE_CHANGED, Player.EVENT_TIMELINE_CHANGED)) {
        val id = p.currentMediaItem?.mediaId
        val m = p.currentMediaItem?.mediaMetadata
        val t = id?.let { Queue.track(it) } ?: id?.let { Track(it, m?.title?.toString().orEmpty(), artist = space.avthsr.music.api.ArtistSummary("", m?.artist?.toString().orEmpty())) }
        PlayerWidget.update(this@PlaybackService, t, p.playWhenReady && p.playbackState != Player.STATE_ENDED)
      }
    }

    override fun onPlayerError(error: PlaybackException) {
      // a catalogue song still on its way to the server waits for it and plays then
      if (Instant.playbackFailed(active.currentMediaItem?.mediaId)) return
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
    val p = active
    if (p.mediaItemCount - p.currentMediaItemIndex > 3) return
    topping = true
    val have = (0 until p.mediaItemCount).map { p.getMediaItemAt(it).mediaId }
    scope.launch {
      try {
        val batch = Api.waveNext(Queue.waveMode.value, have)
        if (Queue.context.value == Queue.WAVE && batch.tracks.isNotEmpty()) {
          Queue.remember(batch.tracks)
          active.addMediaItems(batch.tracks.map { itemFor(active, it.id, mediaItemOf(it)) })
        }
      } catch (e: Exception) {
        // tried again on the next track
      } finally {
        topping = false
      }
    }
  }

  private fun liked(): Boolean {
    val id = active.currentMediaItem?.mediaId ?: return false
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

  /* ---------- the library for the car (Android Auto) ---------- */

  private fun folder(id: String, title: String, type: Int = MediaMetadata.MEDIA_TYPE_FOLDER_MIXED, art: String? = null): MediaItem =
    MediaItem.Builder().setMediaId(id).setMediaMetadata(
      MediaMetadata.Builder().setTitle(title).setIsBrowsable(true).setIsPlayable(false).setMediaType(type)
        .setArtworkUri(art?.let { Uri.parse(it) }).build(),
    ).build()

  private fun playable(id: String, title: String, subtitle: String?, art: String?): MediaItem =
    MediaItem.Builder().setMediaId(id).setMediaMetadata(
      MediaMetadata.Builder().setTitle(title).setArtist(subtitle).setIsBrowsable(false).setIsPlayable(true)
        .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC).setArtworkUri(art?.let { Uri.parse(it) }).build(),
    ).build()

  /** A track inside a list: "<list>|<track id>", so a tap plays the whole list from it. */
  private fun inList(list: String, t: Track) = playable("$list|${t.id}", t.title, t.artists, Offline.cover(t.id)?.let { "file://$it" } ?: Api.img(t.coverUrl))

  private suspend fun listTracks(list: String): List<Track> = when {
    list == "liked" -> Api.likedTracks()
    list == "recent" -> Api.history().map { it.track }.distinctBy { it.id }.take(60)
    list.startsWith("pl:") -> Api.playlist(list.removePrefix("pl:")).tracks
    else -> emptyList()
  }

  private suspend fun children(parent: String): List<MediaItem> = when (parent) {
    ROOT -> listOf(
      playable("wave:${Queue.waveMode.value}", tr("Моя волна"), tr("Музыка, подобранная для вас"), null),
      folder("moods", tr("Волна по настроению")),
      folder("liked", tr("Любимые треки"), MediaMetadata.MEDIA_TYPE_PLAYLIST),
      folder("playlists", tr("Плейлисты"), MediaMetadata.MEDIA_TYPE_FOLDER_PLAYLISTS),
      folder("recent", tr("Недавние"), MediaMetadata.MEDIA_TYPE_PLAYLIST),
    )
    "moods" -> Queue.modes.map { playable("wave:${it.id}", it.label, it.hint, null) }
    "playlists" -> Api.playlists().map { folder("pl:${it.id}", it.title, MediaMetadata.MEDIA_TYPE_PLAYLIST, Api.img(it.coverUrl ?: it.mosaic.firstOrNull())) }
    else -> listTracks(parent).map { inList(parent, it) }
  }

  private inner class Callback : MediaLibrarySession.Callback {
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
      val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS.buildUpon()
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
      val id = active.currentMediaItem?.mediaId
      if (id != null) App.scope.launch {
        runCatching { Likes.toggle("track", id) }.onFailure { App.say(it.message ?: tr("Не получилось")) }
      }
      return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
    }

    override fun onGetLibraryRoot(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, params: LibraryParams?): ListenableFuture<LibraryResult<MediaItem>> =
      Futures.immediateFuture(LibraryResult.ofItem(folder(ROOT, getString(R.string.app_name)), params))

    override fun onGetChildren(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      parentId: String,
      page: Int,
      pageSize: Int,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = scope.future {
      val all = runCatching { children(parentId) }.getOrDefault(emptyList())
      val from = (page * pageSize).coerceAtMost(all.size)
      LibraryResult.ofItemList(ImmutableList.copyOf(all.subList(from, (from + pageSize).coerceAtMost(all.size))), params)
    }

    override fun onGetItem(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, mediaId: String): ListenableFuture<LibraryResult<MediaItem>> =
      Futures.immediateFuture(
        Queue.track(mediaId.substringAfter('|'))?.let { LibraryResult.ofItem(mediaItemOf(it), null) } ?: LibraryResult.ofError(SessionResult.RESULT_ERROR_BAD_VALUE),
      )

    /**
     * The car's taps arrive as one browse item: the wave starts, or the whole list plays from the tapped track.
     * The app's own screens send tracks by id: they get their addresses again.
     */
    override fun onSetMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
      startIndex: Int,
      startPositionMs: Long,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
      val one = mediaItems.singleOrNull()?.mediaId
      if (one != null && one.startsWith("wave:")) return scope.future {
        val mode = one.removePrefix("wave:")
        val batch = runCatching { Api.waveNext(mode, emptyList()).tracks }.getOrDefault(emptyList())
        Queue.setWaveMode(mode)
        Queue.remember(batch)
        Queue.context.value = Queue.WAVE
        MediaSession.MediaItemsWithStartPosition(batch.map { itemFor(active, it.id, mediaItemOf(it)) }, 0, 0L)
      }
      if (one != null && '|' in one) return scope.future {
        val list = one.substringBefore('|')
        val tracks = runCatching { listTracks(list) }.getOrDefault(emptyList())
        Queue.remember(tracks)
        Queue.context.value = if (list.startsWith("pl:")) "playlist:${list.removePrefix("pl:")}" else list
        val start = tracks.indexOfFirst { it.id == one.substringAfter('|') }.coerceAtLeast(0)
        MediaSession.MediaItemsWithStartPosition(tracks.map { itemFor(active, it.id, mediaItemOf(it)) }, start, 0L)
      }
      return Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(resolve(mediaItems), startIndex, startPositionMs))
    }

    /** Items sent by the app's screens arrive without their address: give them the stream URL again. */
    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> = Futures.immediateFuture(resolve(mediaItems).toMutableList())
  }

  private fun resolve(items: List<MediaItem>): List<MediaItem> =
    items.map { item -> itemFor(active, item.mediaId, item.buildUpon().setUri(Api.streamUrl(item.mediaId)).build()) }
}
