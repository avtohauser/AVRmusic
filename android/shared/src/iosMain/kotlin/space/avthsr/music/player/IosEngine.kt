@file:OptIn(ExperimentalForeignApi::class)

// The shared player's engine on iOS: one AVPlayer with the queue kept here (shuffle order, repeat), the
// lock screen / Control Center player with ♥, background audio, play reports and "My Wave" topping up
// itself — what PlaybackService does on Android.
package space.avthsr.music.player

import io.ktor.client.request.get
import io.ktor.client.statement.readRawBytes
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.useContents
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import platform.AVFAudio.*
import platform.AVFoundation.*
import platform.CoreMedia.CMTimeGetSeconds
import platform.CoreMedia.CMTimeMakeWithSeconds
import platform.Foundation.NSFileManager
import platform.Foundation.NSNotificationCenter
import platform.Foundation.NSNumber
import platform.Foundation.NSOperationQueue
import platform.Foundation.NSURL
import platform.MediaPlayer.*
import platform.UIKit.UIImage
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.Likes
import space.avthsr.music.api.Track
import space.avthsr.music.toByteArray
import space.avthsr.music.toNSData
import space.avthsr.music.tr

class IosEngine : PlayerEngine {
  override var onChange: ((Boolean) -> Unit)? = null

  // a queue player: the next track waits loaded behind the current one, so one runs into the next without a gap
  private val player = AVQueuePlayer()
  /** the item of the current track, and the next one prepared behind it */
  private var loadedItem: AVPlayerItem? = null
  private var upcoming: AVPlayerItem? = null
  private var upcomingKey: String? = null
  private var upcomingIndex = -1
  private val items = mutableListOf<Track>()
  /** queue indices in the order they play */
  private var orderList = mutableListOf<Int>()
  /** where in [orderList] the current track is */
  private var pos = -1
  private var prepared = false
  private var ended = false
  private var wantPlay = false
  private var shuffleOn = false
  private var repeatMode = Repeat.OFF
  private var rate = 1f

  // play reports: the current track and how long it has actually been heard
  private var currentId: String? = null
  private var playedMs = 0L
  private var playingSince = 0L
  private var wasPlaying = false
  private var topping = false
  private var failedItem: AVPlayerItem? = null
  private var lastSnapshot = ""

  private var artwork: MPMediaItemArtwork? = null
  private var artworkFor: String? = null

  init {
    runCatching {
      val s = AVAudioSession.sharedInstance()
      s.setCategory(AVAudioSessionCategoryPlayback, error = null)
      s.setActive(true, error = null)
    }
    NSNotificationCenter.defaultCenter.addObserverForName(AVPlayerItemDidPlayToEndTimeNotification, null, NSOperationQueue.mainQueue) { note ->
      if (note?.`object` == loadedItem) onEnded()
    }
    remote()
    App.scope.launch {
      var n = 0
      while (true) {
        delay(100)
        volumeTick()
        if (n++ % 5 == 0) tick()
      }
    }
    App.scope.launch { Likes.tracks.collect { showLike() } }
  }

  /* ---------- state ---------- */

  override val count get() = items.size
  override fun trackAt(i: Int): Track = items[i]
  override val index get() = orderList.getOrNull(pos) ?: -1
  override val isPlaying get() = player.timeControlStatus == AVPlayerTimeControlStatusPlaying
  override val playWhenReady get() = wantPlay
  override val isBuffering get() = wantPlay && !ended && player.timeControlStatus == AVPlayerTimeControlStatusWaitingToPlayAtSpecifiedRate
  override val isIdle get() = !prepared
  override val isEnded get() = ended
  override var shuffle: Boolean
    get() = shuffleOn
    set(v) {
      shuffleOn = v
      rebuildOrder()
      changed(true)
    }
  override var repeat: Int
    get() = repeatMode
    set(v) { repeatMode = v; changed(false) }
  override val durationMs: Long
    get() {
      val d = player.currentItem?.duration?.let { CMTimeGetSeconds(it) } ?: return 0
      return if (d.isFinite() && d > 0) (d * 1000).toLong() else 0
    }
  override val positionMs: Long
    get() {
      val s = CMTimeGetSeconds(player.currentTime())
      return if (s.isFinite() && s > 0) (s * 1000).toLong() else 0
    }
  override var speed: Float
    get() = rate
    set(v) {
      rate = v
      if (wantPlay && !ended) player.rate = v
      nowPlaying()
    }

  override fun order(): List<Int> = orderList.toList()

  private fun changed(queue: Boolean) {
    onChange?.invoke(queue)
    nowPlaying()
  }

  private fun rebuildOrder() {
    val cur = index
    val all = items.indices.toList()
    if (shuffleOn && cur >= 0) {
      orderList = (listOf(cur) + (all - cur).shuffled()).toMutableList()
      pos = 0
    } else if (shuffleOn) {
      orderList = all.shuffled().toMutableList()
      pos = if (orderList.isEmpty()) -1 else 0
    } else {
      orderList = all.toMutableList()
      pos = cur.coerceAtMost(items.size - 1)
    }
  }

  /* ---------- playing ---------- */

  /** Puts the track at [pos] into the player (the saved file when it is kept offline). */
  private fun load() {
    val t = items.getOrNull(index)
    flushPlay()
    dropUpcoming()
    player.removeAllItems()
    if (t == null) {
      loadedItem = null
      currentId = null
      changed(true)
      return
    }
    val item = AVPlayerItem(uRL = urlFor(t))
    player.actionAtItemEnd = AVPlayerActionAtItemEndPause
    player.insertItem(item, afterItem = null)
    loadedItem = item
    prepared = true
    ended = false
    currentId = t.id
    playingSince = 0
    if (wantPlay) player.rate = rate
    loadArtwork(t)
    showLike()
    topUpWave()
    changed(false)
    ensureUpcoming()
  }

  private fun urlFor(t: Track): NSURL = Offline.file(t.id)?.let { NSURL.fileURLWithPath(it) } ?: NSURL(string = Api.streamUrl(t.id))

  /** The queue index that plays after the current one, if any. */
  private fun desiredNext(): Int? = when {
    repeatMode == Repeat.ONE -> null
    pos + 1 < orderList.size -> orderList[pos + 1]
    repeatMode == Repeat.ALL && orderList.size > 1 -> orderList[0]
    else -> null
  }

  private fun dropUpcoming() {
    upcoming?.let { runCatching { player.removeItem(it) } }
    upcoming = null
    upcomingKey = null
    upcomingIndex = -1
  }

  /** Keeps the next track loaded behind the current one (after any change of the queue, shuffle or repeat). */
  private fun ensureUpcoming() {
    val cur = loadedItem ?: return
    if (player.currentItem !== cur) return
    val want = desiredNext()
    val key = want?.let { "$it:${items[it].id}" }
    if (key == upcomingKey) return
    dropUpcoming()
    if (want != null) {
      val item = AVPlayerItem(uRL = urlFor(items[want]))
      if (player.canInsertItem(item, afterItem = cur)) {
        player.insertItem(item, afterItem = cur)
        upcoming = item
        upcomingKey = key
        upcomingIndex = want
      }
    }
    player.actionAtItemEnd = if (upcoming != null) AVPlayerActionAtItemEndAdvance else AVPlayerActionAtItemEndPause
  }

  override fun setTracks(tracks: List<Track>, start: Int) {
    items.clear()
    items.addAll(tracks)
    orderList = items.indices.toMutableList()
    pos = start.coerceIn(-1, items.size - 1)
    if (shuffleOn) rebuildOrder()
    onChange?.invoke(true)
    load()
  }

  override fun prepare() {
    if (prepared) return
    prepared = true
    load()
  }

  override fun play() {
    // a sleep timer whose time came while paused is over
    if (Gain.sleepDue(Platform.nowMs())) Gain.sleepAt.value = null
    wantPlay = true
    if (!prepared) load()
    player.rate = rate
    changed(false)
  }

  override fun pause() {
    wantPlay = false
    player.pause()
    changed(false)
  }

  override fun seekTo(ms: Long) {
    player.seekToTime(CMTimeMakeWithSeconds(ms / 1000.0, 1000))
    if (ended) { ended = false; if (wantPlay) player.rate = rate }
    changed(false)
  }

  override fun seekToDefault(index: Int) {
    val p = orderList.indexOf(index)
    if (p < 0) return
    pos = p
    load()
  }

  private fun go(p: Int) {
    pos = p
    load()
  }

  override fun next() {
    if (orderList.isEmpty()) return
    when {
      pos + 1 < orderList.size -> go(pos + 1)
      repeatMode == Repeat.ALL -> go(0)
    }
  }

  override fun previous() {
    if (positionMs > 3000 || orderList.isEmpty()) return seekTo(0)
    when {
      pos > 0 -> go(pos - 1)
      repeatMode == Repeat.ALL -> go(orderList.size - 1)
      else -> seekTo(0)
    }
  }

  override fun previousTrack() {
    when {
      pos > 0 -> go(pos - 1)
      repeatMode == Repeat.ALL && orderList.isNotEmpty() -> go(orderList.size - 1)
    }
  }

  private fun onEnded() {
    // the sleep timer "at the end of the track": the next one is put in but does not start
    if (Gain.sleepAtTrackEnd.value) { wantPlay = false; player.pause(); Gain.slept() }
    val next = upcoming
    if (next != null && repeatMode != Repeat.ONE) {
      // the queue player went on to the prepared track by itself, without a gap
      if (player.currentItem !== next) player.advanceToNextItem()
      flushPlay()
      val p = orderList.indexOf(upcomingIndex)
      pos = if (p >= 0) p else (pos + 1).coerceAtMost(orderList.size - 1)
      loadedItem = next
      upcoming = null
      upcomingKey = null
      upcomingIndex = -1
      val t = items.getOrNull(index)
      currentId = t?.id
      ended = false
      playingSince = 0
      if (wantPlay) player.rate = rate else player.pause()
      t?.let { loadArtwork(it) }
      showLike()
      topUpWave()
      changed(false)
      ensureUpcoming()
      return
    }
    when {
      repeatMode == Repeat.ONE -> { seekTo(0); if (wantPlay) player.rate = rate }
      pos + 1 < orderList.size -> go(pos + 1)
      repeatMode == Repeat.ALL && orderList.isNotEmpty() -> go(0)
      else -> { flushPlay(); ended = true; changed(false) }
    }
  }

  /* ---------- queue editing ---------- */

  private fun remap(f: (Int) -> Int) {
    orderList = orderList.map(f).toMutableList()
  }

  override fun move(from: Int, to: Int) {
    if (from == to || from !in items.indices || to !in items.indices) return
    items.add(to, items.removeAt(from))
    remap { i ->
      when {
        i == from -> to
        from < to && i in (from + 1)..to -> i - 1
        from > to && i in to until from -> i + 1
        else -> i
      }
    }
    if (!shuffleOn) { val cur = index; orderList = items.indices.toMutableList(); pos = cur }
    onChange?.invoke(true)
  }

  private fun removeOne(i: Int): Boolean {
    val cur = index
    items.removeAt(i)
    val p = orderList.indexOf(i)
    if (p >= 0) {
      orderList.removeAt(p)
      if (p < pos) pos--
    }
    remap { if (it > i) it - 1 else it }
    return i == cur
  }

  override fun remove(index: Int) = removeRange(index, index + 1)

  override fun removeRange(from: Int, to: Int) {
    var currentGone = false
    for (i in (to - 1) downTo from) if (i in items.indices && removeOne(i)) currentGone = true
    if (items.isEmpty()) { pos = -1; stop(); onChange?.invoke(true); return }
    if (currentGone) {
      if (pos >= orderList.size) { pos = orderList.size - 1; ended = true }
      onChange?.invoke(true)
      load()
    } else onChange?.invoke(true)
  }

  override fun insert(at: Int, tracks: List<Track>) {
    if (tracks.isEmpty()) return
    val where = at.coerceIn(0, items.size)
    val cur = index
    items.addAll(where, tracks)
    remap { if (it >= where) it + tracks.size else it }
    val added = (where until where + tracks.size).toList()
    if (shuffleOn) {
      // "play next" plays next even when shuffled; anything else goes to the end
      if (cur >= 0 && where == cur + 1) orderList.addAll(pos + 1, added) else orderList.addAll(added)
    } else {
      orderList = items.indices.toMutableList()
      pos = if (cur >= 0) (if (cur >= where) cur + tracks.size else cur) else pos
    }
    if (pos < 0) { pos = 0; onChange?.invoke(true); load() } else changed(true)
  }

  override fun append(tracks: List<Track>) = insert(items.size, tracks)

  override fun stop() {
    flushPlay()
    wantPlay = false
    player.pause()
    dropUpcoming()
    player.removeAllItems()
    loadedItem = null
    prepared = false
    changed(false)
  }

  override fun clear() {
    items.clear()
    orderList.clear()
    pos = -1
    currentId = null
    changed(true)
  }

  /* ---------- reports, wave, lock screen ---------- */

  /** Fades, normalization and the sleep timer, several times a second while playing. */
  private fun volumeTick() {
    if (!isPlaying) return
    if (Gain.sleepDue(Platform.nowMs())) { pause(); Gain.slept() }
    Alarm.rise()
    val v = Gain.volume(items.getOrNull(index), positionMs, durationMs)
    if (kotlin.math.abs(player.volume - v) > 0.005f) player.volume = v
  }

  private fun tick() {
    ensureUpcoming()
    val item = player.currentItem
    if (item != null && item.status == AVPlayerItemStatusFailed && failedItem != item) {
      failedItem = item
      App.say(tr("Не удалось воспроизвести трек ({})", item.error?.localizedDescription ?: "AVPlayer"))
    }
    val playing = isPlaying
    if (playing != wasPlaying) {
      val now = Platform.nowMs()
      if (playing) playingSince = now else if (playingSince > 0) { playedMs += now - playingSince; playingSince = 0 }
      wasPlaying = playing
    }
    NowReport.update(currentId, positionMs, wantPlay && !ended)
    val snap = "$playing ${isBuffering} ${durationMs / 1000}"
    if (snap != lastSnapshot) {
      lastSnapshot = snap
      changed(false)
    }
  }

  /** Reports how long the track that just ended or was skipped was heard (5 s or more). */
  private fun flushPlay() {
    val id = currentId ?: return
    if (playingSince > 0) {
      val now = Platform.nowMs()
      playedMs += now - playingSince
      playingSince = if (isPlaying) now else 0
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
    if (items.size - index > 3) return
    topping = true
    val have = items.map { it.id }
    App.scope.launch {
      try {
        val batch = Api.waveNext(Queue.waveMode.value, have)
        if (Queue.context.value == Queue.WAVE && batch.tracks.isNotEmpty()) {
          Queue.remember(batch.tracks)
          append(batch.tracks)
        }
      } catch (e: Exception) {
        // tried again on the next track
      } finally {
        topping = false
      }
    }
  }

  private fun loadArtwork(t: Track) {
    if (artworkFor == t.id) return
    artwork = null
    artworkFor = t.id
    App.scope.launch {
      val bytes = runCatching {
        Offline.cover(t.id)?.let { NSFileManager.defaultManager.contentsAtPath(it)?.toByteArray() }
          ?: Api.img(t.coverUrl)?.let { Api.http.get(it).readRawBytes() }
      }.getOrNull() ?: return@launch
      val image = UIImage(data = bytes.toNSData())
      if (artworkFor != t.id) return@launch
      artwork = MPMediaItemArtwork(boundsSize = image.size) { _ -> image }
      nowPlaying()
    }
  }

  private fun nowPlaying() {
    val t = items.getOrNull(index)
    val center = MPNowPlayingInfoCenter.defaultCenter()
    if (t == null) { center.nowPlayingInfo = null; return }
    val info = mutableMapOf<Any?, Any?>(
      MPMediaItemPropertyTitle to t.title,
      MPMediaItemPropertyArtist to t.artists,
      MPMediaItemPropertyPlaybackDuration to NSNumber(double = durationMs / 1000.0),
      MPNowPlayingInfoPropertyElapsedPlaybackTime to NSNumber(double = positionMs / 1000.0),
      MPNowPlayingInfoPropertyPlaybackRate to NSNumber(double = if (isPlaying) rate.toDouble() else 0.0),
    )
    t.album?.title?.let { info[MPMediaItemPropertyAlbumTitle] = it }
    if (artworkFor == t.id) artwork?.let { info[MPMediaItemPropertyArtwork] = it }
    center.nowPlayingInfo = info
  }

  private fun showLike() {
    val liked = currentId?.let { it in Likes.tracks.value } == true
    MPRemoteCommandCenter.sharedCommandCenter().likeCommand.setActive(liked)
  }

  private fun remote() {
    val c = MPRemoteCommandCenter.sharedCommandCenter()
    val ok = MPRemoteCommandHandlerStatusSuccess
    c.playCommand.addTargetWithHandler { _ -> play(); ok }
    c.pauseCommand.addTargetWithHandler { _ -> pause(); ok }
    c.togglePlayPauseCommand.addTargetWithHandler { _ -> if (isPlaying) pause() else play(); ok }
    c.nextTrackCommand.addTargetWithHandler { _ -> next(); ok }
    c.previousTrackCommand.addTargetWithHandler { _ -> previous(); ok }
    c.changePlaybackPositionCommand.addTargetWithHandler { e ->
      (e as? MPChangePlaybackPositionCommandEvent)?.let { seekTo((it.positionTime * 1000).toLong()) }
      ok
    }
    c.likeCommand.setEnabled(true)
    c.likeCommand.setLocalizedTitle(tr("В избранное"))
    c.likeCommand.setLocalizedShortTitle(tr("В избранное"))
    c.likeCommand.addTargetWithHandler { _ ->
      val id = currentId
      if (id != null) App.scope.launch {
        runCatching { Likes.toggle("track", id) }.onFailure { App.say(it.message ?: tr("Не получилось")) }
      }
      ok
    }
  }
}
