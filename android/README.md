# AVRmusic для Android

**Нативное приложение** на Kotlin + Jetpack Compose (Material 3, динамические цвета Android 12+, шрифт Roboto Flex с
переменными осями — заголовки широкие и жирные, как на сайте). Работает с тем же сервером
`https://music.avthsr.space` через REST API; системные панели скрыты (появляются свайпом от края).

Экраны: вход/регистрация по коду приглашения, главная («Моя волна» с режимами, Предложка, подборки), поиск по серверу и
по каталогу (трек/альбом/дискография добавляются на сервер в одно касание), медиатека (любимые, плейлисты, альбомы,
исполнители), альбом, исполнитель, плейлист, жанр, полноэкранный плеер (очередь, текст песни, 👎 в волне), профиль.
Админ-панель, профиль на сайте и загрузка файлов открываются внутри приложения во WebView — с отдельной сессией
(`POST /api/auth/fork`), поэтому входить второй раз не нужно.

Музыку играет **ExoPlayer в `MediaSessionService` (Media3)** — вся очередь живёт в сервисе:
- в шторке и на экране блокировки — медиаплеер Android с ⏮ ⏯ ⏭ и ♥ «В избранное» (лайк уходит прямо на сервер);
- воспроизведение продолжается в фоне и с выключенным экраном; наушники/Bluetooth-кнопки работают;
- «Моя волна» сама подгружает следующие треки, каждое прослушивание отправляется в статистику;
- прослушанное кэшируется на телефоне (до 1 ГБ), повторы не тратят трафик.

Код (`app/src/main/java/space/avthsr/music/`): `api/` — API, модели, лайки; `player/` — `PlaybackService`
(плеер, ♥, волна, отчёты о прослушиваниях), `PlayerConn` (MediaController для экранов), `Queue` (общее состояние);
`ui/` — экраны Compose.

## Готовый APK

Собирается автоматически workflow'ом `.github/workflows/android.yml` и публикуется в
**GitHub → Releases** (`AVRmusic-<версия>.apk` + `SHA256SUMS.txt`). Сборка запускается при изменении папки
`android/`, версии в `package.json` или вручную («Run workflow»).

Что делает workflow:

1. Берёт ключ подписи с сервера (`/srv/avrmusic/android-keystore/`), а при первом запуске создаёт его и кладёт туда.
   **Сделайте копию этой папки**: без ключа нельзя выпустить обновление, которое встанет поверх установленного.
2. Собирает `assembleRelease` (Gradle 8.7, AGP 8.5, compileSdk 34, minSdk 21), версия = `package.json` + номер сборки.
3. Прописывает SHA-256 отпечаток ключа в `.env` сервера (`ANDROID_PACKAGE`, `ANDROID_SHA256`) и проверяет, что сайт
   отдаёт `/.well-known/assetlinks.json` с этим отпечатком — так ссылки на сайт открываются сразу в приложении.
4. Создаёт релиз `android-v<версия>` с APK.

## Сборка вручную

```bash
cd android
export KEYSTORE_FILE=/path/avrmusic.jks KEYSTORE_PASSWORD=... KEY_ALIAS=avrmusic
APP_VERSION_CODE=42 APP_VERSION_NAME=0.1.0.42 gradle assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

Без `KEYSTORE_FILE` получится неподписанный APK (не установится). Иконки для всех плотностей генерируются из
PWA-иконок: `node android/tools/gen-icons.mjs`.

## Смена домена

`music.avthsr.space` прописан в `app/src/main/AndroidManifest.xml` (intent-filter), `res/values/strings.xml`
(`site_url`) и `res/xml/shortcuts.xml`. Пакет приложения — `space.avthsr.music`
(`app/build.gradle`, манифест, `shortcuts.xml`); он же должен быть в `ANDROID_PACKAGE` на сервере.
