// A story card for a song: its cover over a blur of itself, the title and the artist, the brand below —
// drawn into a picture and handed to the share sheet (Instagram, Telegram stories …).
package space.avthsr.music.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import space.avthsr.music.api.Track
import space.avthsr.music.res.*
import space.avthsr.music.tr

@Composable
fun StoryDialog(t: Track, onDismiss: () -> Unit) {
  val layer = rememberGraphicsLayer()
  val scope = rememberCoroutineScope()
  Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      Box(
        Modifier.widthIn(max = 340.dp).fillMaxWidth().aspectRatio(9f / 16f)
          .drawWithContent { layer.record { this@drawWithContent.drawContent() }; drawLayer(layer) }
          .clip(RoundedCornerShape(32.dp)).background(Brand.Teal),
      ) {
        BlurredCover(t.coverUrl, Modifier.fillMaxSize(), alpha = 0.9f)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.15f), Color.Black.copy(alpha = 0.55f)))))
        Column(Modifier.fillMaxSize().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
          Text(tr("Сейчас слушаю"), color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.labelLarge, letterSpacing = 2.sp)
          Spacer(Modifier.height(18.dp))
          Cover(t.coverUrl, Modifier.fillMaxWidth().aspectRatio(1f), RoundedCornerShape(24.dp))
          Spacer(Modifier.height(22.dp))
          Text(t.title, color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
          Spacer(Modifier.height(4.dp))
          Text(t.artists, color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 22.dp), verticalAlignment = Alignment.CenterVertically) {
          BrandMark(Modifier.size(34.dp, 24.dp))
          Spacer(Modifier.width(6.dp))
          Wordmark(18.sp, dark = true)
        }
      }
      Spacer(Modifier.height(16.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedButton(onClick = onDismiss, shapes = ButtonDefaults.shapes()) { Text(tr("Закрыть")) }
        Button(onClick = { scope.launch { runCatching { shareImage(layer.toImageBitmap(), "${t.artists} — ${t.title}") } } }, shapes = ButtonDefaults.shapes()) {
          Ico(Res.drawable.ic_share, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Поделиться"))
        }
      }
    }
  }
}
