@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import space.avthsr.music.tr
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.toShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.graphics.shapes.Morph
import androidx.graphics.shapes.RoundedPolygon
import space.avthsr.music.res.*

/** The morph at [progress] as a path in the unit square. */
private fun Morph.composePath(progress: Float): Path {
  val p = Path()
  var first = true
  forEachCubic(progress) { c ->
    if (first) { p.moveTo(c.anchor0X, c.anchor0Y); first = false }
    p.cubicTo(c.control0X, c.control0Y, c.control1X, c.control1Y, c.anchor1X, c.anchor1Y)
  }
  p.close()
  return p
}

/** A shape between two Material shapes: 0 = the first, 1 = the second. */
class MorphShape(private val morph: Morph, private val progress: Float) : Shape {
  override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
    val path = morph.composePath(progress)
    path.transform(Matrix().apply { scale(size.width, size.height) })
    return Outline.Generic(path)
  }
}

/** Shapes for people and artists (expressive variety instead of plain circles). */
val ArtistShape: Shape
  @Composable get() = MaterialShapes.Cookie9Sided.toShape()
val AvatarShape: Shape
  @Composable get() = MaterialShapes.Cookie12Sided.toShape()
val LogoShape: Shape
  @Composable get() = MaterialShapes.Clover4Leaf.toShape()

/**
 * The play button of Material 3 Expressive media players: a playful cookie while paused that morphs
 * into a rounded square while playing, with the expressive spring; it squashes a little when pressed.
 */
@Composable
fun MorphPlayButton(
  playing: Boolean,
  onClick: () -> Unit,
  size: Dp,
  modifier: Modifier = Modifier,
  container: Color = MaterialTheme.colorScheme.primary,
  content: Color = MaterialTheme.colorScheme.onPrimary,
  iconSize: Dp = size * 0.46f,
  paused: RoundedPolygon = MaterialShapes.Cookie9Sided,
  active: RoundedPolygon = MaterialShapes.Square,
) {
  val morph = remember(paused, active) { Morph(paused, active) }
  val progress by animateFloatAsState(if (playing) 1f else 0f, MaterialTheme.motionScheme.defaultSpatialSpec(), label = "play-morph")
  val interaction = remember { MutableInteractionSource() }
  val pressed by interaction.collectIsPressedAsState()
  val scale by animateFloatAsState(if (pressed) 0.88f else 1f, MaterialTheme.motionScheme.fastSpatialSpec(), label = "play-press")
  Box(
    modifier
      .size(size)
      .graphicsLayer { scaleX = scale; scaleY = scale }
      .clip(MorphShape(morph, progress))
      .background(container)
      .clickable(interactionSource = interaction, indication = LocalIndication.current, onClick = onClick),
    contentAlignment = Alignment.Center,
  ) {
    Ico(if (playing) Res.drawable.ic_pause else Res.drawable.ic_play, if (playing) tr("Пауза") else tr("Играть"), Modifier.size(iconSize), content)
  }
}

/** Squash-on-press for any clickable thing, with the theme's fast spatial spring. */
@Composable
fun Modifier.pressSquash(interaction: MutableInteractionSource, pressedScale: Float = 0.94f): Modifier {
  val pressed by interaction.collectIsPressedAsState()
  val scale by animateFloatAsState(if (pressed) pressedScale else 1f, MaterialTheme.motionScheme.fastSpatialSpec(), label = "squash")
  return this.graphicsLayer { scaleX = scale; scaleY = scale }
}
