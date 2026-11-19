/* Green Bat Prompt Vault — compact-v3-20261118: network-first assets and reliable updates */
const CACHE='green-bat-prompt-vault-record-vault-mockup-v4-20261118';
const ASSETS=['./','./index.html','./styles.css?v=record-vault-mockup-v4-20261118','./record-vault.css?v=record-vault-mockup-v4-20261118','./app.js?v=record-vault-mockup-v4-20261118','./starter-data.js?v=record-vault-mockup-v4-20261118','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/green-bat-logo.png','./assets/sleeves/vertigo.svg','./assets/sleeves/state-of-tension.svg','./assets/sleeves/enter-the-end.svg','./assets/sleeves/4th-movement.svg','./assets/sleeves/after-dark.svg','./assets/sleeves/loose-change.svg','./assets/sleeves/ever-after.svg','./assets/sleeves/pillars.svg','./assets/crate-wood.svg'];
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
        return await cache.match(request)||await cache.match('./index.html')||Response.error();
      }
    }
    const old=await cache.match(request);
    if(old)return old;
    const response=await fetch(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
  })());
});