import { create } from 'zustand';

export type Lang = 'ru' | 'en';

const ru = {
  home: 'Главная', search: 'Поиск', library: 'Медиатека', downloads: 'Загрузки', admin: 'Админка', profile: 'Профиль', settings: 'Настройки',
  login: 'Войти', logout: 'Выйти', register: 'Регистрация', createAccount: 'Создать аккаунт', haveAccount: 'Уже есть аккаунт?', noAccount: 'Нет аккаунта?',
  email: 'E-mail', username: 'Имя пользователя', password: 'Пароль', displayName: 'Отображаемое имя', loginOrEmail: 'Логин или e-mail',
  play: 'Слушать', pause: 'Пауза', shuffle: 'Перемешать', repeat: 'Повтор', next: 'Следующий', prev: 'Предыдущий', queue: 'Очередь', lyrics: 'Текст', nowPlaying: 'Сейчас играет',
  playNext: 'Воспроизвести следующим', addToQueue: 'Добавить в очередь', addToPlaylist: 'Добавить в плейлист', removeFromPlaylist: 'Убрать из плейлиста', goToAlbum: 'Перейти к альбому', goToArtist: 'Перейти к исполнителю', startRadio: 'Запустить радио', share: 'Поделиться', copyLink: 'Скопировать ссылку', linkCopied: 'Ссылка скопирована',
  like: 'Нравится', unlike: 'Убрать из любимых', download: 'Скачать', downloadAll: 'Скачать всё (ZIP)', saveOffline: 'Сохранить офлайн', removeOffline: 'Удалить из офлайн', savedOffline: 'Сохранено офлайн', downloadedTracks: 'Скачанные треки',
  likedSongs: 'Любимые треки', playlists: 'Плейлисты', albums: 'Альбомы', artists: 'Исполнители', tracks: 'Треки', genres: 'Жанры', all: 'Всё',
  newPlaylist: 'Новый плейлист', createPlaylist: 'Создать плейлист', editPlaylist: 'Редактировать', deletePlaylist: 'Удалить плейлист', title: 'Название', description: 'Описание', publicPlaylist: 'Публичный плейлист', privatePlaylist: 'Приватный', save: 'Сохранить', cancel: 'Отмена', create: 'Создать', delete: 'Удалить', edit: 'Изменить',
  searchPlaceholder: 'Что хотите послушать?', nothingFound: 'Ничего не найдено', tryAnother: 'Попробуйте другой запрос', topResult: 'Лучший результат', browseAll: 'Обзор', recentSearches: 'Недавние запросы',
  emptyLibrary: 'Библиотека пуста', emptyLibraryHint: 'Загрузите музыку в админке или отсканируйте папку с коллекцией.', emptyPlaylist: 'В плейлисте пока пусто', emptyPlaylistHint: 'Найдите треки и добавьте их сюда.', emptyLiked: 'Пока нет любимых треков', emptyLikedHint: 'Нажимайте ♥ у треков, которые нравятся.', emptyDownloads: 'Нет сохранённых треков', emptyDownloadsHint: 'Сохраняйте треки офлайн, чтобы слушать без сети.',
  history: 'История', stats: 'Статистика', listened: 'Прослушано', topTracks: 'Топ треков', topArtists: 'Топ исполнителей', topGenres: 'Любимые жанры', clearHistory: 'Очистить историю',
  popular: 'Популярное', discography: 'Дискография', related: 'Похожие исполнители', appearsOn: 'Участие в', about: 'Об исполнителе', followers: 'подписчиков', monthlyListeners: 'слушателей в месяц', follow: 'Подписаться', following: 'Вы подписаны',
  album: 'Альбом', single: 'Сингл', ep: 'Мини-альбом', compilation: 'Сборник', playlist: 'Плейлист', artist: 'Исполнитель', track: 'Трек', by: 'от',
  noLyrics: 'Текст для этого трека пока не добавлен', lyricsNotSynced: 'Текст без синхронизации', canvas: 'Канвас',
  theme: 'Тема', dark: 'Тёмная', light: 'Светлая', language: 'Язык', changePassword: 'Сменить пароль', oldPassword: 'Старый пароль', newPassword: 'Новый пароль', passwordChanged: 'Пароль изменён', profileSaved: 'Профиль сохранён', avatar: 'Аватар', installApp: 'Установить приложение', installed: 'Приложение установлено', offlineMode: 'Вы офлайн — доступны сохранённые треки',
  upload: 'Загрузить', uploadTracks: 'Загрузка треков', dropHere: 'Перетащите аудиофайлы сюда или нажмите, чтобы выбрать', supported: 'MP3, FLAC, M4A, OGG, OPUS, WAV', scan: 'Сканировать папку', scanHint: 'Импортирует файлы из MUSIC_DIR без копирования', imported: 'Импортировано', skipped: 'Пропущено', overview: 'Обзор', users: 'Пользователи', manageTracks: 'Треки', role: 'Роль', storage: 'Хранилище', withLyrics: 'с текстами', withCanvas: 'с канвасами', reindex: 'Переиндексировать поиск',
  editTrack: 'Редактирование трека', genre: 'Жанр', year: 'Год', trackNo: '№ трека', explicit: 'Explicit', featuring: 'При участии (через запятую)', syncedLyrics: 'Синхронизированный текст (LRC)', plainLyrics: 'Текст', uploadLrc: 'Загрузить .lrc/.txt', uploadCanvas: 'Загрузить канвас', canvasHint: 'Короткое вертикальное видео (mp4/webm, 3–8 с) или анимация (gif/webp/svg)', removeCanvas: 'Удалить канвас', uploadCover: 'Загрузить обложку', deleteTrack: 'Удалить трек', confirmDelete: 'Удалить безвозвратно?',
  added: 'Добавлено', removed: 'Удалено', saved: 'Сохранено', error: 'Ошибка', loading: 'Загрузка…', more: 'Ещё', showAll: 'Показать все', minutes: 'мин', hours: 'ч', tracksCount: 'треков', addedAt: 'Добавлено', duration: 'Длительность',
  welcome: 'Добро пожаловать', setupTitle: 'Первый запуск', setupHint: 'Создайте аккаунт администратора — он получит доступ к загрузке музыки и управлению сервисом.', guest: 'Гость', signInToListen: 'Войдите, чтобы слушать, сохранять и скачивать музыку.',
  volume: 'Громкость', mute: 'Без звука', fullscreen: 'На весь экран', close: 'Закрыть', sleepTimer: 'Таймер сна', speed: 'Скорость', keyboard: 'Горячие клавиши',
  quickPicks: 'Быстрый доступ', madeForYou: 'Подобрано для вас', newReleases: 'Новые релизы', recentlyPlayed: 'Недавно слушали', communityPlaylists: 'Плейлисты сообщества',
  offline: 'Офлайн', online: 'В сети',
};
export type Dict = typeof ru;

const en: Dict = {
  home: 'Home', search: 'Search', library: 'Library', downloads: 'Downloads', admin: 'Admin', profile: 'Profile', settings: 'Settings',
  login: 'Log in', logout: 'Log out', register: 'Sign up', createAccount: 'Create account', haveAccount: 'Already have an account?', noAccount: 'No account yet?',
  email: 'E-mail', username: 'Username', password: 'Password', displayName: 'Display name', loginOrEmail: 'Username or e-mail',
  play: 'Play', pause: 'Pause', shuffle: 'Shuffle', repeat: 'Repeat', next: 'Next', prev: 'Previous', queue: 'Queue', lyrics: 'Lyrics', nowPlaying: 'Now playing',
  playNext: 'Play next', addToQueue: 'Add to queue', addToPlaylist: 'Add to playlist', removeFromPlaylist: 'Remove from playlist', goToAlbum: 'Go to album', goToArtist: 'Go to artist', startRadio: 'Start radio', share: 'Share', copyLink: 'Copy link', linkCopied: 'Link copied',
  like: 'Like', unlike: 'Remove from liked', download: 'Download', downloadAll: 'Download all (ZIP)', saveOffline: 'Save offline', removeOffline: 'Remove offline copy', savedOffline: 'Saved offline', downloadedTracks: 'Downloaded tracks',
  likedSongs: 'Liked songs', playlists: 'Playlists', albums: 'Albums', artists: 'Artists', tracks: 'Tracks', genres: 'Genres', all: 'All',
  newPlaylist: 'New playlist', createPlaylist: 'Create playlist', editPlaylist: 'Edit', deletePlaylist: 'Delete playlist', title: 'Title', description: 'Description', publicPlaylist: 'Public playlist', privatePlaylist: 'Private', save: 'Save', cancel: 'Cancel', create: 'Create', delete: 'Delete', edit: 'Edit',
  searchPlaceholder: 'What do you want to listen to?', nothingFound: 'Nothing found', tryAnother: 'Try another query', topResult: 'Top result', browseAll: 'Browse all', recentSearches: 'Recent searches',
  emptyLibrary: 'Library is empty', emptyLibraryHint: 'Upload music in the admin panel or scan a folder.', emptyPlaylist: 'This playlist is empty', emptyPlaylistHint: 'Find tracks and add them here.', emptyLiked: 'No liked songs yet', emptyLikedHint: 'Tap ♥ on tracks you love.', emptyDownloads: 'No saved tracks', emptyDownloadsHint: 'Save tracks offline to listen without a network.',
  history: 'History', stats: 'Stats', listened: 'Listened', topTracks: 'Top tracks', topArtists: 'Top artists', topGenres: 'Top genres', clearHistory: 'Clear history',
  popular: 'Popular', discography: 'Discography', related: 'Fans also like', appearsOn: 'Appears on', about: 'About', followers: 'followers', monthlyListeners: 'monthly listeners', follow: 'Follow', following: 'Following',
  album: 'Album', single: 'Single', ep: 'EP', compilation: 'Compilation', playlist: 'Playlist', artist: 'Artist', track: 'Track', by: 'by',
  noLyrics: 'No lyrics for this track yet', lyricsNotSynced: 'Unsynced lyrics', canvas: 'Canvas',
  theme: 'Theme', dark: 'Dark', light: 'Light', language: 'Language', changePassword: 'Change password', oldPassword: 'Old password', newPassword: 'New password', passwordChanged: 'Password changed', profileSaved: 'Profile saved', avatar: 'Avatar', installApp: 'Install app', installed: 'App installed', offlineMode: 'You are offline — saved tracks are available',
  upload: 'Upload', uploadTracks: 'Upload tracks', dropHere: 'Drop audio files here or click to choose', supported: 'MP3, FLAC, M4A, OGG, OPUS, WAV', scan: 'Scan folder', scanHint: 'Imports files from MUSIC_DIR without copying', imported: 'Imported', skipped: 'Skipped', overview: 'Overview', users: 'Users', manageTracks: 'Tracks', role: 'Role', storage: 'Storage', withLyrics: 'with lyrics', withCanvas: 'with canvas', reindex: 'Rebuild search index',
  editTrack: 'Edit track', genre: 'Genre', year: 'Year', trackNo: 'Track #', explicit: 'Explicit', featuring: 'Featuring (comma separated)', syncedLyrics: 'Synced lyrics (LRC)', plainLyrics: 'Lyrics', uploadLrc: 'Upload .lrc/.txt', uploadCanvas: 'Upload canvas', canvasHint: 'Short vertical video (mp4/webm, 3–8 s) or animation (gif/webp/svg)', removeCanvas: 'Remove canvas', uploadCover: 'Upload cover', deleteTrack: 'Delete track', confirmDelete: 'Delete permanently?',
  added: 'Added', removed: 'Removed', saved: 'Saved', error: 'Error', loading: 'Loading…', more: 'More', showAll: 'Show all', minutes: 'min', hours: 'h', tracksCount: 'tracks', addedAt: 'Added', duration: 'Duration',
  welcome: 'Welcome', setupTitle: 'First run', setupHint: 'Create the administrator account — it can upload music and manage the service.', guest: 'Guest', signInToListen: 'Sign in to listen, save and download music.',
  volume: 'Volume', mute: 'Mute', fullscreen: 'Fullscreen', close: 'Close', sleepTimer: 'Sleep timer', speed: 'Speed', keyboard: 'Keyboard shortcuts',
  quickPicks: 'Quick picks', madeForYou: 'Made for you', newReleases: 'New releases', recentlyPlayed: 'Recently played', communityPlaylists: 'Community playlists',
  offline: 'Offline', online: 'Online',
};

const dicts: Record<Lang, Dict> = { ru, en };

interface I18nState { lang: Lang; setLang: (l: Lang) => void }
const initial = ((): Lang => { try { return (localStorage.getItem('avr.lang') as Lang) || 'ru'; } catch { return 'ru'; } })();
export const useI18n = create<I18nState>((set) => ({
  lang: initial,
  setLang: (lang) => { try { localStorage.setItem('avr.lang', lang); } catch { /* ignore */ } document.documentElement.lang = lang; set({ lang }); },
}));

export function useT() {
  const lang = useI18n((s) => s.lang);
  return (key: keyof Dict) => dicts[lang][key] ?? ru[key] ?? key;
}
export function t(key: keyof Dict) {
  return dicts[useI18n.getState().lang][key] ?? ru[key] ?? key;
}
