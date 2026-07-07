// Primo Invoice Service Worker — handles push notifications
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

// Handle push notifications from server
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data.json(); } catch(err) { data = { title: 'Primo Invoice', body: e.data ? e.data.text() : 'You have a job today' }; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Primo Invoice', {
      body: data.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: data.tag || 'primo-job',
      data: data.url ? { url: data.url } : {},
      actions: [
        { action: 'view', title: 'View jobs' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      requireInteraction: true
    })
  );
});

// Handle notification click
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'dismiss') return;
  var url = (e.notification.data && e.notification.data.url) ? e.notification.data.url : '/jobs.html';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
    for (var i = 0; i < clientList.length; i++) {
      var client = clientList[i];
      if (client.url.includes('primoinvoice.com') && 'focus' in client) {
        client.navigate(url); return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});

// Handle scheduled alarm messages from the app
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SCHEDULE_NOTIFICATION') {
    var job = e.data.job;
    var delay = e.data.delay;
    setTimeout(function() {
      self.registration.showNotification('Job today — ' + job.title, {
        body: (job.customer_name ? job.customer_name : '') + (job.time ? ' at ' + job.time : '') + (job.address ? '\n' + job.address : ''),
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: 'job-' + job.id,
        data: { url: '/jobs.html' },
        requireInteraction: false
      });
    }, delay);
  }
});
