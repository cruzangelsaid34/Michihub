// supabase/functions/send-push/index.ts
// Despliegue: supabase functions deploy send-push --no-verify-jwt
//
// Variables de entorno necesarias (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen automáticamente
//  dentro de toda Edge Function, no hace falta configurarlas)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:michihub@hotmail.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();

    // Admite dos formas de llamada:
    // 1) Manual/directa:  { title, body, url, usuario_excluir }
    // 2) Database Webhook de Supabase en INSERT sobre "mensajes":
    //    { type:"INSERT", table:"mensajes", record:{ usuario, texto } }
    let titulo: string, cuerpo: string, url: string, usuarioExcluir: string | null;

    if (payload.type === "INSERT" && payload.table === "mensajes") {
      titulo = "💬 Nuevo mensaje en MichiHub";
      cuerpo = `${payload.record.usuario}: ${payload.record.texto}`.slice(0, 140);
      url = "./chat.html";
      usuarioExcluir = payload.record.usuario || null;
    } else {
      titulo = payload.title || "MichiHub";
      cuerpo = payload.body || "";
      url = payload.url || "./index.html";
      usuarioExcluir = payload.usuario_excluir || null;
    }

    let consulta = supabase.from("suscripciones_push").select("*");
    if (usuarioExcluir) consulta = consulta.neq("usuario", usuarioExcluir);
    const { data: suscripciones, error } = await consulta;
    if (error) throw error;

    const resultados = await Promise.allSettled(
      (suscripciones || []).map(async (sub) => {
        const suscripcionPush = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await webpush.sendNotification(
            suscripcionPush,
            JSON.stringify({ title: titulo, body: cuerpo, url })
          );
        } catch (err: any) {
          // 404/410 = la suscripción ya no es válida (el usuario desinstaló,
          // revocó el permiso, etc.) — se limpia de la tabla.
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from("suscripciones_push").delete().eq("endpoint", sub.endpoint);
          }
          throw err;
        }
      })
    );

    const enviados = resultados.filter((r) => r.status === "fulfilled").length;
    return new Response(JSON.stringify({ enviados, total: resultados.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
