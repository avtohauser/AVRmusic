# Сайты на avthsr.space

`mirror/` — то, что видит браузер (workflow **sites**: имена из публичных журналов сертификатов, страницы,
стили и скрипты). kgs, lks54 и music не снимаем; kgs, lks54 и old не переделываем.

| Сайт | Что это | Устройство |
|---|---|---|
| **avthsr.space** (и www) | визитка avr — слайдер: сервисы (music, tube, gram, портфолио) и проекты | статика из `sites/main/` (`node build.mjs` собирает `dist/`), стиль `brand/` |
| **explore.avthsr.space** | «Stefan» — портфолио: бенто-сетка плиток, лента постов, Spotify «сейчас слушаю», терминал с пасхалками | React + Vite, Express на сервере за nginx, исходников в репозитории нет |
| **old.avthsr.space** | «Stefan / Avtohauser - Home» — прошлая версия домашней страницы | 4 статичные страницы: главная, обо мне, проекты, навыки. **Не переделываем** — намеренный стиль web 1.0 |

## Пасхалки основного сайта (их сохраняем при переделке)

**Маршруты:** `/`, `/about`, `/projects`, `/skills`, `/contact`, `/feed`, `/post/:id`, `/login`, `/settings`, скрытые
`/white-space` и `/black-space-2/*`.

**Терминал** (команды): `help`, `whoami`, `ls`, `cd`, `pwd`, `uname`, `clear`, `intro`, `about`, `projects`, `skills`,
`education`, `hardware`, `contact`, `feeds`, `fortune` (цитаты), `matrix` («Follow the white rabbit»), `meow` (мурчание
со звуком), `coffi`, `test`, `ri`, `friends`, `together`, `spotify`, `recently-listened`, `terminal-activity`, `login`,
`sudo`, `rm`, `hack`, `exit`, `blackspace` («REALITY BREACH DETECTED» → глитч → белое пространство), `unlock`,
`kill-glitch`, `reset-count`, `reset-terminal`.

**Состояние, которое терминал помнит:** найденные секреты и их список, «уровень доверия», счётчик команд,
журнал активности, статус виселицы, «открытие пустоты» (void), первый контакт, определённая ОС, серия
неверных команд (после неё — глитч страницы), отметка «seen_the_truth», друзья терминала.

## Дальше

Для переделки основного сайта нужен его исходный код (React-проект и бэкенд) — сборка в `mirror/` годится
как справка по пасхалкам, но не как основа. Explore — простая страница, её можно переводить на стиль avr
(`brand/avr.css` + `brand/avr.js`) прямо отсюда. Old остаётся как есть. План работ — `docs/handoff/README.md`.

Портфолио с 9 октября 2026 живёт на explore (раньше — на основном домене); `localStorage` привязан к адресу, поэтому прогресс терминала у посетителей начался заново.
