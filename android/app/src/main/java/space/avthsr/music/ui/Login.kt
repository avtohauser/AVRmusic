package space.avthsr.music.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.api.Likes

@Composable
fun LoginScreen() {
  var register by rememberSaveable { mutableStateOf(false) }
  var login by rememberSaveable { mutableStateOf("") }
  var password by rememberSaveable { mutableStateOf("") }
  var email by rememberSaveable { mutableStateOf("") }
  var username by rememberSaveable { mutableStateOf("") }
  var name by rememberSaveable { mutableStateOf("") }
  var invite by rememberSaveable { mutableStateOf("") }
  var busy by rememberSaveable { mutableStateOf(false) }
  var error by rememberSaveable { mutableStateOf<String?>(null) }
  val scope = rememberCoroutineScope()

  fun submit() {
    if (busy) return
    busy = true
    error = null
    scope.launch {
      try {
        if (register) Api.register(email, username, name, password, invite) else Api.login(login, password)
        App.scope.launch { Likes.load() }
      } catch (e: Exception) {
        error = e.message ?: "Не удалось войти"
      } finally {
        busy = false
      }
    }
  }

  Box(
    Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).windowInsetsPadding(SafeBars).imePadding(),
    contentAlignment = Alignment.Center,
  ) {
    Column(
      Modifier.widthIn(max = 440.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Box(
        Modifier.size(84.dp).clip(RoundedCornerShape(28.dp)).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
      ) { Ico(R.drawable.ic_library, null, Modifier.size(40.dp), MaterialTheme.colorScheme.onPrimaryContainer) }
      Text("AVRmusic", style = MaterialTheme.typography.displaySmall)
      Text(
        if (register) "Регистрация по коду приглашения" else "Войдите, чтобы слушать",
        style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center,
      )
      Spacer(Modifier.height(4.dp))
      val field = Modifier.fillMaxWidth()
      if (register) {
        OutlinedTextField(invite, { invite = it }, field, label = { Text("Код приглашения") }, singleLine = true)
        OutlinedTextField(
          email, { email = it }, field, label = { Text("Email") }, singleLine = true,
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
        )
        OutlinedTextField(username, { username = it }, field, label = { Text("Имя пользователя") }, singleLine = true)
        OutlinedTextField(name, { name = it }, field, label = { Text("Как вас называть") }, singleLine = true)
      } else {
        OutlinedTextField(login, { login = it }, field, label = { Text("Email или имя пользователя") }, singleLine = true)
      }
      OutlinedTextField(
        password, { password = it }, field, label = { Text("Пароль") }, singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
      )
      error?.let { Text(it, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center) }
      Button(onClick = { submit() }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(56.dp)) {
        if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
        else Text(if (register) "Создать аккаунт" else "Войти", style = MaterialTheme.typography.titleMedium)
      }
      Row {
        TextButton(onClick = { register = !register; error = null }) {
          Text(if (register) "Уже есть аккаунт? Войти" else "Есть код приглашения? Регистрация")
        }
      }
    }
  }
}
