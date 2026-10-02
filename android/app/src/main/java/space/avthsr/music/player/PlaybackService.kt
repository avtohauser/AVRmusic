// The player. ExoPlayer holds the whole queue inside a Media3 session service, so Android shows the
// regular media player in the notification shade and on the lock screen — previous, play/pause, next
// and ♥ "Add to favourites" — and music keeps playing with the screen off or the app closed.
// "My Wave" is topped up here as it plays, and every play is reported to the server for the stats.
package space.avthsr.music.player

import android.app.PendingIntent
import android.content.Intent
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
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
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
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  /** Swiped away from the recent apps: keep playing if music is on, otherwise go. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!player.playWhenReady || player.mediaItemCount == 0) stopSelf()
  }

  override fun onDestroy() {
    flushPlay()
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
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      flushPlay()
      currentId = mediaItem?.mediaId
      playingSince = if (player.isPlaying) SystemClock.elapsedRealtime() else 0
      showLike()
      topUpWave()
    }

    override fun onPlayerError(error: PlaybackException) {
      App.say("Не удалось воспроизвести трек (${error.errorCodeName})")
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
        runCatching { Likes.toggle("track", id) }.onFailure { App.say(it.message ?: "Не получилось") }
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
