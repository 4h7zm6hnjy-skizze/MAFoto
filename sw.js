/* Local/offline shell cache. Camera permissions still require an HTTPS origin. */
const CACHE='mafoto-shell-v1.0.0';
const ASSETS=['./','./index.html','./styles.css','./app.js','./imaging.js','./manifest.webmanifest','./assets/icon-180.png','./assets/icon-192.png','./assets/icon-512.png','./assets/MAFoto-Logo.png','./assets/MAFoto-Original-Logo.jpg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mafoto-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(!url.pathname.startsWith(new URL('./',self.registration.scope).pathname))return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request);
      if(response.ok){const cache=await caches.open(CACHE);cache.put(event.request,response.clone());}
      return response;
    }catch{
      const response=await caches.match(event.request,{ignoreSearch:true});
      if(response)return response;
      if(event.request.mode==='navigate')return caches.match('./index.html');
      return new Response('Offline und nicht im Cache',{status:503});
    }
  })());
});
