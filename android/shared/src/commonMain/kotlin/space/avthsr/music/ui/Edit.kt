// Editing in place: the owner's playlist menu, and the admin's album / artist menus.
package space.avthsr.music.ui

import space.avthsr.music.Pick
import space.avthsr.music.rememberPicker

import space.avthsr.music.tr
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import space.avthsr.music.res.*
import space.avthsr.music.api.Album
import space.avthsr.music.api.Api
import space.avthsr.music.api.ArtistPage
import space.avthsr.music.api.Playlist
import space.avthsr.music.api.adminAlbumCover
import space.avthsr.music.api.adminArtistImage
import space.avthsr.music.api.adminDeleteAlbum
import space.avthsr.music.api.adminPatchAlbum
import space.avthsr.music.api.adminPatchArtist
import space.avthsr.music.api.deletePlaylist
import space.avthsr.music.api.editPlaylist
import space.avthsr.music.api.playlistCover

private fun textOrNull(s: String) = s.trim().takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull

@Composable
fun PlaylistOwnerMenu(p: Playlist, reload: () -> Unit) {
  val nav = LocalNav.current
  var menu by remember { mutableStateOf(false) }
  var edit by remember { mutableStateOf(false) }
  var delete by remember { mutableStateOf(false) }
  val pickCover = rememberPicker(Pick.IMAGE) { f ->
    f.firstOrNull()?.let { file -> act(tr("Обложка обновлена"), then = reload) { Api.playlistCover(p.id, file) } }
  }
  Box {
    IconButton(onClick = { menu = true }) { Ico(Res.drawable.ic_more, tr("Изменить плейлист")) }
    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
      DropdownMenuItem(text = { Text(tr("Изменить")) }, onClick = { menu = false; edit = true })
      DropdownMenuItem(text = { Text(tr("Сменить обложку")) }, onClick = { menu = false; pickCover() })
      DropdownMenuItem(text = { Text(tr("Удалить плейлист")) }, onClick = { menu = false; delete = true })
    }
  }
  if (edit) {
    var title by remember { mutableStateOf(p.title) }
    var description by remember { mutableStateOf(p.description.orEmpty()) }
    var public by remember { mutableStateOf(p.isPublic) }
    AlertDialog(
      onDismissRequest = { edit = false },
      title = { Text(tr("Плейлист")) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text(tr("Название")) }, singleLine = true)
          OutlinedTextField(description, { description = it }, Modifier.fillMaxWidth(), label = { Text(tr("Описание")) }, minLines = 2)
          CheckRow(tr("Виден всем (в «Плейлистах сообщества»)"), public) { public = it }
        }
      },
      confirmButton = {
        TextButton(enabled = title.isNotBlank(), onClick = {
          edit = false
          act(tr("Сохранено"), then = reload) { Api.editPlaylist(p.id, title, description, public) }
        }) { Text(tr("Сохранить")) }
      },
      dismissButton = { TextButton(onClick = { edit = false }) { Text(tr("Отмена")) } },
    )
  }
  if (delete) ConfirmDialog(tr("Удалить «{}»?", p.title), tr("Плейлист удалится, треки останутся в библиотеке."), tr("Удалить"), { delete = false }) {
    act(tr("Плейлист удалён"), then = { nav.back() }) { Api.deletePlaylist(p.id) }
  }
}

private val albumTypes get() = listOf("album" to tr("Альбом"), "single" to tr("Сингл"), "ep" to "EP", "compilation" to tr("Сборник"))

@Composable
fun AlbumAdminMenu(a: Album, reload: () -> Unit) {
  val nav = LocalNav.current
  var menu by remember { mutableStateOf(false) }
  var edit by remember { mutableStateOf(false) }
  var delete by remember { mutableStateOf(false) }
  val pickCover = rememberPicker(Pick.IMAGE) { f ->
    f.firstOrNull()?.let { file -> act(tr("Обложка обновлена"), then = reload) { Api.adminAlbumCover(a.id, file) } }
  }
  Box {
    IconButton(onClick = { menu = true }) { Ico(Res.drawable.ic_settings, tr("Редактировать альбом")) }
    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
      DropdownMenuItem(text = { Text(tr("Редактировать")) }, onClick = { menu = false; edit = true })
      DropdownMenuItem(text = { Text(tr("Сменить обложку")) }, onClick = { menu = false; pickCover() })
      DropdownMenuItem(text = { Text(tr("Удалить альбом")) }, onClick = { menu = false; delete = true })
    }
  }
  if (edit) {
    var title by remember { mutableStateOf(a.title) }
    var year by remember { mutableStateOf(a.year?.toString().orEmpty()) }
    var label by remember { mutableStateOf(a.label.orEmpty()) }
    var type by remember { mutableStateOf(a.type) }
    AlertDialog(
      onDismissRequest = { edit = false },
      title = { Text(tr("Альбом")) },
      text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text(tr("Название")) }, singleLine = true)
          OutlinedTextField(year, { year = it }, Modifier.fillMaxWidth(), label = { Text(tr("Год")) }, singleLine = true)
          OutlinedTextField(label, { label = it }, Modifier.fillMaxWidth(), label = { Text(tr("Лейбл")) }, singleLine = true)
          Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            albumTypes.forEach { (id, name) -> FilterChip(selected = type == id, onClick = { type = id }, label = { Text(name) }) }
          }
        }
      },
      confirmButton = {
        TextButton(enabled = title.isNotBlank(), onClick = {
          edit = false
          val body = buildJsonObject {
            put("title", title.trim())
            put("year", year.trim().toIntOrNull()?.let { JsonPrimitive(it) } ?: JsonNull)
            put("label", textOrNull(label))
            put("type", type)
          }
          act(tr("Сохранено"), then = reload) { Api.adminPatchAlbum(a.id, body) }
        }) { Text(tr("Сохранить")) }
      },
      dismissButton = { TextButton(onClick = { edit = false }) { Text(tr("Отмена")) } },
    )
  }
  if (delete) ConfirmDialog(tr("Удалить «{}»?", a.title), tr("Альбом и все его треки удалятся с сервера."), tr("Удалить"), { delete = false }) {
    act(tr("Альбом удалён"), then = { nav.back() }) { Api.adminDeleteAlbum(a.id) }
  }
}

@Composable
fun ArtistAdminMenu(a: ArtistPage, reload: () -> Unit) {
  var menu by remember { mutableStateOf(false) }
  var edit by remember { mutableStateOf(false) }
  val pickImage = rememberPicker(Pick.IMAGE) { f ->
    f.firstOrNull()?.let { file -> act(tr("Фото обновлено"), then = reload) { Api.adminArtistImage(a.id, file) } }
  }
  Box {
    IconButton(onClick = { menu = true }) { Ico(Res.drawable.ic_settings, tr("Редактировать исполнителя")) }
    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
      DropdownMenuItem(text = { Text(tr("Редактировать")) }, onClick = { menu = false; edit = true })
      DropdownMenuItem(text = { Text(tr("Сменить фото")) }, onClick = { menu = false; pickImage() })
    }
  }
  if (edit) FormDialog(
    tr("Исполнитель"),
    listOf(Field(tr("Имя"), a.name), Field(tr("О исполнителе"), a.bio.orEmpty(), lines = 4)),
    onDismiss = { edit = false },
  ) { v ->
    val body = buildJsonObject { put("name", v[0].trim()); put("bio", textOrNull(v[1])) }
    act(tr("Сохранено"), then = reload) { Api.adminPatchArtist(a.id, body) }
  }
}
