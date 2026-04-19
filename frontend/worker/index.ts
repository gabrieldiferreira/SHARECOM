sw.addEventListener('fetch', (event: any) => {
  const url = new URL(event.request.url);

  // Intercepta o compartilhamento de arquivos
  if (event.request.method === 'POST' && url.pathname === '/api/share') {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const file = formData.get('receipt'); // Nome definido no manifest.json

      if (file) {
        // Guarda o arquivo no cache para o frontend pegar
        const cache = await caches.open('shared-files');
        await cache.put('/api/shared-file-tmp', new Response(file));
        
        // Redireciona para a home com o parâmetro de sinalização
        return Response.redirect('/?share-target=1', 303);
      }

      return Response.redirect('/', 303);
    })());
  }
});

sw.addEventListener('push', (event: any) => {
  const data = event.data.json();
  sw.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192x192.png'
  });
});
