package space.avthsr.music.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.common.Player
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.media3.datasource.cache.SimpleCache
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import java.io.File

/** A queue entry for a track: its saved file when it is kept offline, the server stream otherwise. */
fun mediaItemOf(t: Track): MediaItem = MediaItem.Builder()
  .setMediaId(t.id)
  .setUri(Offline.file(t.id)?.let { Uri.fromFile(File(it)) } ?: Uri.parse(Api.streamUrl(t.id)))
  .setMediaMetadata(
    MediaMetadata.Builder()
      .setTitle(t.title)
      .setArtist(t.artists)
      .setAlbumTitle(t.album?.title)
      .setArtworkUri(Offline.cover(t.id)?.let { Uri.fromFile(File(it)) } ?: Api.img(t.coverUrl)?.let { Uri.parse(it) })
      .build()
  )
  .build()

/** Saved files are read directly; everything else goes through the stream cache. */
@OptIn(UnstableApi::class)
class LocalFirstDataSourceFactory(private val local: DataSource.Factory, private val remote: DataSource.Factory) : DataSource.Factory {
  override fun createDataSource(): DataSource = Split(local.createDataSource(), remote.createDataSource())

  private class Split(private val local: DataSource, private val remote: DataSource) : DataSource {
    private var current: DataSource? = null
    override fun addTransferListener(transferListener: TransferListener) {
      local.addTransferListener(transferListener)
      remote.addTransferListener(transferListener)
    }
    override fun open(dataSpec: DataSpec): Long {
      val s = if (dataSpec.uri.scheme == "file") local else remote
      current = s
      return s.open(dataSpec)
    }
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int = current?.read(buffer, offset, length) ?: C.RESULT_END_OF_INPUT
    override fun getUri(): Uri? = current?.uri
    override fun getResponseHeaders(): Map<String, List<String>> = current?.responseHeaders ?: emptyMap()
    override fun close() {
      try { current?.close() } finally { current = null }
    }
  }
}

/** Tracks heard recently stay on the phone (up to 1 GB): replays and rewinds cost no traffic. */
@OptIn(UnstableApi::class)
object MediaCache {
  private var cache: SimpleCache? = null

  @Synchronized
  fun get(context: Context): SimpleCache = cache ?: SimpleCache(
    File(context.cacheDir, "media"),
    LeastRecentlyUsedCacheEvictor(1L shl 30),
    StandaloneDatabaseProvider(context),
  ).also { cache = it }
}

/**
 * The next two songs of the queue are fetched ahead into the stream cache, so they start at once and
 * without a gap: whole on Wi-Fi, their first two megabytes on mobile data.
 */
@OptIn(UnstableApi::class)
object Prefetch {
  private var job: Job? = null
  private var last: List<String> = emptyList()

  fun ahead(scope: CoroutineScope, data: CacheDataSource.Factory, player: Player) {
    val from = player.currentMediaItemIndex
    val uris = (1..2).mapNotNull { k ->
      val i = from + k
      if (i in 0 until player.mediaItemCount) player.getMediaItemAt(i).localConfiguration?.uri else null
    }.filter { (it.scheme == "http" || it.scheme == "https") && it.path?.contains("/catalog/") != true }
    val keys = uris.map { it.path ?: it.toString() }
    if (keys == last && job?.isActive == true) return
    last = keys
    job?.cancel()
    if (uris.isEmpty()) return
    val whole = Net.unmetered.value
    job = scope.launch(Dispatchers.IO) {
      for (u in uris) {
        if (!isActive) break
        val spec = DataSpec.Builder().setUri(u).setKey(u.path ?: u.toString())
          .apply { if (!whole) setLength(2L shl 20) }.build()
        val writer = CacheWriter(data.createDataSource(), spec, null, null)
        val stop = coroutineContext[Job]?.invokeOnCompletion { writer.cancel() }
        runCatching { writer.cache() }
        stop?.dispose()
      }
    }
  }
}
