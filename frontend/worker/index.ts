// @ts-nocheck
// Standard Service Worker logic (next-pwa will handle the rest)
const sw = self;

sw.addEventListener('push', (event: any) => {
  const data = event.data.json();
  sw.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192x192.png'
  });
});
