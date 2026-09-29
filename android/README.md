# AVRmusic для Android

Приложение показывает сайт `https://music.avthsr.space` в полноэкранном **WebView**: системные панели скрыты
(появляются свайпом от края и прячутся сами), контент идёт под вырез камеры, а безопасные отступы страница получает
через CSS-переменные `--safe-t/-r/-b/-l` (и `--safe-t-bar` — для верхней панели, которая может подниматься до самого
края, если камера по центру). Весь интерфейс приходит с сервера, поэтому APK обновлять нужно только ради изменений в
самом приложении.

Музыку играет само приложение: **ExoPlayer в `MediaSessionService` (Media3)**. Поэтому
- в шторке и на экране блокировки — обычный медиаплеер Android с ⏮ ⏯ ⏭ и кнопкой ♥ «В избранное»;
- воспроизведение не прерывается в фоне и с выключенным экраном; наушники/Bluetooth-кнопки работают.

Очередь живёт на странице: страница говорит приложению, что играть (`window.AVRNative`, см.
`NativeBridge.java` и `apps/web/src/lib/nativeAudio.ts`), а приложение сообщает о событиях плеера и нажатиях кнопок
(⏭, ⏮, ♥) через `window.__avrNative(type, data)`. Скачанные для офлайна треки один раз передаются приложению и дальше
играют из его файла. Кнопка «назад» сначала закрывает открытый плеер/меню, потом идёт назад по страницам.

Файлы: `MainActivity` (WebView, панели, отступы, «назад», выбор файлов, загрузки), `PlaybackService` (плеер и
кнопка ♥), `PlayerClient` (MediaController ↔ страница), `NativeBridge` (JS-интерфейс), `Hub` (связка между ними).

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
