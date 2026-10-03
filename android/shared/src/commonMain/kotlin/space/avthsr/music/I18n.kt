// The app's language, as on the site: Russian (the source text) or English. Every visible string goes
// through tr(): the Russian text is looked up in the English table and the {} gaps are filled in order.
package space.avthsr.music

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import space.avthsr.music.api.Api
import space.avthsr.music.ui.Choice

object Lang {
  /** "ru" or "en"; Compose state, so the screens follow a switch at once */
  var code by mutableStateOf("ru")
    private set

  val choices = listOf(Choice("ru", "Русский"), Choice("en", "English"))

  fun init() {
    code = Api.prefs.getString("lang", null)?.takeIf { c -> choices.any { it.id == c } } ?: "ru"
  }

  fun set(c: String) {
    code = c
    Api.prefs.edit().putString("lang", c).apply()
  }
}

fun tr(ru: String, vararg args: Any?): String {
  val text = if (Lang.code == "en") EN[ru] ?: ru else ru
  if (args.isEmpty()) return text
  val out = StringBuilder(text.length + 16)
  var i = 0
  var a = 0
  while (i < text.length) {
    if (a < args.size && text.startsWith("{}", i)) { out.append(args[a++]); i += 2 } else out.append(text[i++])
  }
  return out.toString()
}
