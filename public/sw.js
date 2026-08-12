// Service worker mínimo — garante instalabilidade (PWA).
// Estratégia: rede primeiro; sem cache agressivo para nunca servir agenda velha.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* passthrough */
});
