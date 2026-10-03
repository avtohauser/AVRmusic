// Settings and the session, in the shape SharedPreferences had (the screens' code stays as it was):
// read with a default, change through an editor and apply.
package space.avthsr.music

class Prefs(private val kv: KeyValues) {
  fun getString(key: String, def: String?): String? = kv.string(key) ?: def
  fun getBoolean(key: String, def: Boolean): Boolean = kv.bool(key) ?: def
  fun getInt(key: String, def: Int): Int = kv.int(key) ?: def
  fun getFloat(key: String, def: Float): Float = kv.float(key) ?: def
  fun contains(key: String): Boolean = kv.string(key) != null || kv.bool(key) != null || kv.int(key) != null || kv.float(key) != null

  fun edit() = Editor()

  inner class Editor {
    private val changes = LinkedHashMap<String, Any?>()
    fun putString(key: String, value: String?): Editor { changes[key] = value; return this }
    fun putBoolean(key: String, value: Boolean): Editor { changes[key] = value; return this }
    fun putInt(key: String, value: Int): Editor { changes[key] = value; return this }
    fun putFloat(key: String, value: Float): Editor { changes[key] = value; return this }
    fun remove(key: String): Editor { changes[key] = null; return this }
    fun apply() { if (changes.isNotEmpty()) kv.write(changes.toMap()) }
  }
}
