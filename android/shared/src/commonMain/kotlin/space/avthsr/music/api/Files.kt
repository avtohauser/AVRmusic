// Files picked on the phone (audio, images, cookies.txt) streamed to the server without loading them
// into memory.
package space.avthsr.music.api

import io.ktor.client.request.forms.FormBuilder
import io.ktor.client.request.forms.InputProvider
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import space.avthsr.music.PickedFile

private fun quoted(name: String) = "\"" + name.replace("\"", "%22").replace("\r", " ").replace("\n", " ") + "\""

fun FormBuilder.addFile(file: PickedFile, field: String = "file") {
  append(field, InputProvider(file.size.takeIf { it >= 0 }) { file.open() }, Headers.build {
    file.mime?.let { append(HttpHeaders.ContentType, it) }
    append(HttpHeaders.ContentDisposition, "filename=${quoted(file.name)}")
  })
}

fun FormBuilder.addBytes(bytes: ByteArray, fileName: String, mime: String, field: String = "file") {
  append(field, bytes, Headers.build {
    append(HttpHeaders.ContentType, mime)
    append(HttpHeaders.ContentDisposition, "filename=${quoted(fileName)}")
  })
}
