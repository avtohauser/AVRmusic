# AVRmusic для Android и iOS

**Нативное приложение** на Kotlin + Jetpack Compose с **Material 3 Expressive** (material3 1.5 alpha: `MaterialExpressiveTheme`,
`MotionScheme.expressive()`, `LoadingIndicator`, волнистые индикаторы и полоса перемотки, `MaterialShapes` и морфинг формы
кнопки «играть», `ShortNavigationBar`, `HorizontalFloatingToolbar`, `ToggleButton`, кнопки с морфингом формы при нажатии,
pull-to-refresh с expressive-индикатором) и шрифтом **Google Sans Flex** из гайдлайна — все оси (вес, ширина, округлость,
оптический размер); кириллицу, которой в нём нет, подхватывает Roboto Flex с теми же осями (цепочка шрифтов Android 10+).
Динамические цвета Android 12+. Работает с тем же сервером
`https://music.avthsr.space` через REST API; системные панели скрыты (появляются свайпом от края).

Экраны: вход/регистрация по коду приглашения, главная («Моя волна» с режимами, Предложка, подборки), поиск по серверу и
по каталогу (трек/альбом/дискография добавляются на сервер в одно касание), медиатека (любимые, плейлисты, альбомы,
исполнители), альбом, исполнитель, плейлист, жанр, полноэкранный плеер (очередь, текст песни, 👎 в волне), профиль.
Всё нативно, без WebView: профиль (аватар, имя, email, пароль, статистика, история), «Загрузки на сервер» (очередь и
прогресс), редактирование своих плейлистов, а для администратора — админ-панель (обзор и активность, пользователи с
правами и статистикой, приглашения со ссылками, загрузка аудиофайлов с телефона и импорт по ссылке, задачи, аккаунты
YouTube, треки с редактированием тегов/текста/канваса/обложки, отчёты о падениях приложения) и правка альбомов и
исполнителей прямо на их страницах. Ссылка-приглашение открывает регистрацию в приложении с уже вписанным кодом.

Музыку играет **ExoPlayer в `MediaSessionService` (Media3)** — вся очередь живёт в сервисе:
- в шторке и на экране блокировки — медиаплеер Android с ⏮ ⏯ ⏭ и ♥ «В избранное» (лайк уходит прямо на сервер);
- воспроизведение продолжается в фоне и с выключенным экраном; наушники/Bluetooth-кнопки работают;
- «Моя волна» сама подгружает следующие треки, каждое прослушивание отправляется в статистику;
- прослушанное кэшируется на телефоне (до 1 ГБ), повторы не тратят трафик.

Код — **Kotlin Multiplatform + Compose Multiplatform**: одно приложение для Android и iOS.
- `shared/src/commonMain/` — всё приложение: экраны (`ui/`), API и модели (`api/`), очередь, «Моя волна», офлайн
  (`player/`), настройки, язык. Сетевой слой — Ktor, картинки — Coil 3, иконки — Compose Resources.
- `shared/src/androidMain/`, `shared/src/iosMain/` — то, что у платформ своё (за `expect`/`actual`): хранение настроек,
  выбор файлов, «поделиться»/скачивание, шрифты и цвета системы, размытие обложек, видео-канвасы, превью, сеть,
  уведомления о новостях. На iOS там же движок плеера (`IosEngine`: AVPlayer, экран блокировки с ♥, фон).
- `app/` — Android-оболочка: `MainActivity`, `PlaybackService` (Media3) и `AndroidEngine` — мост к нему.
- `iosApp/` — iOS-оболочка на SwiftUI (проект XcodeGen: `project.yml`).

## Готовый IPA (iOS)

Workflow `.github/workflows/ios.yml`: при каждом изменении iOS-код компилируется на Linux (быстро и бесплатно), а сам
IPA собирается на macOS-раннере **по запросу** (Actions → ios → Run workflow) — macOS-минуты в приватном репозитории
считаются ×10. IPA публикуется в Releases как `ios-v<версия>`. Он не подписан: ставится через
[AltStore](https://altstore.io) или [Sideloadly](https://sideloadly.io) с вашим Apple ID (бесплатный — подпись на 7 дней,
AltStore продлевает её сам; платный Apple Developer — на год). iOS 16+.

## Готовый APK

Собирается автоматически workflow'ом `.github/workflows/android.yml` и публикуется в
**GitHub → Releases** (`AVRmusic-<версия>.apk` + `SHA256SUMS.txt`). Сборка запускается при изменении папки
`android/`, версии в `package.json` или вручную («Run workflow»).

Что делает workflow:

1. Берёт ключ подписи с сервера (`/srv/avrmusic/android-keystore/`), а при первом запуске создаёт его и кладёт туда.
   **Сделайте копию этой папки**: без ключа нельзя выпустить обновление, которое встанет поверх установленного.
2. Собирает `assembleRelease` (Gradle 8.13, AGP 8.13, Kotlin 2.3, compileSdk 36, minSdk 23), версия = `package.json` + номер сборки.
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
