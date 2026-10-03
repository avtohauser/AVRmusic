// A genre as an expressive tile: its colour, its name in the heavy flexible face, and covers of its
// most played music fanned out in the corner in Material shapes. Pressing squashes the tile and fans
// the covers a little further, on the expressive spring.
@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.toShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.api.Genre

/** Where each cover sits in the fan (front first): size, offset from the bottom-right corner, tilt, extra tilt when pressed. */
private data class Leaf(val size: Dp, val x: Dp, val y: Dp, val tilt: Float, val spread: Float)

private val leaves = listOf(
  Leaf(74.dp, 12.dp, 14.dp, -12f, -8f),
  Leaf(62.dp, (-40).dp, 22.dp, 10f, 9f),
  Leaf(54.dp, 20.dp, (-30).dp, 24f, 10f),
)

@Composable
fun GenreTile(g: Genre, modifier: Modifier = Modifier, onClick: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  // the genre's own colour, pulled a little toward the theme so the tiles sit in the palette
  val base = lerp(parseColor(g.color, cs.primaryContainer), cs.primary, 0.15f)
  val deep = lerp(base, Color.Black, 0.38f)
  val interaction = remember { MutableInteractionSource() }
  val pressed by interaction.collectIsPressedAsState()
  val fan by animateFloatAsState(if (pressed) 1f else 0f, Motion.expressive.fastSpatialSpec(), label = "fan")
  val shapes = listOf(MaterialShapes.Cookie9Sided.toShape(), MaterialShapes.Clover4Leaf.toShape(), MaterialShapes.Sunny.toShape())
  val covers = g.covers.ifEmpty { listOfNotNull(g.coverUrl) }.take(leaves.size)
  Box(
    modifier.height(124.dp).pressSquash(interaction, 0.95f).clip(RoundedCornerShape(28.dp))
      .background(Brush.linearGradient(listOf(base, deep)))
      .clickable(interactionSource = interaction, indication = LocalIndication.current, onClick = onClick),
  ) {
    if (covers.isEmpty()) {
      Ico(R.drawable.ic_album, null, Modifier.align(Alignment.BottomEnd).offset(14.dp, 14.dp).size(78.dp).graphicsLayer { rotationZ = -16f + fan * -8f }, Color.White.copy(alpha = 0.28f))
    }
    // back to front, so the most played cover lies on top
    for (i in covers.indices.reversed()) FanCover(covers[i], leaves[i], shapes[i], fan)
    Text(
      g.name, Modifier.padding(start = 16.dp, top = 14.dp, end = 70.dp),
      style = MaterialTheme.typography.titleLarge, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis,
    )
    Text(
      tracksWord(g.trackCount), Modifier.align(Alignment.BottomStart).padding(start = 16.dp, bottom = 12.dp),
      style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.82f),
    )
  }
}

@Composable
private fun BoxScope.FanCover(url: String, leaf: Leaf, shape: Shape, fan: Float) {
  AsyncImage(
    model = Api.img(url), contentDescription = null, contentScale = ContentScale.Crop,
    modifier = Modifier.align(Alignment.BottomEnd).offset(leaf.x, leaf.y).size(leaf.size)
      .graphicsLayer { rotationZ = leaf.tilt + fan * leaf.spread }
      .shadow(8.dp, shape).clip(shape),
  )
}
