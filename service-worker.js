// Service Worker — Signage Admin PWA
// Handles: offline shell caching + FCM background push notifications

const CACHE_NAME = 'signage-admin-v4';
const SHELL_URLS = ['/admin.html', '/manifest.json', '/icons/icon.svg'];

// ── Firebase Messaging (background push) ──────────────────────────────────
// Uses the compat (non-module) SDK because importScripts is synchronous.
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyDYsip5Xx2N-gewNDqTj7EAnvabfbrBQTY',
  authDomain:        'digital-signage-2.firebaseapp.com',
  projectId:         'digital-signage-2',
  storageBucket:     'digital-signage-2.firebasestorage.app',
  messagingSenderId: '1004548485661',
  appId:             '1:1004548485661:web:b3ab204d94943716674cf4',
});

const messaging = firebase.messaging();

// Show a notification when the app is closed / in the background
messaging.onBackgroundMessage(payload => {
  const notif = payload.notification || {};
  return self.registration.showNotification(notif.title || 'Signage Alert', {
    body:    notif.body  || 'A screen needs your attention.',
    icon:    '/icons/icon.svg',
    badge:   '/icons/icon.svg',
    tag:     payload.data?.screenId || 'signage-alert',
    data:    payload.data || {},
    actions: [{ action: 'open', title: 'Open Admin' }],
  });
});

// Focus or open admin.html when the notification is tapped
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('/admin.html'));
      if (existing) return existing.focus();
      return clients.openWindow('/admin.html#screens');
    })
  );
});

// ── Shell caching ─────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first for shell files (always try to update), cache fallback for offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const { pathname } = new URL(e.request.url);
  const isShell = SHELL_URLS.some(u => pathname.endsWith(u.replace(/^\//, '')));
  if (!isShell) return;

  e.respondWith(
    fetch(new Request(e.request, { cache: 'reload' }))
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
