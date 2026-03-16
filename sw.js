// MindTail Service Worker v2.3.0
const CACHE_NAME = 'mindtail-v2';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });

// ─── 요일별 1차 알림 문구 ─────────────────────────────
const MSG_PRIMARY = [
  // 일
  (name) => [`오늘 ${name}는 어떻게 지냈나요? 🌙`, `일요일 저녁, ${name}의 하루를 짧게 기록해봐요`],
  // 월
  (name) => [`${name}와 함께한 월요일은 어땠나요? 🐾`, `한 주의 시작, ${name}의 행동을 체크해봐요`],
  // 화
  (name) => [`오늘 ${name}의 행동을 확인해볼까요? 🐾`, `${name}의 오늘 하루를 기록해봐요`],
  // 수
  (name) => [`${name}, 오늘도 잘 지냈나요? 🐾`, `수요일 체크! ${name}의 행동 변화를 살펴봐요`],
  // 목
  (name) => [`오늘 ${name}의 행동을 체크해봐요 🐾`, `${name}의 하루를 기록하면 변화를 알 수 있어요`],
  // 금
  (name) => [`${name}와 함께한 하루 어땠나요? 🐾`, `주말 전 마지막 체크! ${name}의 오늘을 기록해봐요`],
  // 토
  (name) => [`주말에도 ${name} 체크를 잊지 마세요 🐾`, `${name}의 주말 행동도 소중한 기록이에요`],
];

// ─── 리마인드 알림 문구 ───────────────────────────────
const MSG_REMIND = [
  (name) => `오늘 ${name}의 기록이 아직 없어요 🐾`,
  (name) => `${name}의 오늘 행동, 아직 체크 전이에요`,
  (name) => `${name} 체크가 남아있어요. 10초면 충분해요!`,
];

// ─── 상태 관리 ────────────────────────────────────────
let _state = {
  primaryTimer: null,
  remindTimer: null,
  remindFiredToday: null, // 리마인드 발송한 날짜 (YYYY-MM-DD)
  petName: '반려견',
  hour: 21,
  minute: 0,
};

// ─── 유틸 ─────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// localStorage는 SW에서 직접 못 읽음 → 앱에서 메시지로 전달받은 값 사용
// 체크 완료 여부는 앱에서 CHECKED_TODAY 메시지로 알려줌
let _checkedToday = false;

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── 알림 발송 ────────────────────────────────────────
function firePrimary() {
  _checkedToday = false; // 매일 초기화
  const today = todayStr();
  const dow = new Date().getDay(); // 0=일 ~ 6=토
  const name = _state.petName;
  const [title, body] = MSG_PRIMARY[dow](name);

  self.registration.showNotification(title, {
    body,
    icon: '/icon-512.png',
    badge: '/icon-512.png',
    tag: 'mindtail-primary',
    renotify: true,
    data: { action: 'open_chat', date: today },
  });

  // 90분 후 리마인드 예약
  scheduleRemind(90 * 60 * 1000);
}

function fireRemind() {
  const today = todayStr();
  // 이미 오늘 리마인드 발송했거나 체크 완료면 스킵
  if (_state.remindFiredToday === today) return;
  if (_checkedToday) return;

  const name = _state.petName;
  const body = pickRandom(MSG_REMIND)(name);

  self.registration.showNotification('MindTail 🐾', {
    body,
    icon: '/icon-512.png',
    badge: '/icon-512.png',
    tag: 'mindtail-remind',
    renotify: true,
    data: { action: 'open_chat', date: today },
  });

  _state.remindFiredToday = today;
}

// ─── 스케줄링 ─────────────────────────────────────────
function scheduleRemind(delayMs) {
  if (_state.remindTimer) clearTimeout(_state.remindTimer);
  _state.remindTimer = setTimeout(() => {
    try { fireRemind(); } catch(e) {}
  }, delayMs);
}

function schedulePrimary(hour, minute) {
  if (_state.primaryTimer) clearTimeout(_state.primaryTimer);
  _state.hour = hour;
  _state.minute = minute;

  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const delay = next - now;
  _state.primaryTimer = setTimeout(() => {
    try {
      firePrimary();
      // 다음날 재스케줄
      schedulePrimary(hour, minute);
    } catch(e) {}
  }, delay);
}

function cancelAll() {
  if (_state.primaryTimer) { clearTimeout(_state.primaryTimer); _state.primaryTimer = null; }
  if (_state.remindTimer) { clearTimeout(_state.remindTimer); _state.remindTimer = null; }
}

// ─── 앱 → SW 메시지 수신 ─────────────────────────────
self.addEventListener('message', e => {
  const data = e.data;
  if (!data) return;

  // 알림 스케줄 설정
  if (data.type === 'SCHEDULE_ALARM') {
    const { hour, minute, petName } = data;
    if (petName) _state.petName = petName;
    schedulePrimary(hour, minute);
  }

  // 알림 취소
  if (data.type === 'CANCEL_ALARM') {
    cancelAll();
  }

  // 펫 이름 업데이트
  if (data.type === 'UPDATE_PET_NAME') {
    _state.petName = data.petName || '반려견';
  }

  // 오늘 체크 완료 → 리마인드 취소
  if (data.type === 'CHECKED_TODAY') {
    _checkedToday = true;
    if (_state.remindTimer) {
      clearTimeout(_state.remindTimer);
      _state.remindTimer = null;
    }
    // 리마인드 알림이 이미 표시됐으면 닫기
    self.registration.getNotifications({ tag: 'mindtail-remind' })
      .then(notifs => notifs.forEach(n => n.close()))
      .catch(() => {});
  }
});

// ─── 알림 클릭 → 앱 챗봇 화면으로 이동 ──────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const action = e.notification.data?.action || 'open_chat';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // 이미 열린 앱 탭이 있으면 포커스 + 화면 전환 메시지 전송
      for (const c of list) {
        if (c.url.includes(self.location.origin)) {
          c.focus();
          c.postMessage({ type: 'NOTIF_CLICK', action });
          return;
        }
      }
      // 앱이 닫혀있으면 새로 열기 (URL 파라미터로 액션 전달)
      if (clients.openWindow) {
        return clients.openWindow(`/?action=${action}`);
      }
    })
  );
});

// ─── 백그라운드 푸시 (서버 푸시용 - 기존 호환) ────────
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'MindTail 🐾';
  const options = {
    body: data.body || '오늘 체크를 잊지 않으셨나요?',
    icon: data.icon || '/icon-512.png',
    badge: '/icon-512.png',
    tag: data.tag || 'mindtail-daily',
    renotify: true,
    data: { action: 'open_chat' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});
