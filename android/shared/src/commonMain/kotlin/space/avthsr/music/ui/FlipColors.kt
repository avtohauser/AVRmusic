// Colours that flow with the cover deck. With "colours from the track's cover" chosen, the player takes
// its scheme from the covers and blends it toward the incoming card's as far as that card has come
// (a quarter of the way off, a quarter of the way to the new colours). The blend lives inside the player
// only, in steps of 1/24, so the rest of the app is not recomposed on every frame of a flip.
@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.lerp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import space.avthsr.music.api.Api
import space.avthsr.music.player.PlayerUi
import kotlin.math.abs
import kotlin.math.roundToInt

private const val STEPS = 24

/** Seed colours of covers already looked at (url → colour). */
private val seeds = HashMap<String, Int>()

/** The theme colour of a cover, worked out once in the background. */
@Composable
fun rememberCoverSeed(url: String?): Int? {
  val src = Api.img(url)
  return produceState(src?.let { seeds[it] }, src) {
    if (src == null) { value = null; return@produceState }
    seeds[src]?.let { value = it; return@produceState }
    coverSeed(src)?.let { seeds[src] = it; value = it }
  }.value
}

@Composable
fun FlipTheme(s: PlayerUi, deck: Deck, content: @Composable () -> Unit) {
  val source by Look.source.collectAsStateWithLifecycle()
  val mode by Look.mode.collectAsStateWithLifecycle()
  val variant by Look.variant.collectAsStateWithLifecycle()
  val contrast by Look.contrast.collectAsStateWithLifecycle()
  val dark = when (mode) { "light" -> false; "dark" -> true; else -> isSystemInDarkTheme() }
  val pos = s.deckPos()
  // seeds of the playing cover and of both neighbours, ready before a flip starts
  val here = rememberCoverSeed(s.deckTrack(pos)?.coverUrl)
  val next = rememberCoverSeed(s.deckTrack(pos + 1)?.coverUrl)
  val prev = rememberCoverSeed(s.deckTrack(pos - 1)?.coverUrl)
  // how far the deck is toward a neighbour, in steps: changes a couple of dozen times per flip at most
  val step by remember(pos) { derivedStateOf { ((deck.cursor.value - pos) * STEPS).roundToInt().coerceIn(-STEPS, STEPS) } }
  val from = remember(here, dark, variant, contrast) { here?.let { schemeFrom(it, dark, variant, contrast) } }
  val towardSeed = if (step > 0) next else if (step < 0) prev else null
  val toward = remember(towardSeed, dark, variant, contrast) { towardSeed?.let { schemeFrom(it, dark, variant, contrast) } }
  val app = MaterialTheme.colorScheme
  val scheme = when {
    source != "cover" || from == null -> app
    toward == null || step == 0 -> from
    else -> remember(from, toward, step) { blend(from, toward, abs(step) / STEPS.toFloat()) }
  }
  MaterialExpressiveTheme(colorScheme = scheme) {
    CompositionLocalProvider(LocalContentColor provides scheme.onBackground) { content() }
  }
}

/** Every colour of the scheme [f] of the way from [a] to [b]. */
private fun blend(a: ColorScheme, b: ColorScheme, f: Float): ColorScheme = a.copy(
  primary = lerp(a.primary, b.primary, f), onPrimary = lerp(a.onPrimary, b.onPrimary, f),
  primaryContainer = lerp(a.primaryContainer, b.primaryContainer, f), onPrimaryContainer = lerp(a.onPrimaryContainer, b.onPrimaryContainer, f),
  inversePrimary = lerp(a.inversePrimary, b.inversePrimary, f),
  secondary = lerp(a.secondary, b.secondary, f), onSecondary = lerp(a.onSecondary, b.onSecondary, f),
  secondaryContainer = lerp(a.secondaryContainer, b.secondaryContainer, f), onSecondaryContainer = lerp(a.onSecondaryContainer, b.onSecondaryContainer, f),
  tertiary = lerp(a.tertiary, b.tertiary, f), onTertiary = lerp(a.onTertiary, b.onTertiary, f),
  tertiaryContainer = lerp(a.tertiaryContainer, b.tertiaryContainer, f), onTertiaryContainer = lerp(a.onTertiaryContainer, b.onTertiaryContainer, f),
  background = lerp(a.background, b.background, f), onBackground = lerp(a.onBackground, b.onBackground, f),
  surface = lerp(a.surface, b.surface, f), onSurface = lerp(a.onSurface, b.onSurface, f),
  surfaceVariant = lerp(a.surfaceVariant, b.surfaceVariant, f), onSurfaceVariant = lerp(a.onSurfaceVariant, b.onSurfaceVariant, f),
  surfaceTint = lerp(a.surfaceTint, b.surfaceTint, f),
  outline = lerp(a.outline, b.outline, f), outlineVariant = lerp(a.outlineVariant, b.outlineVariant, f),
  surfaceBright = lerp(a.surfaceBright, b.surfaceBright, f), surfaceDim = lerp(a.surfaceDim, b.surfaceDim, f),
  surfaceContainerLowest = lerp(a.surfaceContainerLowest, b.surfaceContainerLowest, f),
  surfaceContainerLow = lerp(a.surfaceContainerLow, b.surfaceContainerLow, f),
  surfaceContainer = lerp(a.surfaceContainer, b.surfaceContainer, f),
  surfaceContainerHigh = lerp(a.surfaceContainerHigh, b.surfaceContainerHigh, f),
  surfaceContainerHighest = lerp(a.surfaceContainerHighest, b.surfaceContainerHighest, f),
)
