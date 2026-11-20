const CACHE = 'green-bat-prompt-vault-underground-photo-v5-after-dark';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=underground-photo-v1',
  './record-vault.css?v=underground-photo-v1',
  './app.js?v=after-dark-2026-11',
  './starter-data.js?v=after-dark-2026-11',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/vault/4th-movement.webp',
  './assets/vault/after-dark.webp',
  './assets/vault/blank-sleeve.webp',
  './assets/vault/brand-lockup.webp',
  './assets/vault/crate-back.webp',
  './assets/vault/crate-front.webp',
  './assets/vault/enter-the-end.webp',
  './assets/vault/ever-after.webp',
  './assets/vault/green-finish.webp',
  './assets/vault/loose-change.webp',
  './assets/vault/pillars.webp',
  './assets/vault/room.webp',
  './assets/vault/state-of-tension.webp',
  './assets/vault/track-finish.webp',
  './assets/vault/vertigo-crate.webp',
  './assets/vault/vertigo.webp',
  './assets/vault/vinyl.webp',
  './assets/vault/walnut.webp',
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('green-bat-prompt-vault-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url),scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const isAppAsset=request.mode==='navigate'||/\.(?:html|css|js|json|webmanifest)$/.test(url.pathname);
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(isAppAsset){
      try{
        const response=await fetch(request,{cache:'no-store'});
        if(response.ok)await cache.put(request,response.clone());
        return response;
      }catch(err){
        return await cache.match(request) ||
          (request.mode === 'navigate' && await cache.match('./index.html')) || Response.error();
      }
    }
    const old=await cache.match(request);
    if(old)return old;
    const response=await fetch(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
  })());
});