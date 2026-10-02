-- Borrar = solo rol 'admin' (Débora). El staff puede ver y gestionar, pero
-- no eliminar (ver "Roles admin/staff" en AGENTS.md). Antes, estas políticas
-- solo comprobaban estar en usuarios_admin, sin mirar el rol.
-- Sustituye a policy_clientes_roles.sql, que nunca llegó a aplicarse.
--
-- fotos_expediente NO se toca: el staff puede borrar fotos a propósito.

begin;

-- =========================================================
-- 1. clientes
-- =========================================================
drop policy if exists "clientes_delete_admin" on clientes;
drop policy if exists "clientes_delete_solo_admin" on clientes;

create policy "clientes_delete_solo_admin" on clientes
  for delete using (
    exists (select 1 from usuarios_admin where id = auth.uid() and rol = 'admin')
  );

-- =========================================================
-- 2. citas
-- =========================================================
drop policy if exists "citas_delete_admin" on citas;
drop policy if exists "citas_delete_solo_admin" on citas;

create policy "citas_delete_solo_admin" on citas
  for delete using (
    exists (select 1 from usuarios_admin where id = auth.uid() and rol = 'admin')
  );

-- =========================================================
-- 3. expedientes_clientes
-- =========================================================
drop policy if exists "expedientes_clientes_delete_admin" on expedientes_clientes;
drop policy if exists "expedientes_clientes_delete_solo_admin" on expedientes_clientes;

create policy "expedientes_clientes_delete_solo_admin" on expedientes_clientes
  for delete using (
    exists (select 1 from usuarios_admin where id = auth.uid() and rol = 'admin')
  );

-- =========================================================
-- 4. sesiones_expediente
-- =========================================================
drop policy if exists "sesiones_expediente_delete_admin" on sesiones_expediente;
drop policy if exists "sesiones_expediente_delete_solo_admin" on sesiones_expediente;

create policy "sesiones_expediente_delete_solo_admin" on sesiones_expediente
  for delete using (
    exists (select 1 from usuarios_admin where id = auth.uid() and rol = 'admin')
  );

-- =========================================================
-- 5. TRUNCATE fuera para 'authenticated'
-- =========================================================
-- TRUNCATE se salta RLS. PostgREST no lo expone, pero nadie del lado
-- 'authenticated' lo necesita.
revoke truncate on clientes, citas, servicios from authenticated;

commit;

-- Comprobar tras aplicar:
--
-- a) Políticas DELETE (deben salir 6 filas: las 4 *_solo_admin de arriba más
--    servicios_delete_solo_admin, que ya existía, con rol = 'admin' en qual;
--    y fotos_expediente_delete_admin sin rol):
--   select tablename, policyname, qual
--   from pg_policies
--   where schemaname = 'public' and cmd = 'DELETE'
--   order by tablename;
--
-- b) TRUNCATE (debe devolver 0 filas):
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and table_name in ('clientes', 'citas', 'servicios')
--     and grantee = 'authenticated'
--     and privilege_type = 'TRUNCATE';
