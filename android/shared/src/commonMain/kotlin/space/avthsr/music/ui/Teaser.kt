@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

// The first screens of the app for someone who has no account yet: what avr music is, what it believes in,
// a play button to try, what is inside and how to get in — pages to swipe through, each with its own motion.
// Shown once before the sign-in form (and again from its "What is avr music?" link).
package space.avthsr.music.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.toShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.DrawableResource
import space.avthsr.music.Platform
import space.avthsr.music.res.*
import space.avthsr.music.tr
import kotlin.math.PI
import kotlin.math.absoluteValue
import kotlin.math.cos
import kotlin.math.sin

private const val SEEN = "teaser.seen"

/** Whether the presentation was already shown on this phone. */
fun teaserSeen(): Boolean = runCatching { space.avthsr.music.api.Api.prefs.getBoolean(SEEN, false) }.getOrDefault(false)

private fun markSeen() { runCatching { space.avthsr.music.api.Api.prefs.edit().putBoolean(SEEN, true).apply() } }

/** The presentation: [onLogin] / [onCode] lead on to the sign-in form (with an invite code for the second). */
@Composable
fun Teaser(onLogin: () -> Unit, onCode: () -> Unit) {
  val pages = 5
  val pager = rememberPagerState { pages }
  val scope = rememberCoroutineScope()
  val t = rememberInfiniteTransition(label = "teaser")
  val phase by t.animateFloat(0f, 1f, infiniteRepeatable(tween(14_000, easing = LinearEasing)), label = "phase")
  Box(Modifier.fillMaxSize().background(Brand.Teal)) {
    // the glow behind it all drifts, and leans with the swipe
    Canvas(Modifier.fillMaxSize()) {
      val shift = (pager.currentPage + pager.currentPageOffsetFraction) / (pages - 1)
      val a = phase * 2f * PI.toFloat()
      val r = size.maxDimension * 0.6f
      val c1 = Offset(size.width * (0.25f + 0.5f * shift) + 40f * cos(a), size.height * (0.28f + 0.06f * sin(a)))
      val c2 = Offset(size.width * (0.8f - 0.5f * shift) + 50f * sin(a), size.height * (0.72f + 0.05f * cos(a)))
      drawCircle(Brush.radialGradient(listOf(Brand.Violet.copy(alpha = 0.55f), Color.Transparent), c1, r), r, c1)
      drawCircle(Brush.radialGradient(listOf(Brand.Pink.copy(alpha = 0.22f), Color.Transparent), c2, r * 0.8f), r * 0.8f, c2)
      listOf(140f, 220f, 300f).forEachIndexed { i, rr ->
        val k = 0.94f + 0.06f * sin(a * 3f + i)
        drawCircle(Brand.Mist, rr.dp.toPx() * k, Offset(size.width / 2f, size.height * 0.34f), alpha = 0.07f, style = Stroke(1.5.dp.toPx()))
      }
    }
    Column(Modifier.fillMaxSize().windowInsetsPadding(SafeBars)) {
      Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        BrandMark(Modifier.size(40.dp, 28.dp))
        Spacer(Modifier.width(8.dp))
        Wordmark(22.sp, dark = true)
        Spacer(Modifier.weight(1f))
        TextButton(onClick = { markSeen(); onLogin() }) { Text(tr("Войти"), color = Brand.Pink) }
      }
      HorizontalPager(pager, Modifier.weight(1f).fillMaxWidth(), beyondViewportPageCount = 1) { i ->
        val shown = pager.settledPage == i
        // a page slides in with a slight parallax and fades as it goes
        val off = ((pager.currentPage - i) + pager.currentPageOffsetFraction).absoluteValue.coerceIn(0f, 1f)
        Box(
          Modifier.fillMaxSize().graphicsLayer { alpha = 1f - off * 0.6f; translationX = off * 60f * (if (pager.currentPage > i) -1f else 1f) }
            .padding(horizontal = 24.dp),
          contentAlignment = Alignment.Center,
        ) {
          Column(Modifier.widthIn(max = 460.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            when (i) {
              0 -> IntroPage(shown)
              1 -> BeliefsPage(shown)
              2 -> TryPage()
              3 -> InsidePage(shown)
              else -> JoinPage(shown)
            }
          }
        }
      }
      // the dots: the current one stretches into a pill
      Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally)) {
        repeat(pages) { k ->
          val w by animateDpAsState(if (pager.currentPage == k) 26.dp else 8.dp, label = "dot")
          Box(Modifier.size(w, 8.dp).clip(CircleShape).background(if (pager.currentPage == k) Brand.Pink else Brand.Mist.copy(alpha = 0.3f)))
        }
      }
      Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        FilledTonalButton(
          shapes = ButtonDefaults.shapes(), modifier = Modifier.weight(1f).height(56.dp),
          onClick = { if (pager.currentPage < pages - 1) scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } else { markSeen(); onLogin() } },
        ) { Text(if (pager.currentPage < pages - 1) tr("Дальше") else tr("Войти"), style = MaterialTheme.typography.titleMedium) }
        Button(shapes = ButtonDefaults.shapes(), modifier = Modifier.weight(1.3f).height(56.dp), onClick = { markSeen(); onCode() }) {
          Text(tr("У меня есть код"), style = MaterialTheme.typography.titleMedium, maxLines = 1)
        }
      }
    }
  }
}

/** Text in the brand's light teal, centred. */
@Composable
private fun Lead(text: String, modifier: Modifier = Modifier) =
  Text(text, modifier, style = MaterialTheme.typography.bodyLarge, color = Brand.MistDim, textAlign = TextAlign.Center)

@Composable
private fun Kicker(text: String) =
  Text(text.uppercase(), style = MaterialTheme.typography.labelLarge, color = Brand.Pink, letterSpacing = 1.6.sp, textAlign = TextAlign.Center)

@Composable
private fun Title(text: String) =
  Text(text, style = MaterialTheme.typography.headlineLarge, color = Brand.Mist, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp, bottom = 10.dp))

/** Something that rises into place a little after its page settles. */
@Composable
private fun Rise(shown: Boolean, order: Int, content: @Composable () -> Unit) {
  var go by remember { mutableStateOf(false) }
  LaunchedEffect(shown) { if (shown) { delay(90L * order); go = true } }
  AnimatedVisibility(go || Platform.animationsOff(), enter = fadeIn(tween(420)) + slideInVertically(tween(520)) { it / 3 }) { content() }
}

@Composable
private fun IntroPage(shown: Boolean) {
  val t = rememberInfiniteTransition(label = "intro")
  val p by t.animateFloat(0f, 1f, infiniteRepeatable(tween(2200, easing = LinearEasing), RepeatMode.Restart), label = "beat")
  val a = (p * 2 * PI).toFloat()
  BrandMark(Modifier.size(168.dp, 120.dp), spin = sin(a) * 10f, grow = 0.94f + 0.06f * sin(a * 2f), wave1 = 0.4f + 0.6f * ((sin(a) + 1f) / 2f), wave2 = 0.4f + 0.6f * ((cos(a) + 1f) / 2f))
  Spacer(Modifier.height(18.dp))
  Kicker(tr("Частный музыкальный сервис"))
  Text(tr("Своя музыка."), style = MaterialTheme.typography.displayMedium, color = Brand.Mist, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp))
  Text(tr("Для своих."), style = MaterialTheme.typography.displayMedium, color = Brand.Pink, textAlign = TextAlign.Center)
  Spacer(Modifier.height(14.dp))
  Rise(shown, 2) {
    Lead(tr("avr music — стриминг для небольшой компании друзей. Вся музыка живёт на нашем сервере: без рекламы, без цензуры и без чужих правил."))
  }
}

@Composable
private fun BeliefsPage(shown: Boolean) {
  Kicker(tr("Философия"))
  Title(tr("Музыка не должна зависеть от чужих правил"))
  val items = listOf(
    Triple(Res.drawable.ic_group, tr("Для своих"), tr("Вход только по приглашению: ни рекламы, ни слежки, ни посторонних.")),
    Triple(Res.drawable.ic_library, tr("Музыка остаётся с нами"), tr("Трек попал на сервер — он наш. Его не удалят и не спрячут за подпиской.")),
    Triple(Res.drawable.ic_sparkle, tr("Оригиналы, а не «чистые» версии"), tr("Перезалитые версии с вырезанными словами уходят вниз.")),
    Triple(Res.drawable.ic_palette, tr("Одинаково везде"), tr("Android, iPhone и сайт выглядят и ведут себя одинаково.")),
  )
  val shapes = listOf(MaterialShapes.Cookie9Sided, MaterialShapes.Clover4Leaf, MaterialShapes.Sunny, MaterialShapes.Cookie12Sided)
  Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
    items.forEachIndexed { k, (icon, title, text) ->
      Rise(shown, k + 1) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color(0xFF0E4A50)).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
          Box(Modifier.size(46.dp).clip(shapes[k].toShape()).background(Brush.linearGradient(listOf(Brand.Pink, Brand.Violet))), contentAlignment = Alignment.Center) {
            Ico(icon, null, Modifier.size(24.dp), Brand.Teal)
          }
          Spacer(Modifier.width(14.dp))
          Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = Brand.Mist)
            Text(text, style = MaterialTheme.typography.bodySmall, color = Brand.MistDim)
          }
        }
      }
    }
  }
}

/** A deck of covers to flip, a wavy bar and the morphing play button — the app's own pieces, to touch. */
@Composable
private fun TryPage() {
  Kicker(tr("Попробуйте"))
  Title(tr("Нажмите — кнопка живая"))
  var playing by remember { mutableStateOf(false) }
  var top by remember { mutableIntStateOf(0) }
  val colors = listOf(listOf(Brand.Violet, Brand.Pink), listOf(Brand.TealDeep, Brand.MistDim), listOf(Color(0xFF3F3591), Color(0xFFC4BCFF)))
  Box(Modifier.size(210.dp).clickable { top = (top + 1) % 3 }, contentAlignment = Alignment.Center) {
    // each card keeps its own animation; only its place in the deck changes
    for (idx in 0 until 3) {
      val depth = (idx - top + 3) % 3
      val rot by animateFloatAsState(when (depth) { 0 -> 0f; 1 -> 9f; else -> -9f }, label = "rot")
      val dx by animateFloatAsState(when (depth) { 0 -> 0f; 1 -> 34f; else -> -34f }, label = "dx")
      val sc by animateFloatAsState(if (depth == 0) 1f else 0.86f, label = "sc")
      Box(
        Modifier.zIndex(3f - depth).size(190.dp).graphicsLayer { rotationZ = rot; translationX = dx; scaleX = sc; scaleY = sc; alpha = if (depth == 0) 1f else 0.6f }
          .clip(RoundedCornerShape(30.dp)).background(Brush.linearGradient(colors[idx])),
        contentAlignment = Alignment.Center,
      ) { BrandMark(Modifier.size(84.dp, 60.dp), waves = playing && depth == 0) }
    }
  }
  Spacer(Modifier.height(20.dp))
  val t = rememberInfiniteTransition(label = "demo")
  val p by t.animateFloat(0f, 1f, infiniteRepeatable(tween(9000, easing = LinearEasing)), label = "pos")
  LinearWavyProgressIndicator(
    progress = { if (playing) p else 0.18f },
    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
    amplitude = { if (playing) 1f else 0f },
  )
  Spacer(Modifier.height(18.dp))
  MorphPlayButton(playing, { playing = !playing }, 92.dp, container = Brand.Pink, content = Color(0xFF3B0D26))
  Spacer(Modifier.height(10.dp))
  Lead(tr("Из «печенья» в квадрат, полоска — волной, обложки — колодой. Коснитесь обложки."))
}

@Composable
private fun InsidePage(shown: Boolean) {
  Kicker(tr("Что внутри"))
  Title(tr("Всё, чтобы слушать вместе"))
  val items: List<Pair<DrawableResource, String>> = listOf(
    Res.drawable.ic_all_inclusive to tr("Моя волна под настроение"),
    Res.drawable.ic_headphones to tr("Слушать вместе с друзьями"),
    Res.drawable.ic_search to tr("Любой трек играет сразу"),
    Res.drawable.ic_lyrics to tr("Тексты караоке"),
    Res.drawable.ic_quiz to tr("Угадай мелодию"),
    Res.drawable.ic_import to tr("Переезд из Spotify и Яндекса"),
    Res.drawable.ic_offline to tr("Офлайн и свои устройства"),
    Res.drawable.ic_send to tr("Что играет — в Telegram"),
  )
  val t = rememberInfiniteTransition(label = "inside")
  val p by t.animateFloat(0f, 1f, infiniteRepeatable(tween(2400, easing = LinearEasing)), label = "bob")
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    items.chunked(2).forEachIndexed { row, pair ->
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        pair.forEachIndexed { col, (icon, label) ->
          val k = row * 2 + col
          Box(Modifier.weight(1f)) {
            Rise(shown, k) {
              Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color(0xFF0E4A50)).padding(12.dp)) {
                val bob = sin((p + k / 8f) * 2f * PI.toFloat()) * 3f
                Box(Modifier.offset(y = bob.dp).size(36.dp).clip(if (k % 2 == 0) CircleShape else RoundedCornerShape(12.dp)).background(Brand.Pink.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                  Ico(icon, null, Modifier.size(20.dp), Brand.Pink)
                }
                Spacer(Modifier.height(8.dp))
                Text(label, style = MaterialTheme.typography.labelLarge, color = Brand.Mist, maxLines = 2)
              }
            }
          }
        }
      }
    }
  }
}

@Composable
private fun JoinPage(shown: Boolean) {
  Kicker(tr("Как попасть"))
  Title(tr("Три шага — и вы с нами"))
  val steps = listOf(
    tr("Попросите код приглашения у друга, который уже внутри"),
    tr("Нажмите «У меня есть код» и зарегистрируйтесь"),
    tr("Слушайте здесь, на iPhone или на сайте — всё синхронно"),
  )
  Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
    steps.forEachIndexed { k, text ->
      Rise(shown, k + 1) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color(0xFF0E4A50)).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
          Box(Modifier.size(44.dp).clip(MaterialShapes.Cookie9Sided.toShape()).background(Brand.Pink), contentAlignment = Alignment.Center) {
            Text("${k + 1}", color = Color(0xFF3B0D26), fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleLarge)
          }
          Spacer(Modifier.width(14.dp))
          Text(text, style = MaterialTheme.typography.bodyLarge, color = Brand.Mist, modifier = Modifier.weight(1f))
        }
      }
    }
  }
  Spacer(Modifier.height(14.dp))
  Lead(tr("Код одноразовый: его выдаёт тот, кто уже слушает avr music."))
}
