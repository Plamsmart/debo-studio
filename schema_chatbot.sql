-- Chatbot del sitio (widget web). Guarda las conversaciones y sus mensajes.
-- Ejecutar en el SQL Editor de Supabase y, DESPUÉS, regenerar los tipos:
--   npx supabase gen types typescript --project-id oujdpjwjiqehfsqawkbt > lib/supabase/database.types.ts
--
-- Solo el backend (service_role, desde /api/chat) lee y escribe estas tablas.
-- Contienen lo que la clienta escribe en el chat (puede incluir nombre, email o
-- teléfono), así que nunca se exponen al navegador.

-- =========================================================
-- 1. chat_conversaciones — una por sesión de chat
-- =========================================================
create table if not exists chat_conversaciones (
  id uuid primary key default gen_random_uuid(),
  -- UUID generado por el navegador. Único: es la clave con la que /api/chat
  -- encuentra (o crea) la conversación. Ojo: lo controla el cliente, por eso
  -- los límites no se apoyan solo en él (ver ip_hash).
  session_id text not null unique,
  -- SHA-256(CHAT_IP_SALT + ip). Nunca se guarda la IP en claro. Sirve para
  -- limitar cuántas conversaciones nuevas abre una misma IP.
  ip_hash text,
  creado_en timestamptz not null default now()
);

-- Cuenta de conversaciones del mes (límite mensual) y por IP.
create index if not exists idx_chat_conversaciones_creado_en
  on chat_conversaciones (creado_en);
create index if not exists idx_chat_conversaciones_ip_hash
  on chat_conversaciones (ip_hash, creado_en);

-- =========================================================
-- 2. chat_mensajes — mensajes de cada conversación
-- =========================================================
create table if not exists chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references chat_conversaciones(id) on delete cascade,
  rol text not null check (rol in ('user', 'assistant')),
  contenido text not null,
  -- Solo en mensajes 'assistant': registro de las herramientas que usó el bot
  -- en ese turno (nombre, argumentos, resultado). Es auditoría, no se
  -- reenvía al modelo.
  herramientas jsonb,
  -- Solo en mensajes 'user': para el rate limit por IP.
  ip_hash text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_chat_mensajes_conversacion
  on chat_mensajes (conversacion_id, creado_en);
create index if not exists idx_chat_mensajes_ip_hash
  on chat_mensajes (ip_hash, creado_en)
  where rol = 'user';

-- =========================================================
-- 3. Seguridad
-- =========================================================
-- RLS activado SIN ninguna política = anon/authenticated no pueden leer ni
-- escribir (mismo patrón que google_calendar_config). El revoke es cinturón y
-- tirantes por si Supabase concede privilegios por defecto a esos roles.
alter table chat_conversaciones enable row level security;
alter table chat_mensajes enable row level security;

revoke all on chat_conversaciones from anon, authenticated;
revoke all on chat_mensajes from anon, authenticated;

-- GRANTs de service_role EXPLÍCITOS desde el inicio (bugs #9 y #11 de AGENTS.md:
-- sin el GRANT de tabla, service_role recibe "permission denied" aunque RLS
-- lo bypassee). Incluye delete para una futura purga por retención.
grant select, insert, update, delete on chat_conversaciones to service_role;
grant select, insert, update, delete on chat_mensajes to service_role;

-- Comprobar tras aplicar (debe devolver 8 filas, todas de service_role: 4 privilegios x 2 tablas;
-- ninguna de anon/authenticated):
--   select grantee, table_name, privilege_type
--   from information_schema.role_table_grants
--   where table_name in ('chat_conversaciones', 'chat_mensajes')
--     and grantee in ('service_role', 'anon', 'authenticated');
