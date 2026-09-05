-- Guarda la conexión OAuth con Google Calendar (a nivel de negocio, no por
-- usuario admin — sin importar quién confirme una cita, el evento va al
-- mismo calendario de Débora).
create table if not exists google_calendar_config (
  id uuid primary key default gen_random_uuid(),
  access_token text,
  refresh_token text not null,
  token_expiry timestamptz,
  calendar_id text default 'primary',
  conectado_por uuid references usuarios_admin(id),
  conectado_en timestamptz default now()
);

-- RLS activado SIN ninguna política = nadie con el cliente normal
-- (anon/authenticated) puede leer ni escribir esta tabla, ni siquiera un
-- admin autenticado. El refresh_token es información muy sensible (permite
-- actuar sobre el Google Calendar real de Débora), así que solo el backend
-- (service_role) puede tocarla, nunca directo desde el navegador.
alter table google_calendar_config enable row level security;

grant select, insert, update, delete on public.google_calendar_config to service_role;

-- Referencia para saber a qué evento de Google corresponde cada cita
-- (necesario para poder borrar el evento si la cita se cancela después).
alter table citas add column if not exists google_event_id text;
