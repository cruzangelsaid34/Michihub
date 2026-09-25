-- Ejecutar en: Supabase Dashboard > SQL Editor (proyecto de "cuentas", el mismo
-- que usan SUPABASE_URL / SUPABASE_KEY en index.html y chat.html)

create extension if not exists pgcrypto;

create table if not exists public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  usuario text,
  correo text,
  creado_en timestamptz not null default now()
);

alter table public.suscripciones_push enable row level security;

-- La app usa la clave "publishable/anon", así que necesita permiso para
-- registrar (insert) y refrescar (update) su propia suscripción.
create policy "insertar suscripcion push"
on public.suscripciones_push for insert
to anon
with check (true);

create policy "actualizar suscripcion push"
on public.suscripciones_push for update
to anon
using (true);

-- La función de envío usa la Service Role Key (no la anon), así que no
-- necesita una policy de select: la Service Role salta RLS automáticamente.
