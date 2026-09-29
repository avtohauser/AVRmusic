// Extra service-worker logic (imported by the generated Workbox SW).
// The "now playing" companion notification carries a like button: Chrome's media notification only
// supports the standard play/pause/previous/next/seek actions, so the like lives in a small
// notification right under it. Button presses are relayed to the open app window.
self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  if (n.tag !== 'avr-now') return;
  const data = n.data || {};
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (event.action === 'like' || event.action === 'next') {
      if (!wins.length) { n.close(); return; }
      for (const w of wins) w.postMessage({ type: 'avr-notify', action: event.action, trackId: data.trackId });
      return;
    }
    // tap on the notification body: bring the app forward and open the player
    if (wins.length) {
      const w = wins[0];
      try { await w.focus(); } catch (e) { /* not focusable */ }
      w.postMessage({ type: 'avr-notify', action: 'open', trackId: data.trackId });
    } else {
      await self.clients.openWindow('/');
    }
  })());
});
