# AVRmusic для Android

Приложение — **Trusted Web Activity**: тонкая обёртка над сайтом `https://music.avthsr.space`, которая открывает
его на весь экран без адресной строки и системных панелей (sticky immersive, контент заходит и под вырез камеры;
панели появляются свайпом от края и прячутся сами), ставит иконку на рабочий стол, перехватывает ссылки на сайт и даёт
ярлыки «Поиск», «Медиатека», «Загрузки». Весь интерфейс приходит с сервера, поэтому обновлять APK нужно только
при смене иконки, имени или домена. На телефоне должен быть Chrome (или другой браузер на Chromium).

## Готовый APK

Собирается автоматически workflow'ом `.github/workflows/android.yml` и публикуется в
**GitHub → Releases** (`AVRmusic-<версия>.apk` + `SHA256SUMS.txt`). Сборка запускается при изменении папки
`android/`, версии в `package.json` или вручную («Run workflow»).

Что делает workflow:

1. Берёт ключ подписи с сервера (`/srv/avrmusic/android-keystore/`), а при первом запуске создаёт его и кладёт туда.
   **Сделайте копию этой папки**: без ключа нельзя выпустить обновление, которое встанет поверх установленного.
2. Собирает `assembleRelease` (Gradle 8.7, AGP 8.5, compileSdk 34, minSdk 21), версия = `package.json` + номер сборки.
3. Прописывает SHA-256 отпечаток ключа в `.env` сервера (`ANDROID_PACKAGE`, `ANDROID_SHA256`) и проверяет, что сайт
   отдаёт `/.well-known/assetlinks.json` с этим отпечатком — именно это убирает браузерный интерфейс.
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
(`launch_url`, `asset_statements`) и `res/xml/shortcuts.xml`. Пакет приложения — `space.avthsr.music`
(`app/build.gradle`, манифест, `shortcuts.xml`); он же должен быть в `ANDROID_PACKAGE` на сервере.
