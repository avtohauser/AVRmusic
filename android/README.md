# AVRmusic для Android (Trusted Web Activity)

Веб-клиент AVRmusic — полноценное PWA: офлайн-кэш, установка на домашний экран,
управление с экрана блокировки (Media Session), сохранение треков офлайн.
Чтобы получить настоящий APK/AAB для Google Play или прямой установки, PWA
упаковывается в **Trusted Web Activity** через Bubblewrap.

## 1. Требования

* Сервис развёрнут по **HTTPS** с публичным доменом (например `https://music.example.com`).
* JDK 17 и Android SDK (Bubblewrap скачает их сам при первом запуске).
* Node.js 18+.

## 2. Сборка

```bash
npm i -g @bubblewrap/cli
cd android
# подставьте свой домен вместо music.example.com в twa-manifest.json (host, iconUrl, webManifestUrl, fullScopeUrl)
bubblewrap init --manifest https://music.example.com/manifest.webmanifest   # или пропустите, если twa-manifest.json уже настроен
bubblewrap build
```

На выходе: `app-release-signed.apk` (для установки напрямую) и `app-release-bundle.aab` (для Play Console).
Ключ подписи `android.keystore` создаётся при первой сборке — **сохраните его**, без него нельзя обновлять приложение.

## 3. Digital Asset Links (убрать адресную строку)

Возьмите SHA-256 отпечаток ключа:

```bash
keytool -list -v -keystore android.keystore -alias avrmusic | grep SHA256
```

и пропишите его на сервере в `.env`:

```
ANDROID_PACKAGE=app.avrmusic.twa
ANDROID_SHA256=AA:BB:CC:...
```

Сервер сам отдаёт `https://music.example.com/.well-known/assetlinks.json`. После этого
приложение открывается на весь экран без браузерного интерфейса.
При публикации в Google Play с подписью от Google добавьте второй отпечаток через запятую.

## 4. Обновления

Само приложение — тонкая оболочка; весь интерфейс обновляется вместе с сервером,
пересобирать APK нужно только при смене иконки, имени или домена.
