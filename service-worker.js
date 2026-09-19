/* MichiHub - Service Worker
   Objetivo: que la app abra aunque no haya internet.

   - Al instalarse guarda las páginas y archivos propios (precaché).
   - Páginas (index, chat, radio): primero intenta la red (así siempre ves la versión más nueva)
     y, si no hay internet o tarda demasiado, usa la copia guardada.
   - Archivos propios (íconos, sonidos, scripts): salen de la copia guardada al instante
     y se actualizan en segundo plano.
   - Librerías y fuentes externas (jsDelivr, Google Fonts, textura de fondo): igual que arriba.
   - Todo lo demás (Supabase, inicio de sesión de Google/GitHub, radio en vivo, APIs de gatos)
     va directo a la red y NUNCA se guarda.

   Para publicar una versión nueva de la caché, sube el número de VERSION. */

const VERSION = "michihub-v2";
const CACHE_PRECARGA = VERSION + "-precarga";
const CACHE_DINAMICA = VERSION + "-dinamica";

const ARCHIVOS = [
    "./",
    "index.html",
    "chat.html",
    "Radio.html",
    "manifest.json",
    "offline.js",
    "icon-192.png",
    "icon-512.png",
    "radio-beep.mp3"
];

const HOSTS_EXTERNOS_CACHEABLES = [
    "cdn.jsdelivr.net",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "www.transparenttextures.com"
];

const ESPERA_RED_PAGINAS_MS = 4000;

self.addEventListener("install", (evento) => {
    evento.waitUntil((async () => {
        const cache = await caches.open(CACHE_PRECARGA);
        // Si un archivo falla, los demás se guardan igual
        await Promise.allSettled(
            ARCHIVOS.map((archivo) => cache.add(new Request(archivo, { cache: "reload" })))
        );
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (evento) => {
    evento.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(
            nombres
                .filter((nombre) => nombre.indexOf(VERSION) !== 0)
                .map((nombre) => caches.delete(nombre))
        );
        await self.clients.claim();
    })());
});

function conTiempo(promesa, ms){
    return new Promise((resolver, rechazar) => {
        const temporizador = setTimeout(() => rechazar(new Error("Tiempo de espera agotado")), ms);
        promesa.then(
            (valor) => { clearTimeout(temporizador); resolver(valor); },
            (error) => { clearTimeout(temporizador); rechazar(error); }
        );
    });
}

// Páginas: red primero, copia guardada si falla
async function paginaRedPrimero(peticion){
    try{
        const respuesta = await conTiempo(fetch(peticion), ESPERA_RED_PAGINAS_MS);
        if(respuesta && respuesta.ok){
            const cache = await caches.open(CACHE_DINAMICA);
            cache.put(peticion, respuesta.clone());
        }
        return respuesta;
    }catch(error){
        const guardada = await caches.match(peticion, { ignoreSearch: true });
        if(guardada) return guardada;
        const inicio = await caches.match("index.html");
        return inicio || Response.error();
    }
}

// Archivos: copia guardada al instante y se actualiza en segundo plano
async function rapidoYActualiza(evento, peticion, mismoOrigen){
    const guardada = await caches.match(peticion, { ignoreSearch: mismoOrigen });

    const actualizacion = fetch(peticion)
        .then(async (respuesta) => {
            if(respuesta && (respuesta.ok || respuesta.type === "opaque")){
                const cache = await caches.open(CACHE_DINAMICA);
                await cache.put(peticion, respuesta.clone());
            }
            return respuesta;
        })
        .catch(() => null);

    if(guardada){
        evento.waitUntil(actualizacion);
        return guardada;
    }
    return (await actualizacion) || Response.error();
}

self.addEventListener("fetch", (evento) => {
    const peticion = evento.request;
    if(peticion.method !== "GET") return;

    const url = new URL(peticion.url);
    if(url.protocol !== "http:" && url.protocol !== "https:") return;

    const mismoOrigen = url.origin === self.location.origin;

    if(mismoOrigen){
        if(peticion.mode === "navigate"){
            evento.respondWith(paginaRedPrimero(peticion));
            return;
        }
        // Audio y video piden "rangos": se sirven desde la copia guardada si existe
        if(peticion.headers.has("range")){
            evento.respondWith(
                caches.match(peticion, { ignoreSearch: true }).then((guardada) => guardada || fetch(peticion))
            );
            return;
        }
        evento.respondWith(rapidoYActualiza(evento, peticion, true));
        return;
    }

    if(HOSTS_EXTERNOS_CACHEABLES.indexOf(url.hostname) !== -1){
        evento.respondWith(rapidoYActualiza(evento, peticion, false));
    }
    // Cualquier otro sitio (Supabase, Google, GitHub, radio en vivo, APIs) va directo a la red
});
