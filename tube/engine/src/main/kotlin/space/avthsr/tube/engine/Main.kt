// avrtube's server: the NewPipe engine over HTTP for the iPhone (Java does not run there), next to avr music.
// The music server forwards /api/tube/* here after checking who asks; the streams go through a signed proxy,
// because YouTube ties a stream's address to the address that asked for it.
package space.avthsr.tube.engine

import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.utils.io.ByteWriteChannel
import io.ktor.utils.io.writeFully
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import org.slf4j.LoggerFactory
import space.avthsr.tube.core.BROWSER_UA
import space.avthsr.tube.core.Tube
import space.avthsr.tube.model.TubeVideo
import java.net.URI
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

private val log = LoggerFactory.getLogger("space.avthsr.tube")

@Serializable
private data class Problem(val error: String)

fun main() {
  Tube.init(language = System.getenv("TUBE_LANGUAGE") ?: "ru", country = System.getenv("TUBE_COUNTRY") ?: "RU")
  val port = System.getenv("PORT")?.toIntOrNull() ?: 8090
  log.info("avrtube engine on :$port")
  embeddedServer(Netty, port = port, host = System.getenv("HOST") ?: "0.0.0.0") { module() }.start(wait = true)
}

/** A few minutes of memory for what was just asked (a video page opens, then its streams are asked for). */
private object Cache {
  private class Entry(val at: Long, val value: Any)
  private val map = ConcurrentHashMap<String, Entry>()
  @Suppress("UNCHECKED_CAST")
  suspend fun <T : Any> get(key: String, ttlMs: Long, load: () -> T): T {
    val now = System.currentTimeMillis()
    map[key]?.let { if (now - it.at < ttlMs) return it.value as T }
    val v = withContext(Dispatchers.IO) { load() }
    if (map.size > 2000) map.entries.removeIf { now - it.value.at > ttlMs }
    map[key] = Entry(now, v)
    return v
  }
}

fun Application.module() {
  install(ContentNegotiation) { json(Json { encodeDefaults = true; explicitNulls = false }) }
  install(StatusPages) {
    exception<IllegalArgumentException> { call, e -> call.respond(HttpStatusCode.BadRequest, Problem(e.message ?: "bad request")) }
    exception<Throwable> { call, e ->
      log.warn("{} failed: {}", call.request.local.uri, e.toString())
      call.respond(HttpStatusCode.BadGateway, Problem(e.message ?: e::class.simpleName ?: "error"))
    }
  }
  val minute = 60_000L
  routing {
    get("/health") { call.respondText("ok") }
    get("/search") {
      val q = requireNotNull(call.parameters["q"]?.takeIf { it.isNotBlank() }) { "q is empty" }
      val next = call.parameters["next"]
      call.respond(Cache.get("s|$q|$next", 10 * minute) { Tube.search(q, next) })
    }
    get("/suggest") {
      val q = call.parameters["q"].orEmpty()
      call.respond(if (q.isBlank()) emptyList() else Cache.get("q|$q", 30 * minute) { Tube.suggest(q) })
    }
    get("/trending") { call.respond(Cache.get("t", 30 * minute) { Tube.trending() }) }
    get("/video/{id}") {
      val id = call.parameters["id"]!!
      val v = Cache.get("v|$id", 4 * minute) { Tube.video(id) }
      // the iPhone plays through the proxy; the phone that runs the engine itself never asks here
      call.respond(if (call.parameters["direct"] == "1") v else Proxy.wrap(v))
    }
    get("/channel/{id}") {
      val id = call.parameters["id"]!!
      val next = call.parameters["next"]
      call.respond(Cache.get("c|$id|$next", 10 * minute) { Tube.channel(id, next) })
    }
    get("/playlist/{id}") {
      val id = call.parameters["id"]!!
      val next = call.parameters["next"]
      call.respond(Cache.get("p|$id|$next", 10 * minute) { Tube.playlist(id, next) })
    }
    get("/comments/{id}") {
      val id = call.parameters["id"]!!
      val next = call.parameters["next"]
      call.respond(Cache.get("m|$id|$next", 10 * minute) { Tube.comments(id, next) })
    }
    get("/proxy") { Proxy.serve(call) }
  }
}

/**
 * The streams' proxy. Only addresses this server signed itself (in a video's answer) pass, only to YouTube's
 * own hosts, and only for a few hours; HLS playlists are rewritten so their parts come through here too.
 */
object Proxy {
  private val secret = (System.getenv("TUBE_PROXY_SECRET")?.takeIf { it.length >= 16 } ?: java.util.UUID.randomUUID().toString()).toByteArray()
  private val base = (System.getenv("TUBE_PUBLIC_BASE") ?: "/api/tube").trimEnd('/')
  private val hosts = Regex("""(^|\.)(googlevideo\.com|youtube\.com|ytimg\.com|ggpht\.com|googleusercontent\.com)$""")
  private const val TTL_SEC = 6 * 3600L
  private val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()

  private fun b64(b: ByteArray) = Base64.getUrlEncoder().withoutPadding().encodeToString(b)
  private fun sign(u: String, exp: Long): String {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(secret, "HmacSHA256"))
    return b64(mac.doFinal("$exp|$u".toByteArray()))
  }

  fun url(u: String): String {
    val exp = System.currentTimeMillis() / 1000 + TTL_SEC
    return "$base/proxy?u=${b64(u.toByteArray())}&e=$exp&s=${sign(u, exp)}"
  }

  fun wrap(v: TubeVideo): TubeVideo = v.copy(
    hls = v.hls?.let(::url),
    dash = v.dash?.let(::url),
    streams = v.streams.map { it.copy(url = url(it.url)) },
  )

  suspend fun serve(call: ApplicationCall) {
    val u = call.parameters["u"]?.let { runCatching { String(Base64.getUrlDecoder().decode(it)) }.getOrNull() }
    val exp = call.parameters["e"]?.toLongOrNull()
    val s = call.parameters["s"]
    if (u == null || exp == null || s == null || exp < System.currentTimeMillis() / 1000 ||
      !MessageDigest.isEqual(sign(u, exp).toByteArray(), s.toByteArray())) {
      call.respond(HttpStatusCode.Forbidden, Problem("not signed")); return
    }
    val host = runCatching { URI(u).host }.getOrNull()
    if (host == null || !hosts.containsMatchIn(host)) { call.respond(HttpStatusCode.Forbidden, Problem("not allowed")); return }

    val req = okhttp3.Request.Builder().url(u).header("User-Agent", BROWSER_UA)
    call.request.headers[HttpHeaders.Range]?.let { req.header("Range", it) }
    val r = withContext(Dispatchers.IO) { client.newCall(req.build()).execute() }
    val type = r.header("Content-Type")
    // an HLS playlist: every address in it goes through the proxy as well
    if (type?.contains("mpegurl", ignoreCase = true) == true || u.contains(".m3u8")) {
      val text = withContext(Dispatchers.IO) { r.use { it.body?.string().orEmpty() } }
      call.respondText(rewrite(text, u), ContentType.parse("application/vnd.apple.mpegurl"), HttpStatusCode.fromValue(r.code))
      return
    }
    try {
      call.respond(object : OutgoingContent.WriteChannelContent() {
        override val status = HttpStatusCode.fromValue(r.code)
        override val contentType = type?.let { runCatching { ContentType.parse(it) }.getOrNull() }
        override val contentLength = r.body?.contentLength()?.takeIf { it >= 0 }
        override val headers = Headers.build {
          r.header("Content-Range")?.let { append(HttpHeaders.ContentRange, it) }
          append(HttpHeaders.AcceptRanges, "bytes")
          append(HttpHeaders.CacheControl, "no-store")
        }
        override suspend fun writeTo(channel: ByteWriteChannel) {
          r.use { resp ->
            val input = resp.body?.byteStream() ?: return
            val buf = ByteArray(64 * 1024)
            while (true) {
              val n = withContext(Dispatchers.IO) { input.read(buf) }
              if (n < 0) break
              channel.writeFully(buf, 0, n)
            }
          }
        }
      })
    } catch (e: Exception) {
      r.close()
      throw e
    }
  }

  /** Rewrites an HLS playlist: its lines with addresses and the URI="…" in its tags. */
  private fun rewrite(text: String, from: String): String {
    val origin = URI(from)
    fun abs(x: String) = origin.resolve(x).toString()
    return text.lineSequence().joinToString("\n") { line ->
      when {
        line.isBlank() -> line
        line.startsWith("#") -> Regex("""URI="([^"]+)"""").replace(line) { m -> "URI=\"${url(abs(m.groupValues[1]))}\"" }
        else -> url(abs(line.trim()))
      }
    }
  }
}
