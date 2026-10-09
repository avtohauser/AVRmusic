# Сайты на avthsr.space

`mirror/` — то, что видит браузер (workflow **sites**: имена из публичных журналов сертификатов, страницы,
стили и скрипты). kgs, lks54 и music не снимаем; kgs, lks54 и old не переделываем.

| Сайт | Что это | Устройство |
|---|---|---|
| **avthsr.space** (и www) | «Stefan» — личный сайт: бенто-сетка плиток, лента постов, Spotify «сейчас слушаю», встроенный терминал с пасхалками | React + Vite (сборка в режиме разработки), Framer Motion, данные с бэкенда `/api/data` (запасной `/data.json`), вход и правка плиток |
| **explore.avthsr.space** | «AVR - Studio» — витрина проектов с объёмными карточками | одна HTML-страница, Tailwind, свои CSS-переменные |
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
