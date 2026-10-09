// The NewPipe engine (NewPipeExtractor) behind one small API: search, suggestions, trending, a video with its
// streams, a channel, a playlist, comments — already in avrtube's own shapes. The Android app calls it on the
// phone (the streams then come straight from YouTube to the phone); the server calls it for the iPhone.
package space.avthsr.tube.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.Image
import org.schabi.newpipe.extractor.InfoItem
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.Page
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.channel.ChannelInfo
import org.schabi.newpipe.extractor.channel.ChannelInfoItem
import org.schabi.newpipe.extractor.channel.tabs.ChannelTabInfo
import org.schabi.newpipe.extractor.channel.tabs.ChannelTabs
import org.schabi.newpipe.extractor.comments.CommentsInfo
import org.schabi.newpipe.extractor.comments.CommentsInfoItem
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.kiosk.KioskInfo
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.playlist.PlaylistInfo
import org.schabi.newpipe.extractor.playlist.PlaylistInfoItem
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import org.schabi.newpipe.extractor.stream.StreamType
import space.avthsr.tube.model.TubeChannel
import space.avthsr.tube.model.TubeChapter
import space.avthsr.tube.model.TubeComment
import space.avthsr.tube.model.TubeComments
import space.avthsr.tube.model.TubeItem
import space.avthsr.tube.model.TubePage
import space.avthsr.tube.model.TubePlaylist
import space.avthsr.tube.model.TubeStream
import space.avthsr.tube.model.TubeVideo
import java.util.Base64
import java.util.concurrent.TimeUnit

/** What a desktop browser says it is (YouTube answers browsers best). */
const val BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"

/** NewPipe's network goes through OkHttp. */
class OkDownloader(private val client: OkHttpClient) : Downloader() {
  override fun execute(request: Request): Response {
    val data = request.dataToSend()
    val body = data?.toRequestBody() ?: if (request.httpMethod() == "POST") ByteArray(0).toRequestBody() else null
    val b = okhttp3.Request.Builder().url(request.url()).method(request.httpMethod(), body).header("User-Agent", BROWSER_UA)
    for ((name, values) in request.headers()) {
      b.removeHeader(name)
      values.forEach { b.addHeader(name, it) }
    }
    client.newCall(b.build()).execute().use { r ->
      if (r.code == 429) throw ReCaptchaException("YouTube asks to prove this is not a robot", request.url())
      return Response(r.code, r.message, r.headers.toMultimap(), r.body?.string(), r.request.url.toString())
    }
  }
}

object Tube {
  private val yt get() = ServiceList.YouTube
  @Volatile private var ready = false

  fun init(
    client: OkHttpClient = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build(),
    language: String = "ru",
    country: String = "RU",
  ) {
    if (ready) return
    synchronized(this) {
      if (ready) return
      NewPipe.init(OkDownloader(client), Localization(language, country), ContentCountry(country))
      ready = true
    }
  }

  /* ---------- lists ---------- */

  fun search(query: String, next: String? = null): TubePage {
    val handler = yt.searchQHFactory.fromQuery(query, emptyList(), "")
    return if (next == null) {
      val info = SearchInfo.getInfo(yt, handler)
      page(info.relatedItems, info.nextPage)
    } else {
      val more = SearchInfo.getMoreItems(yt, handler, decode(next))
      page(more.items, more.nextPage)
    }
  }

  fun suggest(query: String): List<String> = yt.suggestionExtractor.suggestionList(query)

  /** What YouTube shows as popular now (its default list). */
  fun trending(): TubePage {
    val extractor = yt.kioskList.defaultKioskExtractor
    extractor.fetchPage()
    val info = KioskInfo.getInfo(extractor)
    return page(info.relatedItems, info.nextPage)
  }

  /* ---------- one video ---------- */

  fun video(idOrUrl: String): TubeVideo {
    val i = StreamInfo.getInfo(yt, watchUrl(idOrUrl))
    val direct = { m: DeliveryMethod -> m == DeliveryMethod.PROGRESSIVE_HTTP }
    val streams = buildList {
      i.videoStreams.filter { it.isUrl && direct(it.deliveryMethod) }.forEach {
        add(TubeStream(it.content, "muxed", it.format?.mimeType, it.resolution, it.height, it.bitrate, it.itag, it.codec))
      }
      i.videoOnlyStreams.filter { it.isUrl && direct(it.deliveryMethod) }.forEach {
        add(TubeStream(it.content, "video", it.format?.mimeType, it.resolution, it.height, it.bitrate, it.itag, it.codec))
      }
      i.audioStreams.filter { it.isUrl && direct(it.deliveryMethod) }.forEach {
        add(TubeStream(it.content, "audio", it.format?.mimeType, null, 0, it.averageBitrate, it.itag, it.codec, it.audioTrackName))
      }
    }
    return TubeVideo(
      id = i.id,
      url = i.url,
      title = i.name,
      description = i.description?.content.orEmpty(),
      author = i.uploaderName,
      authorUrl = i.uploaderUrl,
      authorAvatar = best(i.uploaderAvatars),
      subscribers = i.uploaderSubscriberCount,
      views = i.viewCount,
      likes = i.likeCount,
      published = i.textualUploadDate ?: i.uploadDate?.offsetDateTime()?.toString(),
      durationSec = i.duration,
      thumbnail = best(i.thumbnails),
      live = i.streamType == StreamType.LIVE_STREAM || i.streamType == StreamType.AUDIO_LIVE_STREAM,
      hls = i.hlsUrl?.takeIf { it.isNotBlank() },
      dash = i.dashMpdUrl?.takeIf { it.isNotBlank() },
      streams = streams,
      related = i.relatedItems.mapNotNull(::item),
      chapters = i.streamSegments.map { TubeChapter(it.title, it.startTimeSeconds) },
    )
  }

  /* ---------- channels, playlists, comments ---------- */

  fun channel(idOrUrl: String, next: String? = null): TubeChannel {
    val c = ChannelInfo.getInfo(yt, channelUrl(idOrUrl))
    val tab = c.tabs.firstOrNull { ChannelTabs.VIDEOS in it.contentFilters } ?: c.tabs.firstOrNull()
    val videos = when {
      tab == null -> TubePage()
      next == null -> ChannelTabInfo.getInfo(yt, tab).let { page(it.relatedItems, it.nextPage) }
      else -> ChannelTabInfo.getMoreItems(yt, tab, decode(next)).let { page(it.items, it.nextPage) }
    }
    return TubeChannel(c.id, c.url, c.name, best(c.avatars), best(c.banners), c.subscriberCount, c.description, videos)
  }

  fun playlist(idOrUrl: String, next: String? = null): TubePlaylist {
    val url = if (idOrUrl.startsWith("http")) idOrUrl else "https://www.youtube.com/playlist?list=$idOrUrl"
    val p = PlaylistInfo.getInfo(yt, url)
    val videos = if (next == null) page(p.relatedItems, p.nextPage)
    else PlaylistInfo.getMoreItems(yt, url, decode(next)).let { page(it.items, it.nextPage) }
    return TubePlaylist(p.id, p.url, p.name, p.uploaderName, best(p.thumbnails), p.streamCount, videos)
  }

  fun comments(idOrUrl: String, next: String? = null): TubeComments {
    val url = watchUrl(idOrUrl)
    if (next != null) {
      val more = CommentsInfo.getMoreItems(yt, url, decode(next))
      return TubeComments(more.items.map(::comment), more.nextPage?.let(::encode))
    }
    val info = CommentsInfo.getInfo(yt, url) ?: return TubeComments(disabled = true)
    if (info.isCommentsDisabled) return TubeComments(disabled = true)
    return TubeComments(info.relatedItems.map(::comment), info.nextPage?.let(::encode))
  }

  /* ---------- shapes ---------- */

  private fun watchUrl(idOrUrl: String) = if (idOrUrl.startsWith("http")) idOrUrl else "https://www.youtube.com/watch?v=$idOrUrl"

  private fun channelUrl(idOrUrl: String) = when {
    idOrUrl.startsWith("http") -> idOrUrl
    idOrUrl.startsWith("@") -> "https://www.youtube.com/$idOrUrl"
    else -> "https://www.youtube.com/channel/$idOrUrl"
  }

  /** The biggest picture of a set. */
  fun best(images: List<Image>?): String? = images?.maxByOrNull { if (it.height > 0) it.height else it.width }?.url

  private fun page(items: List<InfoItem>, next: Page?) = TubePage(items.mapNotNull(::item), next?.let(::encode))

  fun item(i: InfoItem): TubeItem? = when (i) {
    is StreamInfoItem -> TubeItem(
      kind = "video", id = idOf(i.url), url = i.url, title = i.name, author = i.uploaderName, authorUrl = i.uploaderUrl,
      authorAvatar = best(i.uploaderAvatars), thumbnail = best(i.thumbnails), durationSec = i.duration, views = i.viewCount,
      published = i.textualUploadDate, live = i.streamType == StreamType.LIVE_STREAM, shorts = i.isShortFormContent,
    )
    is ChannelInfoItem -> TubeItem(
      kind = "channel", id = i.url.substringAfterLast('/'), url = i.url, title = i.name, thumbnail = best(i.thumbnails),
      subscribers = i.subscriberCount, count = i.streamCount,
    )
    is PlaylistInfoItem -> TubeItem(
      kind = "playlist", id = i.url.substringAfter("list=", i.url.substringAfterLast('/')).substringBefore('&'), url = i.url,
      title = i.name, author = i.uploaderName, thumbnail = best(i.thumbnails), count = i.streamCount,
    )
    else -> null
  }

  private fun comment(c: CommentsInfoItem) = TubeComment(
    author = c.uploaderName, authorAvatar = best(c.uploaderAvatars), text = c.commentText?.content.orEmpty(),
    likes = c.likeCount.toLong(), published = c.textualUploadDate, pinned = c.isPinned, replies = c.replyCount,
  )

  private fun idOf(url: String) = url.substringAfter("v=", url.substringAfterLast('/')).substringBefore('&').substringBefore('?')

  /* ---------- the "next page" token: NewPipe's Page, as text ---------- */

  @Serializable
  private data class PageToken(val url: String? = null, val id: String? = null, val ids: List<String>? = null, val cookies: Map<String, String>? = null, val body: String? = null)

  private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

  private fun encode(p: Page): String {
    val t = PageToken(p.url, p.id, p.ids, p.cookies, p.body?.let { Base64.getEncoder().encodeToString(it) })
    return Base64.getUrlEncoder().withoutPadding().encodeToString(json.encodeToString(PageToken.serializer(), t).toByteArray())
  }

  private fun decode(s: String): Page {
    val t = json.decodeFromString(PageToken.serializer(), String(Base64.getUrlDecoder().decode(s)))
    return Page(t.url, t.id, t.ids, t.cookies, t.body?.let { Base64.getDecoder().decode(it) })
  }
}
