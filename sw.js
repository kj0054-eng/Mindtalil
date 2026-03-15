// MindTail Service Worker v1
const CACHE_NAME = 'mindtail-v2';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// 백그라운드 푸시 알림 수신
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'MindTail 🐾';
  const options = {
    body: data.body || '오늘 체크를 잊지 않으셨나요?',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'mindtail-daily',
    renotify: true,
    data: { url: data.url || '/' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 시 앱 열기
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url === '/' && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// 알람 스케줄 메시지 수신 (앱 → SW)
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_ALARM') {
    const { hour, minute } = e.data;
    scheduleDaily(hour, minute);
  }
  if (e.data?.type === 'CANCEL_ALARM') {
    if (self._alarmTimer) clearTimeout(self._alarmTimer);
  }
});

function scheduleDaily(hour, minute) {
  if (self._alarmTimer) clearTimeout(self._alarmTimer);
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next - now;
  self._alarmTimer = setTimeout(() => {
    self.registration.showNotification('MindTail 🐾', {
      body: '오늘 뭉이 체크 아직 안 했어요! 10초면 돼요 🐾',
      icon: '/icon-192.png',
      tag: 'mindtail-daily',
      renotify: true,
    });
    scheduleDaily(hour, minute); // 다음날 재스케줄
  }, delay);
}
