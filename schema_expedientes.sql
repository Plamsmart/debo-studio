-- Expediente de cliente (ficha técnica + sesiones + fotos antes/después).
-- Ejecutar en el SQL Editor de Supabase y, DESPUÉS, regenerar los tipos:
--   npx supabase gen types typescript --project-id oujdpjwjiqehfsqawkbt > lib/supabase/database.types.ts
--
-- Contiene datos de salud (alergias, medicación, embarazo) — categoría
-- especial bajo el RGPD. Acceso: solo el equipo del estudio (admin y staff),
-- nunca 'anon'. Mismo patrón de RLS que citas/clientes/pagos:
-- `exists (select 1 from usuarios_admin where id = auth.uid())`.

-- =========================================================
-- 1. expedientes_clientes — uno por cliente (1 a 1)
-- =========================================================
create table if not exists expedientes_clientes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null unique references clientes(id) on delete cascade,
  tipo_piel text,
  alergias text,
  medicacion_actual text,
  -- null = sin registrar. Texto con check (como chat_mensajes.rol) en vez de
  -- boolean: distingue embarazo de lactancia y "no" de "no consta".
  embarazo_lactancia text check (embarazo_lactancia in ('no', 'embarazo', 'lactancia')),
  antecedentes text,
  contraindicaciones text,
  consentimiento_firmado boolean not null default false,
  consentimiento_fecha date,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- =========================================================
-- 2. sesiones_expediente — una por visita/tratamiento registrado
-- =========================================================
-- Independiente de `citas`: Débora puede registrar una sesión aunque la
-- clienta no haya reservado online.
create table if not exists sesiones_expediente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  fecha date not null,
  tratamiento text,
  zona text,
  producto text,
  notas text,
  -- set null: si se borra un usuario del equipo, la sesión se conserva.
  creado_por uuid references usuarios_admin(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists idx_sesiones_expediente_cliente
  on sesiones_expediente (cliente_id, fecha desc);

-- =========================================================
-- 3. fotos_expediente — hasta 6 por sesión (límite validado en el backend)
-- =========================================================
create table if not exists fotos_expediente (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references sesiones_expediente(id) on delete cascade,
  tipo text not null check (tipo in ('antes', 'despues')),
  ruta text not null,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);

create index if not exists idx_fotos_expediente_sesion
  on fotos_expediente (sesion_id, orden);

-- =========================================================
-- 4. RLS — mismo patrón que citas/clientes/pagos
-- =========================================================
alter table expedientes_clientes enable row level security;
alter table sesiones_expediente enable row level security;
alter table fotos_expediente enable row level security;

create policy "expedientes_clientes_select_admin" on expedientes_clientes
  for select using (exists (select 1 from usuarios_admin where id = auth.uid()));
create policy "expedientes_clientes_insert_admin" on expedientes_clientes
  for insert with check (exists (select 1 from usuarios_admin where id = auth.uid()));
create policy "expedientes_clientes_update_admin" on expedientes_clientes
  for update using (exists (select 1 from usuarios_admin where id = auth.uid()));
create policy "expedientes_clientes_delete_admin" on expedientes_clientes
  for delete using (exists (select 1 from usuarios_admin where id = auth.uid()));

create policy "sesiones_expediente_select_admin" on sesiones_expediente
  for select using (exists (select 1 from usuarios_admin where id = auth.uid()));
create policy "sesiones_expediente_insert_admin" on sesiones_expediente
  for insert with check (exists (select 1 from usuarios_admin where id = auth.uid()));
create policy "sesiones_expediente_update_admin" on sesiones_expediente
  for update using (exists (select 1 from usuarios_admin where id = auth.uid()));
create policy "sesiones_expediente_delete_admin" on sesiones_expediente
  for delete using (exists (select 1 from usuarios_admin where id = auth.uid()));

create policy "fotos_expediente_select_admin" on fotos_expediente
  for select using (exists (select 1 from usuarios_admin where id = auth.uid()));
create policy "fotos_expediente_insert_admin" on fotos_expediente
  for insert with check (exists (select 1 from usuarios_admin where id = auth.uid()));
create policy "fotos_expediente_update_admin" on fotos_expediente
  for update using (exists (select 1 from usuarios_admin where id = auth.uid()));
create policy "fotos_expediente_delete_admin" on fotos_expediente
  for delete using (exists (select 1 from usuarios_admin where id = auth.uid()));

-- =========================================================
-- 5. GRANTs — explícitos desde el inicio (bugs #9 y #11 de AGENTS.md)
-- =========================================================
-- Las API routes leen/escriben las tablas con la sesión del usuario
-- ('authenticated', filtrado por las policies de arriba). service_role solo
-- se usa para Storage, pero se le da acceso por si un proceso de backend
-- lo necesita (purga, exportación RGPD). 'anon' no recibe nada.
revoke all on expedientes_clientes from anon, authenticated;
revoke all on sesiones_expediente from anon, authenticated;
revoke all on fotos_expediente from anon, authenticated;

grant select, insert, update, delete on expedientes_clientes to authenticated, service_role;
grant select, insert, update, delete on sesiones_expediente to authenticated, service_role;
grant select, insert, update, delete on fotos_expediente to authenticated, service_role;

-- =========================================================
-- 6. Bucket privado para las fotos (mismo patrón que clientes-fotos)
-- =========================================================
-- Sin políticas de storage.objects: solo service_role (desde las API routes)
-- puede subir/leer/borrar. Se muestran con signed URLs de 24h firmadas en
-- el servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expedientes-fotos',
  'expedientes-fotos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Comprobar tras aplicar (debe devolver 6 filas: authenticated y service_role
-- con DELETE,INSERT,SELECT,UPDATE en cada tabla; ninguna de anon):
--   select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_name in ('expedientes_clientes', 'sesiones_expediente', 'fotos_expediente')
--     and grantee in ('service_role', 'anon', 'authenticated')
--   group by 1, 2 order by 1, 2;
