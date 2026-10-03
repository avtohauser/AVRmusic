// Profile and admin calls (the same endpoints the site uses).
package space.avthsr.music.api

import space.avthsr.music.PickedFile
import space.avthsr.music.squareJpeg
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private fun Api.decodeUser(text: String): User = json.decodeFromString(User.serializer(), text)

/* ---------- profile ---------- */

suspend fun Api.updateProfile(displayName: String?, email: String?) {
  val body = buildJsonObject {
    if (!displayName.isNullOrBlank()) put("displayName", displayName.trim())
    if (!email.isNullOrBlank()) put("email", email.trim())
  }
  setUser(decodeUser(call("PATCH", "/api/auth/me", body.toString())))
}

suspend fun Api.changePassword(old: String, new: String) {
  call("POST", "/api/auth/me/password", buildJsonObject { put("oldPassword", old); put("newPassword", new) }.toString())
}

suspend fun Api.uploadAvatar(file: PickedFile) {
  setUser(decodeUser(multipart("/api/me/avatar") { addFile(file) }))
}

suspend fun Api.removeAvatar() {
  call("DELETE", "/api/me/avatar")
  refreshMe()
}

suspend fun Api.myStats(): MeStats = get("/api/me/stats")
suspend fun Api.history(): List<HistoryEntry> = get("/api/me/history?limit=200")
suspend fun Api.clearHistory() { call("DELETE", "/api/me/history") }

/* ---------- playlists ---------- */

suspend fun Api.editPlaylist(id: String, title: String, description: String?, isPublic: Boolean) {
  call("PATCH", "/api/playlists/${enc(id)}", buildJsonObject {
    put("title", title.trim())
    put("description", description?.trim()?.takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull)
    put("isPublic", isPublic)
  }.toString())
}

suspend fun Api.deletePlaylist(id: String) { call("DELETE", "/api/playlists/${enc(id)}") }

suspend fun Api.playlistCover(id: String, file: PickedFile) {
  multipart("/api/playlists/${enc(id)}/cover") { addFile(file) }
}

/* ---------- admin: overview, users, invites ---------- */

suspend fun Api.adminStats(): AdminStats = get("/api/admin/stats")
suspend fun Api.adminActivity(): AdminActivity = get("/api/admin/activity")
suspend fun Api.adminUsers(): List<AdminUser> = get("/api/admin/users")
suspend fun Api.adminUser(id: String): AdminUserDetail = get("/api/admin/users/${enc(id)}")

suspend fun Api.adminPatchUser(id: String, body: JsonObject): AdminUser =
  json.decodeFromString(AdminUser.serializer(), call("PATCH", "/api/admin/users/${enc(id)}", body.toString()))

suspend fun Api.adminResetPassword(id: String): String =
  json.decodeFromString(NewPassword.serializer(), call("POST", "/api/admin/users/${enc(id)}/reset-password")).password

suspend fun Api.adminDeleteUser(id: String) { call("DELETE", "/api/admin/users/${enc(id)}") }

suspend fun Api.invites(): List<Invite> = get("/api/admin/invites")

suspend fun Api.createInvite(note: String?, expiresDays: Int?): Invite =
  json.decodeFromString(Invite.serializer(), call("POST", "/api/admin/invites", buildJsonObject {
    if (!note.isNullOrBlank()) put("note", note.trim())
    if (expiresDays != null) put("expiresDays", expiresDays)
  }.toString()))

suspend fun Api.deleteInvite(code: String) { call("DELETE", "/api/admin/invites/${enc(code)}") }

/* ---------- admin: downloads, imports, YouTube accounts ---------- */

suspend fun Api.serverJobs(): List<ServerJob> = get("/api/admin/import/jobs")
suspend fun Api.cancelJob(id: String) { call("DELETE", "/api/admin/import/jobs/${enc(id)}") }

suspend fun Api.importUrl(url: String, video: Boolean) {
  call("POST", "/api/admin/import/url", buildJsonObject { put("url", url.trim()); put("mode", if (video) "video" else "audio") }.toString())
}

/** Uploads audio files; [fields] (artist, album, genre, year) apply to all of them. */
suspend fun Api.uploadTracks(files: List<PickedFile>, fields: Map<String, String>): UploadResult =
  json.decodeFromString(UploadResult.serializer(), multipart("/api/admin/upload") {
    fields.filterValues { it.isNotBlank() }.forEach { (k, v) -> append(k, v.trim()) }
    files.forEach { addFile(it) }
  })

suspend fun Api.fetchMissingLyrics() { call("POST", "/api/admin/lyrics/fetch-missing") }
suspend fun Api.fetchMissingCanvases() { call("POST", "/api/admin/canvas/fetch-missing") }

suspend fun Api.ytAccounts(): List<YtAccount> = get("/api/admin/youtube-accounts")

suspend fun Api.addYtAccount(file: PickedFile, label: String): List<YtAccount> =
  json.decodeFromString(kotlinx.serialization.builtins.ListSerializer(YtAccount.serializer()), multipart("/api/admin/youtube-accounts") {
    if (label.isNotBlank()) append("label", label.trim())
    addFile(file)
  })

suspend fun Api.wakeYtAccount(id: String) { call("POST", "/api/admin/youtube-accounts/${enc(id)}/wake") }
suspend fun Api.deleteYtAccount(id: String) { call("DELETE", "/api/admin/youtube-accounts/${enc(id)}") }

suspend fun Api.clientErrors(): List<ClientError> = get("/api/admin/client-errors")

/* ---------- admin: library editing ---------- */

suspend fun Api.adminTracks(q: String, offset: Int = 0): TrackPage = get("/api/admin/tracks?limit=60&offset=$offset&q=${enc(q)}")

suspend fun Api.adminPatchTrack(id: String, body: JsonObject) { call("PATCH", "/api/admin/tracks/${enc(id)}", body.toString()) }
suspend fun Api.adminDeleteTrack(id: String) { call("DELETE", "/api/admin/tracks/${enc(id)}") }
suspend fun Api.adminLyrics(id: String): AdminLyrics = get("/api/admin/tracks/${enc(id)}/lyrics")
suspend fun Api.adminFetchLyrics(id: String) { call("POST", "/api/admin/tracks/${enc(id)}/lyrics/fetch") }
suspend fun Api.adminFetchCanvas(id: String) { call("POST", "/api/admin/tracks/${enc(id)}/canvas/fetch") }
suspend fun Api.adminDeleteCanvas(id: String) { call("DELETE", "/api/admin/tracks/${enc(id)}/canvas") }
suspend fun Api.adminTrackCover(id: String, file: PickedFile) { multipart("/api/admin/tracks/${enc(id)}/cover") { addFile(file) } }
suspend fun Api.adminTrackCanvas(id: String, file: PickedFile) { multipart("/api/admin/tracks/${enc(id)}/canvas") { addFile(file) } }

suspend fun Api.adminPatchAlbum(id: String, body: JsonObject) { call("PATCH", "/api/admin/albums/${enc(id)}", body.toString()) }
suspend fun Api.adminDeleteAlbum(id: String) { call("DELETE", "/api/admin/albums/${enc(id)}") }
suspend fun Api.adminAlbumCover(id: String, file: PickedFile) { multipart("/api/admin/albums/${enc(id)}/cover") { addFile(file) } }

suspend fun Api.adminPatchArtist(id: String, body: JsonObject) { call("PATCH", "/api/admin/artists/${enc(id)}", body.toString()) }
suspend fun Api.adminArtistImage(id: String, file: PickedFile) { multipart("/api/admin/artists/${enc(id)}/image") { addFile(file) } }

/** JSON array of strings, for request bodies. */
fun jsonStrings(list: List<String>) = JsonArray(list.map { JsonPrimitive(it) })

suspend fun Api.capabilities(): Capabilities = get("/api/admin/import/capabilities")
suspend fun Api.scanLibrary(): ScanResult = json.decodeFromString(ScanResult.serializer(), call("POST", "/api/admin/scan"))
suspend fun Api.reindex() { call("POST", "/api/admin/reindex") }

/** Lyrics from a .lrc (synced) or .txt (plain) file. */
suspend fun Api.adminLyricsFile(id: String, file: PickedFile) {
  multipart("/api/admin/tracks/${enc(id)}/lyrics") { addFile(file) }
}

/** A square, downscaled photo (centre crop) as the avatar. */
suspend fun Api.uploadAvatarSquare(file: PickedFile) {
  val bytes = squareJpeg(file, 512)
  setUser(json.decodeFromString(User.serializer(), multipart("/api/me/avatar") { addBytes(bytes, "avatar.jpg", "image/jpeg") }))
}
