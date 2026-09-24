/* MichiHub - Service Worker */
const VERSION = "michihub-v4";
const CACHE_PRECARGA = VERSION + "-precarga";
const CACHE_DINAMICA = VERSION + "-dinamica";
const ARCHIVOS = ["./", "index.html", "chat.html", "Radio.html", "frecuencia.html", "manifest.json", "offline.js", "icon-192.png", "icon-512.png", "radio-beep.mp3"];
// Recursos externos que las páginas necesitan para arrancar: se guardan al instalar, para que la
// app abra sin internet aunque la primera visita haya sido la única con conexión.
const EXTERNOS_PRECARGA = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://fonts.googleapis.com/css2?family=Nunito:wght@400;700&family=Playfair+Display:ital@1&display=swap",
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap",
  "https://www.transparenttextures.com/patterns/cream-paper.png"
];
const HOSTS_EXTERNOS_CACHEABLES = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com", "www.transparenttextures.com"];
const ESPERA_RED_PAGINAS_MS = 4000;

self.addEventListener("install", evento => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_PRECARGA);
    await Promise.allSettled(ARCHIVOS.map(archivo => cache.add(new Request(archivo, {cache: "reload"}))));
    // Los externos se piden sin CORS (respuesta opaca) porque así los pide la página; cache.add() rechaza esas respuestas.
    await Promise.allSettled(EXTERNOS_PRECARGA.map(async url => {
      const respuesta = await fetch(new Request(url, {mode: "no-cors"}));
      await cache.put(url, respuesta);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", evento => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(nombre => !nombre.startsWith(VERSION)).map(nombre => caches.delete(nombre)));
    await self.clients.claim();
  })());
});

function conTiempo(promesa, ms){
  return new Promise((resolver, rechazar) => {
    const temporizador = setTimeout(() => rechazar(new Error("timeout")), ms);
    promesa.then(valor => { clearTimeout(temporizador); resolver(valor); }, error => { clearTimeout(temporizador); rechazar(error); });
  });
}

async function paginaRedPrimero(peticion){
  try{
    const respuesta = await conTiempo(fetch(peticion), ESPERA_RED_PAGINAS_MS);
    if(respuesta && respuesta.ok) (await caches.open(CACHE_DINAMICA)).put(peticion, respuesta.clone());
    return respuesta;
  }catch(error){
    return await caches.match(peticion, {ignoreSearch: true}) || await caches.match("index.html") || Response.error();
  }
}

async function rapidoYActualiza(evento, peticion, mismoOrigen){
  const guardada = await caches.match(peticion, {ignoreSearch: mismoOrigen});
  const actualizacion = fetch(peticion).then(async respuesta => {
    if(respuesta && (respuesta.ok || respuesta.type === "opaque")) (await caches.open(CACHE_DINAMICA)).put(peticion, respuesta.clone());
    return respuesta;
  }).catch(() => null);
  if(guardada){ evento.waitUntil(actualizacion); return guardada; }
  return (await actualizacion) || Response.error();
}

self.addEventListener("fetch", evento => {
  const peticion = evento.request;
  if(peticion.method !== "GET") return;
  const url = new URL(peticion.url);
  if(url.protocol !== "http:" && url.protocol !== "https:") return;
  const mismoOrigen = url.origin === self.location.origin;
  if(mismoOrigen){
    if(peticion.mode === "navigate"){ evento.respondWith(paginaRedPrimero(peticion)); return; }
    if(peticion.headers.has("range")){ evento.respondWith(caches.match(peticion, {ignoreSearch: true}).then(guardada => guardada || fetch(peticion))); return; }
    evento.respondWith(rapidoYActualiza(evento, peticion, true));
    return;
  }
  if(HOSTS_EXTERNOS_CACHEABLES.includes(url.hostname)) evento.respondWith(rapidoYActualiza(evento, peticion, false));
});
