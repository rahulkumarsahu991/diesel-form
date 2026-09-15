// Must live at the site root (not in a subfolder) so its scope covers the
// whole origin — this is what lets a push notification arrive even when
// manager-approval.html itself isn't open in any tab.
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAjgDscAwmwnyURrW52QFQb1NDBYcNqAzk",
  authDomain: "diesel-approval-notifications.firebaseapp.com",
  projectId: "diesel-approval-notifications",
  storageBucket: "diesel-approval-notifications.firebasestorage.app",
  messagingSenderId: "1004339629284",
  appId: "1:1004339629284:web:7bd0b4af2cac90b8c4f0f1"
});

var messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var n = payload.notification || {};
  var link = (payload.fcmOptions && payload.fcmOptions.link) || '/manager-approval.html';
  self.registration.showNotification(n.title || '🆕 New Diesel Request', {
    body: n.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    data: { url: link }
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/manager-approval.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(url) !== -1 && 'focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
