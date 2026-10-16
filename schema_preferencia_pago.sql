-- =====================================================================
-- schema_preferencia_pago.sql — "Pagaré en el estudio" en el email de
-- confirmación de cita (opción A: la sesión de Stripe se crea solo cuando la
-- clienta pulsa "Pagar online"; el enlace del email lleva un token propio).
-- =====================================================================
--
-- Contenido (ejecutar cada sección por separado, en este orden):
--   0. Verificación previa (solo lectura)
--   1. Aplicar: columnas en citas + tabla citas_tokens_pago   (begin … commit)
--   2. Pruebas                                                 (begin … rollback, no deja datos)
--   3. Rollback del punto 1                                    (comentado)
--
-- DESPUÉS de aplicar el punto 1, regenerar los tipos (bug #2 de AGENTS.md):
--   npx supabase gen types typescript --project-id oujdpjwjiqehfsqawkbt > lib/supabase/database.types.ts
--
-- Decisiones:
--   - La preferencia vive en `citas` (describe la cita, no un movimiento de
--     dinero): `pagos` sigue registrando solo cobros reales y /admin/ventas
--     (que solo cuenta estado = 'pagado') no cambia.
--   - preferencia_pago y preferencia_pago_en van juntas: las dos nulas o las
--     dos con valor (check). Nulo = la clienta todavía no ha elegido.
--   - El token NO va en `citas`: /admin/citas hace select('*') con la sesión
--     de admin/staff y lo mandaría al navegador. Va en una tabla aparte, con
--     RLS activado y SIN políticas (mismo patrón que google_calendar_config):
--     solo service_role (backend) la toca. Se guarda solo el SHA-256 del
--     token (hex, 64 caracteres); el token en claro solo existe en el email.
--   - Como mucho un token ACTIVO (revocado_en nulo) por cita: índice único
--     parcial. Revocar = poner revocado_en (no se borra: queda el rastro).
--   - FK cita_id -> citas(id) ON DELETE CASCADE: un token no tiene sentido sin
--     su cita, y hoy las citas se borran al eliminar una clienta
--     (/api/clientes/[id], que es también la vía de la supresión RGPD). Con
--     RESTRICT, un token olvidado bloquearía ese borrado con un error de FK
--     que el panel no sabe explicar. (Si citas.cliente_id no es cascade, ese
--     borrado ya falla hoy por las citas, no por los tokens: ver 0.e.)
--   - service_role recibe solo SELECT, INSERT y UPDATE en la tabla nueva (no
--     DELETE: los tokens se revocan, no se borran; el CASCADE de la FK lo
--     ejecuta Postgres como propietario y no necesita ese permiso).
--   - Supabase concede por defecto ALL en tablas nuevas de public a anon,
--     authenticated y service_role: por eso se revoca todo explícitamente
--     antes de conceder lo justo (bugs #9 y #11 de AGENTS.md).
--   - Sin índice nuevo en citas: el panel ya filtra por estado/fecha y la
--     preferencia solo se lee por id de cita.
-- =====================================================================


-- =====================================================================
-- 0. VERIFICACIÓN PREVIA (solo lectura) — ejecutar y revisar antes del punto 1
-- =====================================================================

-- a) Columnas y tipos reales de citas y pagos (citas.id debe ser uuid; el
--    punto 1 lo comprueba y aborta si no):
select table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('citas', 'pagos')
order by table_name, ordinal_position;

-- b) Políticas RLS actuales de citas (y si RLS está activado):
select policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'citas'
order by cmd, policyname;
select relname, relrowsecurity as rls_activado
from pg_class where oid = 'public.citas'::regclass;

-- c) GRANTs actuales sobre citas (service_role debe tener SELECT y UPDATE;
--    el punto 1 concede UPDATE si faltara):
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'citas'
order by grantee, privilege_type;
select has_table_privilege('service_role', 'public.citas', 'SELECT') as service_role_select,
       has_table_privilege('service_role', 'public.citas', 'UPDATE') as service_role_update;

-- d) Que no existan ya los objetos nuevos (las dos consultas deben devolver 0 filas):
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'citas'
  and column_name in ('preferencia_pago', 'preferencia_pago_en');
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'citas_tokens_pago';

-- e) Reglas de borrado de las FK que apuntan a citas y de citas a clientes
--    (a = no action, r = restrict, c = cascade, n = set null):
select conrelid::regclass as tabla, conname, confrelid::regclass as referencia, confdeltype
from pg_constraint
where contype = 'f' and (confrelid = 'public.citas'::regclass or conrelid = 'public.citas'::regclass);


-- =====================================================================
-- 1. APLICAR
-- =====================================================================
begin;

-- Aborta sin cambiar nada si el esquema real no es el que se asumió.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'citas' and column_name = 'id')
     is distinct from 'uuid' then
    raise exception 'citas.id no es uuid: revisar el tipo de citas_tokens_pago.cita_id';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'citas'
               and column_name in ('preferencia_pago', 'preferencia_pago_en')) then
    raise exception 'citas ya tiene preferencia_pago/preferencia_pago_en: este script ya se aplicó (o hay que revisarlo)';
  end if;
  if to_regclass('public.citas_tokens_pago') is not null then
    raise exception 'La tabla citas_tokens_pago ya existe: este script ya se aplicó (o hay que revisarlo)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1.1 Preferencia de pago en citas
-- ---------------------------------------------------------------------
alter table public.citas
  add column preferencia_pago text,
  add column preferencia_pago_en timestamptz,
  add constraint citas_preferencia_pago_valida
    check (preferencia_pago in ('online', 'estudio')),
  add constraint citas_preferencia_pago_con_fecha
    check ((preferencia_pago is null) = (preferencia_pago_en is null));

comment on column public.citas.preferencia_pago is
  'Cómo eligió pagar la clienta desde el email de confirmación: online (Stripe) o estudio. Nulo = no ha elegido.';
comment on column public.citas.preferencia_pago_en is
  'Cuándo eligió (o cambió) la preferencia de pago. Nulo si preferencia_pago es nulo.';

-- La escribe el backend (enlace del email y webhook) con service_role.
-- Idempotente: si ya existía el permiso, no cambia nada.
grant select, update on public.citas to service_role;

-- ---------------------------------------------------------------------
-- 1.2 Tokens de los enlaces del email
-- ---------------------------------------------------------------------
create table public.citas_tokens_pago (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid not null references public.citas(id) on delete cascade,
  -- SHA-256 en hex del token aleatorio que va en el enlace. Nunca el token en claro.
  token_hash text not null unique
    constraint citas_tokens_pago_hash_formato check (token_hash ~ '^[0-9a-f]{64}$'),
  creado_en timestamptz not null default now(),
  -- Nulo = activo. Se rellena al cancelar la cita o al sustituir el token.
  revocado_en timestamptz,
  constraint citas_tokens_pago_revocado_posterior
    check (revocado_en is null or revocado_en >= creado_en)
);

comment on table public.citas_tokens_pago is
  'Enlaces del email de confirmación (pagar online / en el estudio). Solo service_role; RLS sin políticas a propósito.';

-- Como mucho un token activo por cita.
create unique index citas_tokens_pago_un_activo_por_cita
  on public.citas_tokens_pago (cita_id) where revocado_en is null;
-- Para el CASCADE y para revocar todos los tokens de una cita (incluye los revocados).
create index citas_tokens_pago_cita_id_idx
  on public.citas_tokens_pago (cita_id);

-- RLS activado SIN ninguna política = anon/authenticated no ven ni escriben
-- nada aunque tuvieran el GRANT (que además se revoca abajo).
alter table public.citas_tokens_pago enable row level security;

revoke all on public.citas_tokens_pago from public, anon, authenticated, service_role;
grant select, insert, update on public.citas_tokens_pago to service_role;

-- Comprobación final dentro de la transacción: si algo no cuadra, no se aplica nada.
do $$
begin
  if not has_table_privilege('service_role', 'public.citas', 'UPDATE') then
    raise exception 'service_role sigue sin UPDATE en citas';
  end if;
  if has_table_privilege('anon', 'public.citas_tokens_pago', 'SELECT')
     or has_table_privilege('authenticated', 'public.citas_tokens_pago', 'SELECT')
     or has_table_privilege('anon', 'public.citas_tokens_pago', 'INSERT')
     or has_table_privilege('authenticated', 'public.citas_tokens_pago', 'INSERT') then
    raise exception 'anon/authenticated conservan permisos en citas_tokens_pago';
  end if;
  if not (has_table_privilege('service_role', 'public.citas_tokens_pago', 'SELECT')
          and has_table_privilege('service_role', 'public.citas_tokens_pago', 'INSERT')
          and has_table_privilege('service_role', 'public.citas_tokens_pago', 'UPDATE')) then
    raise exception 'service_role no tiene SELECT/INSERT/UPDATE en citas_tokens_pago';
  end if;
end $$;

commit;

-- Comprobar tras aplicar (debe devolver solo service_role con DELETE ausente:
-- INSERT, SELECT, UPDATE; ninguna fila de anon/authenticated):
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'citas_tokens_pago' order by grantee, privilege_type;


-- =====================================================================
-- 2. PRUEBAS — todo dentro de una transacción que termina en ROLLBACK.
--    Si algo falla, el script se detiene con el mensaje "FALLO: …".
--    Si llega al final, la última consulta devuelve 'OK: …'.
--    Datos de prueba con ids fijos y citas en 2099 (sin datos reales).
-- =====================================================================
begin;

-- --- Datos de prueba (como postgres) ---------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000001a1', 'authenticated', 'authenticated', 'prueba-pago-admin@test.invalid');
insert into public.usuarios_admin (id, nombre, rol) values
  ('00000000-0000-4000-8000-0000000001a1', 'PRUEBA admin pago', 'admin');

insert into public.clientes (id, nombre) values
  ('00000000-0000-4000-8000-0000000001c1', 'PRUEBA clienta pago');
insert into public.servicios (id, nombre, precio, duracion_minutos, activo) values
  ('00000000-0000-4000-8000-0000000001e1', 'PRUEBA Servicio pago', 50, 60, false);
insert into public.citas (id, cliente_id, servicio_id, fecha, hora_inicio, hora_fin, estado) values
  ('00000000-0000-4000-8000-0000000001d1', '00000000-0000-4000-8000-0000000001c1', '00000000-0000-4000-8000-0000000001e1', '2099-02-02', '10:00', '11:00', 'confirmada'),
  ('00000000-0000-4000-8000-0000000001d2', '00000000-0000-4000-8000-0000000001c1', '00000000-0000-4000-8000-0000000001e1', '2099-02-03', '10:00', '11:00', 'confirmada');

-- Hash de prueba: sha256 de un texto fijo (formato válido, 64 hex).
insert into public.citas_tokens_pago (id, cita_id, token_hash) values
  ('00000000-0000-4000-8000-0000000001f1', '00000000-0000-4000-8000-0000000001d1', encode(sha256('PRUEBA token 1'::bytea), 'hex'));

-- --- a) check de preferencia_pago (como postgres) --------------------
do $$
begin
  begin
    update public.citas set preferencia_pago = 'efectivo', preferencia_pago_en = now()
    where id = '00000000-0000-4000-8000-0000000001d1';
    raise exception 'FALLO a) se aceptó preferencia_pago = ''efectivo''';
  exception when check_violation then null;
  end;

  begin
    update public.citas set preferencia_pago = 'Estudio', preferencia_pago_en = now()
    where id = '00000000-0000-4000-8000-0000000001d1';
    raise exception 'FALLO a) se aceptó preferencia_pago = ''Estudio'' (mayúscula)';
  exception when check_violation then null;
  end;

  begin
    update public.citas set preferencia_pago = 'estudio', preferencia_pago_en = null
    where id = '00000000-0000-4000-8000-0000000001d1';
    raise exception 'FALLO a) se aceptó una preferencia sin fecha';
  exception when check_violation then null;
  end;

  begin
    update public.citas set preferencia_pago = null, preferencia_pago_en = now()
    where id = '00000000-0000-4000-8000-0000000001d1';
    raise exception 'FALLO a) se aceptó una fecha sin preferencia';
  exception when check_violation then null;
  end;

  -- Valores válidos, incluido volver a nulo.
  update public.citas set preferencia_pago = 'estudio', preferencia_pago_en = now()
  where id = '00000000-0000-4000-8000-0000000001d1';
  update public.citas set preferencia_pago = 'online', preferencia_pago_en = now()
  where id = '00000000-0000-4000-8000-0000000001d1';
  update public.citas set preferencia_pago = null, preferencia_pago_en = null
  where id = '00000000-0000-4000-8000-0000000001d1';
end $$;

-- --- b) restricciones de citas_tokens_pago (como postgres) -----------
do $$
begin
  -- Formato del hash
  begin
    insert into public.citas_tokens_pago (cita_id, token_hash)
    values ('00000000-0000-4000-8000-0000000001d2', 'token-en-claro');
    raise exception 'FALLO b) se aceptó un token_hash que no es SHA-256 hex';
  exception when check_violation then null;
  end;

  -- Hash único
  begin
    insert into public.citas_tokens_pago (cita_id, token_hash)
    values ('00000000-0000-4000-8000-0000000001d2', encode(sha256('PRUEBA token 1'::bytea), 'hex'));
    raise exception 'FALLO b) se aceptó un token_hash repetido';
  exception when unique_violation then null;
  end;

  -- Un solo token activo por cita...
  begin
    insert into public.citas_tokens_pago (cita_id, token_hash)
    values ('00000000-0000-4000-8000-0000000001d1', encode(sha256('PRUEBA token 2'::bytea), 'hex'));
    raise exception 'FALLO b) se aceptaron dos tokens activos para la misma cita';
  exception when unique_violation then null;
  end;

  -- ...pero tras revocar el anterior sí se puede crear otro.
  update public.citas_tokens_pago set revocado_en = now()
  where id = '00000000-0000-4000-8000-0000000001f1';
  insert into public.citas_tokens_pago (cita_id, token_hash)
  values ('00000000-0000-4000-8000-0000000001d1', encode(sha256('PRUEBA token 2'::bytea), 'hex'));

  -- FK: no hay tokens para citas que no existen
  begin
    insert into public.citas_tokens_pago (cita_id, token_hash)
    values ('00000000-0000-4000-8000-0000000009d9', encode(sha256('PRUEBA token huérfano'::bytea), 'hex'));
    raise exception 'FALLO b) se aceptó un token de una cita inexistente';
  exception when foreign_key_violation then null;
  end;
end $$;

-- --- c) clienta anónima (rol anon): no lee ni escribe tokens ---------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare n int;
begin
  begin
    select count(*) into n from public.citas_tokens_pago;
    raise exception 'FALLO c) anon pudo leer citas_tokens_pago (% filas)', n;
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.citas_tokens_pago (cita_id, token_hash)
    values ('00000000-0000-4000-8000-0000000001d2', encode(sha256('PRUEBA anon'::bytea), 'hex'));
    raise exception 'FALLO c) anon pudo insertar en citas_tokens_pago';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.citas_tokens_pago set revocado_en = now();
    raise exception 'FALLO c) anon pudo actualizar citas_tokens_pago';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- --- d) admin con sesión (lo que hace /admin/citas): ve sus citas con
--        select('*') pero ni rastro del hash, y no puede leer los tokens ---
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000001a1', true);

do $$
declare fila jsonb; n int;
begin
  -- Equivale a supabase.from('citas').select('*'): todas las columnas de la fila.
  select to_jsonb(c) into fila from public.citas c where c.id = '00000000-0000-4000-8000-0000000001d1';
  if fila is null then
    raise exception 'FALLO d) el admin no ve la cita de prueba: revisar la política SELECT de citas';
  end if;
  if not (fila ? 'preferencia_pago' and fila ? 'preferencia_pago_en') then
    raise exception 'FALLO d) select * de citas no trae las columnas de preferencia: %', fila;
  end if;
  if exists (select 1 from jsonb_object_keys(fila) k where k ilike '%token%' or k ilike '%hash%') then
    raise exception 'FALLO d) select * de citas expone columnas de token: %', fila;
  end if;
  if position(encode(sha256('PRUEBA token 2'::bytea), 'hex') in fila::text) > 0 then
    raise exception 'FALLO d) el hash del token aparece en la fila de citas';
  end if;

  -- Tampoco por la tabla directa (ni por un embed de PostgREST, que necesita este mismo permiso).
  begin
    select count(*) into n from public.citas_tokens_pago;
    raise exception 'FALLO d) authenticated pudo leer citas_tokens_pago (% filas)', n;
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- --- e) service_role (backend): lee, crea y revoca; no borra ---------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.citas_tokens_pago
  where cita_id = '00000000-0000-4000-8000-0000000001d1';
  if n <> 2 then raise exception 'FALLO e) service_role ve % tokens de la cita 1, esperado 2', n; end if;

  insert into public.citas_tokens_pago (cita_id, token_hash)
  values ('00000000-0000-4000-8000-0000000001d2', encode(sha256('PRUEBA token service'::bytea), 'hex'));

  update public.citas_tokens_pago set revocado_en = now()
  where cita_id = '00000000-0000-4000-8000-0000000001d2' and revocado_en is null;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO e) service_role revocó % tokens, esperado 1', n; end if;

  -- Lo que hará el endpoint del enlace: guardar la preferencia en la cita.
  update public.citas set preferencia_pago = 'estudio', preferencia_pago_en = now()
  where id = '00000000-0000-4000-8000-0000000001d2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO e) service_role no pudo actualizar la preferencia en citas'; end if;

  begin
    delete from public.citas_tokens_pago where cita_id = '00000000-0000-4000-8000-0000000001d2';
    raise exception 'FALLO e) service_role pudo borrar tokens (debe revocarlos, no borrarlos)';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- --- f) borrar la cita elimina sus tokens (ON DELETE CASCADE) ---------
-- Como admin con sesión, que es quien puede borrar citas según
-- citas_delete_solo_admin. El CASCADE lo ejecuta Postgres, no el rol.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000001a1', true);

do $$
declare n int;
begin
  delete from public.citas where id = '00000000-0000-4000-8000-0000000001d1';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FALLO f) el admin no pudo borrar la cita de prueba (% filas): revisar política/GRANT DELETE de citas', n;
  end if;
end $$;

reset role;

do $$
declare n int;
begin
  select count(*) into n from public.citas_tokens_pago
  where cita_id = '00000000-0000-4000-8000-0000000001d1';
  if n <> 0 then raise exception 'FALLO f) quedan % tokens de una cita borrada', n; end if;
end $$;

select 'OK: preferencia_pago y citas_tokens_pago pasan todas las pruebas' as resultado;

rollback;


-- =====================================================================
-- 3. ROLLBACK del punto 1 (descomentar y ejecutar solo si hay que deshacerlo)
--    Borra los tokens y las preferencias guardadas. El GRANT UPDATE de
--    service_role en citas NO se revoca: el código actual ya lo necesita
--    (bug #9 de AGENTS.md). Después, regenerar database.types.ts.
-- =====================================================================
-- begin;
-- drop table if exists public.citas_tokens_pago;
-- alter table public.citas
--   drop constraint if exists citas_preferencia_pago_con_fecha,
--   drop constraint if exists citas_preferencia_pago_valida,
--   drop column if exists preferencia_pago_en,
--   drop column if exists preferencia_pago;
-- commit;
