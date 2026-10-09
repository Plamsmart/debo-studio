-- =====================================================================
-- schema_ventas.sql — informes de ventas para /admin/ventas (solo rol 'admin')
-- =====================================================================
--
-- Contenido (ejecutar cada sección por separado, en este orden):
--   0. Verificación previa (solo lectura)
--   1. Aplicar: funciones RPC + permisos           (begin … commit)
--   2. Pruebas                                     (begin … rollback, no deja datos)
--   3. Rollback del punto 1                        (comentado)
--   4. PROPUESTA de cambio de pagos_select_admin   (comentada, NO aplicar todavía)
--
-- Reglas de negocio:
--   - Solo cuentan pagos con estado = 'pagado'. En la base, estado_pago es un
--     enum ('pendiente','pagado','reembolsado','fallido') y la columna admite
--     NULL: todo lo que no sea 'pagado' (incluido NULL) queda fuera.
--   - Importes en bruto: suma de pagos.monto tal cual (ni IVA ni reembolsos).
--   - Fecha de cada pago = pagos.creado_en (timestamptz) pasada a Europe/Madrid.
--     Semanas de lunes a domingo (date_trunc('week') es ISO).
--   - Servicio: manda la cita (pagos.cita_id -> citas.servicio_id); si el pago
--     no tiene cita, el servicio del propio pago (pagos.servicio_id, el que se
--     elige en /admin/cobrar). Si no hay ninguno de los dos -> "Sin servicio
--     asignado".
--
-- Seguridad:
--   - Las 4 funciones públicas son SECURITY DEFINER con search_path = '' y lo
--     primero que hacen es exigir que auth.uid() tenga rol 'admin' en
--     usuarios_admin; si no, error 42501 (PostgREST lo devuelve como 401/403).
--     No dependen de la política RLS de pagos: el staff queda fuera aunque
--     pagos_select_admin le siga dejando leer la tabla.
--   - Solo devuelven agregados, nunca filas de pagos.
--   - EXECUTE: revocado a public, anon y service_role; concedido solo a
--     authenticated. Las funciones auxiliares viven en el esquema
--     ventas_interno, que no expone PostgREST y sin USAGE para nadie más que
--     el propietario.
--   - Ejecutar desde el SQL Editor de Supabase (rol postgres, propietario de
--     las tablas): las funciones DEFINER leen pagos como su propietario.


-- =====================================================================
-- 0. VERIFICACIÓN PREVIA (solo lectura) — ejecutar y revisar antes del punto 1
-- =====================================================================
--
-- a) Columnas y tipos reales (creado_en de pagos debe ser
--    'timestamp with time zone'; el punto 1 lo comprueba y aborta si no):
--   select table_name, column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name in ('pagos', 'citas', 'servicios', 'usuarios_admin')
--   order by table_name, ordinal_position;
--
-- b) Políticas RLS actuales de pagos (para el punto 4):
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname = 'public' and tablename = 'pagos';
--
-- c) GRANTs actuales sobre pagos:
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'pagos' order by grantee;
--
-- d) Que no existan ya funciones con estos nombres (debe devolver 0 filas):
--   select proname from pg_proc where proname like 'ventas\_%' escape '\';


-- =====================================================================
-- 1. APLICAR
-- =====================================================================
begin;

-- Aborta sin cambiar nada si el esquema real no es el que se asumió.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'pagos' and column_name = 'creado_en')
     is distinct from 'timestamp with time zone' then
    raise exception 'pagos.creado_en no es timestamptz: hay que revisar la conversión a Europe/Madrid';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'pagos' and column_name = 'cita_id')
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'pagos' and column_name = 'servicio_id')
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'citas' and column_name = 'servicio_id')
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'usuarios_admin' and column_name = 'rol') then
    raise exception 'Faltan columnas esperadas (pagos.cita_id, pagos.servicio_id, citas.servicio_id o usuarios_admin.rol)';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'estado_pago' and e.enumlabel = 'pagado') then
    raise exception 'El enum estado_pago no tiene el valor ''pagado''';
  end if;
end $$;

-- Índice parcial: todas las consultas filtran por estado = 'pagado' y un rango de creado_en.
create index if not exists pagos_pagado_creado_en_idx
  on public.pagos (creado_en) where estado = 'pagado';

-- ---------------------------------------------------------------------
-- Auxiliares (esquema no expuesto por la API)
-- ---------------------------------------------------------------------
create schema if not exists ventas_interno;
revoke all on schema ventas_interno from public;

create or replace function ventas_interno.exigir_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.usuarios_admin ua
    where ua.id = auth.uid() and ua.rol = 'admin'
  ) then
    raise exception 'Solo la administradora puede ver las ventas' using errcode = '42501';
  end if;
end $$;

-- Rango de fechas (días en hora de Madrid, ambos incluidos).
create or replace function ventas_interno.validar_rango(p_desde date, p_hasta date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_desde is null or p_hasta is null then
    raise exception 'Faltan las fechas del rango' using errcode = '22023';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha inicial es posterior a la final' using errcode = '22023';
  end if;
  if p_hasta - p_desde > 3660 then
    raise exception 'El rango no puede superar 10 años' using errcode = '22023';
  end if;
end $$;

-- Pagos cobrados en el rango [p_desde 00:00, p_hasta+1 00:00) hora de Madrid.
-- Los límites se convierten a timestamptz y se compara contra creado_en sin
-- transformarlo, así el índice parcial sirve.
--
-- Servicio: la cita manda; si no hay cita (cobros del local: efectivo,
-- datáfono, QR), se usa pagos.servicio_id. Si tampoco hay -> NULL, que los
-- informes muestran como "Sin servicio asignado".
create or replace function ventas_interno.pagos_cobrados(p_desde date, p_hasta date)
returns table (
  monto numeric,
  metodo_pago public.metodo_pago,
  servicio_id uuid,
  servicio_nombre text,
  momento_madrid timestamp
)
language sql
stable
set search_path = ''
as $$
  select
    p.monto::numeric,
    p.metodo_pago,
    s.id,
    s.nombre::text,
    p.creado_en at time zone 'Europe/Madrid'
  from public.pagos p
  left join public.citas c on c.id = p.cita_id
  left join public.servicios s on s.id = coalesce(c.servicio_id, p.servicio_id)
  where p.estado = 'pagado'
    and p.creado_en >= (p_desde::timestamp at time zone 'Europe/Madrid')
    and p.creado_en <  ((p_hasta + 1)::timestamp at time zone 'Europe/Madrid')
$$;

revoke all on all functions in schema ventas_interno from public;

-- ---------------------------------------------------------------------
-- a) Ingresos por periodo. p_agrupacion: 'dia' | 'semana' | 'mes' | 'anio'
--    (también acepta 'día' y 'año'). Devuelve TODOS los periodos del rango,
--    con 0 en los que no hubo cobros (listo para pintar el gráfico).
--    periodo_inicio es el primer día del periodo (lunes en semanas): el
--    primero y el último pueden empezar/acabar fuera del rango pedido, pero
--    solo suman cobros dentro del rango.
-- ---------------------------------------------------------------------
create or replace function public.ventas_ingresos_por_periodo(
  p_desde date,
  p_hasta date,
  p_agrupacion text default 'dia'
)
returns table (
  periodo_inicio date,
  total numeric,
  num_cobros bigint,
  ticket_medio numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_unidad text;
begin
  perform ventas_interno.exigir_admin();
  perform ventas_interno.validar_rango(p_desde, p_hasta);

  v_unidad := case p_agrupacion
    when 'dia' then 'day'   when 'día' then 'day'
    when 'semana' then 'week'
    when 'mes' then 'month'
    when 'anio' then 'year' when 'año' then 'year'
  end;
  if v_unidad is null then
    raise exception 'Agrupación no válida: %', p_agrupacion using errcode = '22023';
  end if;

  return query
  with cubos as (
    select g::date as inicio
    from generate_series(
      date_trunc(v_unidad, p_desde::timestamp),
      date_trunc(v_unidad, p_hasta::timestamp),
      ('1 ' || v_unidad)::interval
    ) as g
  ),
  agregados as (
    select date_trunc(v_unidad, pc.momento_madrid)::date as inicio,
           sum(pc.monto) as tot,
           count(*) as n
    from ventas_interno.pagos_cobrados(p_desde, p_hasta) pc
    group by 1
  )
  select cu.inicio,
         coalesce(a.tot, 0),
         coalesce(a.n, 0),
         case when a.n > 0 then round(a.tot / a.n, 2) end
  from cubos cu
  left join agregados a on a.inicio = cu.inicio
  order by cu.inicio;
end $$;

-- ---------------------------------------------------------------------
-- b) Ranking de servicios: ingresos y nº de ventas por servicio, ordenado de
--    más a menos vendido (nº de ventas, desempate por importe). La fila
--    "Sin servicio asignado" (servicio_id NULL) va al final y no compite.
--    es_mas_vendido / es_menos_vendido: por nº de ventas entre los servicios
--    con al menos una venta en el rango (con empate, se marcan todos).
-- ---------------------------------------------------------------------
create or replace function public.ventas_ranking_servicios(p_desde date, p_hasta date)
returns table (
  servicio_id uuid,
  servicio_nombre text,
  total numeric,
  num_ventas bigint,
  es_mas_vendido boolean,
  es_menos_vendido boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform ventas_interno.exigir_admin();
  perform ventas_interno.validar_rango(p_desde, p_hasta);

  return query
  with por_servicio as (
    select pc.servicio_id as sid,
           coalesce(pc.servicio_nombre, 'Sin servicio asignado') as nombre,
           sum(pc.monto) as tot,
           count(*) as n
    from ventas_interno.pagos_cobrados(p_desde, p_hasta) pc
    group by pc.servicio_id, pc.servicio_nombre
  ),
  extremos as (
    select max(ps.n) as max_n, min(ps.n) as min_n
    from por_servicio ps
    where ps.sid is not null
  )
  select ps.sid,
         ps.nombre,
         ps.tot,
         ps.n,
         ps.sid is not null and ps.n = e.max_n,
         ps.sid is not null and ps.n = e.min_n
  from por_servicio ps
  cross join extremos e
  order by (ps.sid is null), ps.n desc, ps.tot desc, ps.nombre;
end $$;

-- ---------------------------------------------------------------------
-- c) Reparto por método de pago: los 4 métodos siempre (0 si no hubo cobros).
--    Porcentajes con 1 decimal (pueden no sumar exactamente 100 por redondeo);
--    NULL si en el rango no hubo ningún cobro.
-- ---------------------------------------------------------------------
create or replace function public.ventas_por_metodo(p_desde date, p_hasta date)
returns table (
  metodo_pago public.metodo_pago,
  total numeric,
  num_cobros bigint,
  porcentaje_importe numeric,
  porcentaje_cobros numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform ventas_interno.exigir_admin();
  perform ventas_interno.validar_rango(p_desde, p_hasta);

  return query
  with agregados as (
    select pc.metodo_pago as m, sum(pc.monto) as tot, count(*) as n
    from ventas_interno.pagos_cobrados(p_desde, p_hasta) pc
    group by pc.metodo_pago
  ),
  totales as (
    select sum(a.tot) as tot, sum(a.n) as n from agregados a
  )
  select e.m,
         coalesce(a.tot, 0),
         coalesce(a.n, 0),
         case when t.tot > 0 then round(100 * coalesce(a.tot, 0) / t.tot, 1) end,
         case when t.n > 0 then round(100 * coalesce(a.n, 0)::numeric / t.n, 1) end
  from unnest(enum_range(null::public.metodo_pago)) as e(m)
  left join agregados a on a.m = e.m
  cross join totales t
  order by coalesce(a.tot, 0) desc, e.m;
end $$;

-- ---------------------------------------------------------------------
-- d) Totales del periodo actual y del anterior, en una sola fila.
--    Periodo anterior por defecto: los mismos días justo antes (p.ej. 1-15 oct
--    -> 16-30 sep). Para comparar con el mes natural anterior (octubre ->
--    septiembre entero), pasar p_anterior_desde y p_anterior_hasta.
--    variacion_pct es NULL si el periodo anterior suma 0 (no hay base).
-- ---------------------------------------------------------------------
create or replace function public.ventas_comparativa(
  p_desde date,
  p_hasta date,
  p_anterior_desde date default null,
  p_anterior_hasta date default null
)
returns table (
  actual_desde date,
  actual_hasta date,
  actual_total numeric,
  actual_num_cobros bigint,
  actual_ticket_medio numeric,
  anterior_desde date,
  anterior_hasta date,
  anterior_total numeric,
  anterior_num_cobros bigint,
  anterior_ticket_medio numeric,
  diferencia numeric,
  variacion_pct numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ant_desde date;
  v_ant_hasta date;
begin
  perform ventas_interno.exigir_admin();
  perform ventas_interno.validar_rango(p_desde, p_hasta);

  if (p_anterior_desde is null) <> (p_anterior_hasta is null) then
    raise exception 'El periodo anterior necesita las dos fechas o ninguna' using errcode = '22023';
  end if;
  v_ant_hasta := coalesce(p_anterior_hasta, p_desde - 1);
  v_ant_desde := coalesce(p_anterior_desde, p_desde - (p_hasta - p_desde + 1));
  perform ventas_interno.validar_rango(v_ant_desde, v_ant_hasta);

  return query
  with act as (
    select coalesce(sum(pc.monto), 0) as tot, count(*) as n
    from ventas_interno.pagos_cobrados(p_desde, p_hasta) pc
  ),
  ant as (
    select coalesce(sum(pc.monto), 0) as tot, count(*) as n
    from ventas_interno.pagos_cobrados(v_ant_desde, v_ant_hasta) pc
  )
  select p_desde, p_hasta, act.tot, act.n,
         case when act.n > 0 then round(act.tot / act.n, 2) end,
         v_ant_desde, v_ant_hasta, ant.tot, ant.n,
         case when ant.n > 0 then round(ant.tot / ant.n, 2) end,
         act.tot - ant.tot,
         case when ant.tot > 0 then round(100 * (act.tot - ant.tot) / ant.tot, 1) end
  from act cross join ant;
end $$;

-- ---------------------------------------------------------------------
-- Permisos: Supabase concede EXECUTE por defecto a anon/authenticated/
-- service_role en las funciones nuevas de public, así que hay que revocarlo
-- explícitamente. service_role tampoco lo necesita (sin auth.uid() la
-- función lo rechazaría igualmente).
-- ---------------------------------------------------------------------
revoke all on function public.ventas_ingresos_por_periodo(date, date, text) from public, anon, authenticated, service_role;
revoke all on function public.ventas_ranking_servicios(date, date)          from public, anon, authenticated, service_role;
revoke all on function public.ventas_por_metodo(date, date)                 from public, anon, authenticated, service_role;
revoke all on function public.ventas_comparativa(date, date, date, date)    from public, anon, authenticated, service_role;

grant execute on function public.ventas_ingresos_por_periodo(date, date, text) to authenticated;
grant execute on function public.ventas_ranking_servicios(date, date)          to authenticated;
grant execute on function public.ventas_por_metodo(date, date)                 to authenticated;
grant execute on function public.ventas_comparativa(date, date, date, date)    to authenticated;

commit;

-- Comprobar tras aplicar (debe salir solo 'authenticated' y el propietario, 4 funciones):
--   select p.proname, r.grantee, r.privilege_type
--   from information_schema.routine_privileges r
--   join pg_proc p on p.proname = r.routine_name
--   where r.routine_schema = 'public' and r.routine_name like 'ventas\_%' escape '\'
--   order by 1, 2;


-- =====================================================================
-- 2. PRUEBAS — todo dentro de una transacción que termina en ROLLBACK.
--    Si algo falla, el script se detiene con el mensaje "FALLO: …".
--    Si llega al final, la última consulta devuelve 'OK: …'.
--    Datos de prueba en el año 2000 (sin datos reales) y citas en 2099.
-- =====================================================================
begin;

-- --- Datos de prueba (como postgres) ---------------------------------
-- Usuarias: admin, staff y una autenticada que no está en usuarios_admin.
-- Se crean en auth.users por si usuarios_admin.id tiene FK hacia allí.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'prueba-ventas-admin@test.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'prueba-ventas-staff@test.invalid'),
  ('00000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'prueba-ventas-otra@test.invalid');
insert into public.usuarios_admin (id, nombre, rol) values
  ('00000000-0000-4000-8000-0000000000a1', 'PRUEBA admin', 'admin'),
  ('00000000-0000-4000-8000-0000000000a2', 'PRUEBA staff', 'staff');

insert into public.clientes (id, nombre) values
  ('00000000-0000-4000-8000-0000000000c1', 'PRUEBA clienta ventas');
insert into public.servicios (id, nombre, precio, duracion_minutos, activo) values
  ('00000000-0000-4000-8000-0000000000e1', 'PRUEBA Microblading', 100, 60, false),
  ('00000000-0000-4000-8000-0000000000e2', 'PRUEBA Lifting', 30, 60, false);
insert into public.citas (id, cliente_id, servicio_id, fecha, hora_inicio, hora_fin, estado) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', '2099-01-05', '10:00', '11:00', 'completada'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', '2099-01-06', '10:00', '11:00', 'completada'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e2', '2099-01-07', '10:00', '11:00', 'completada');

-- Marzo de 2000: horario de invierno (UTC+1) hasta el domingo 26, verano (UTC+2) desde entonces.
-- El 15/3/2000 es miércoles; el 20/3/2000, lunes.
insert into public.pagos (cita_id, cliente_id, servicio_id, concepto, monto, estado, metodo_pago, creado_en) values
  -- Cuentan en marzo:
  ('00000000-0000-4000-8000-0000000000d1', null, null, 'PRUEBA p1', 100, 'pagado', 'web',              '2000-03-15 22:59:59+00'), -- Madrid 15/3 23:59:59
  (null, null, '00000000-0000-4000-8000-0000000000e1',  'PRUEBA p2',  50, 'pagado', 'efectivo',         '2000-03-15 23:00:00+00'), -- Madrid 16/3 00:00 (UTC aún 15). Sin cita -> cuenta en su servicio_id (Microblading)
  ('00000000-0000-4000-8000-0000000000d3', null, '00000000-0000-4000-8000-0000000000e1', 'PRUEBA p3', 30, 'pagado', 'tarjeta_datafono', '2000-03-16 10:00:00+00'), -- cita de Lifting con servicio_id de Microblading: manda la cita
  ('00000000-0000-4000-8000-0000000000d2', null, null, 'PRUEBA p4',  20, 'pagado', 'qr_local',         '2000-03-20 10:00:00+00'),
  -- No cuentan (estado distinto de 'pagado'):
  ('00000000-0000-4000-8000-0000000000d1', null, null, 'PRUEBA p5', 999, 'pendiente',   'web',      '2000-03-16 12:00:00+00'),
  ('00000000-0000-4000-8000-0000000000d1', null, null, 'PRUEBA p6', 888, 'fallido',     'web',      '2000-03-16 12:00:00+00'),
  ('00000000-0000-4000-8000-0000000000d1', null, null, 'PRUEBA p7', 777, 'reembolsado', 'qr_local', '2000-03-16 12:00:00+00'),
  (null,                                   null, null, 'PRUEBA p8', 555, null,          'efectivo', '2000-03-16 12:00:00+00'),
  -- Fuera de marzo en hora de Madrid:
  (null, null, null, 'PRUEBA p9',  40, 'pagado', 'efectivo', '2000-02-10 10:00:00+00'), -- periodo anterior
  (null, null, null, 'PRUEBA p10', 10, 'pagado', 'efectivo', '2000-03-31 22:30:00+00'), -- UTC 31/3, Madrid 1/4 00:30 (UTC+2)
  (null, null, null, 'PRUEBA p11',  5, 'pagado', 'efectivo', '2000-02-29 23:30:00+00'); -- UTC 29/2, Madrid 1/3 00:30 -> SÍ cuenta en marzo

-- Totales esperados en marzo (Madrid): p1 100 + p2 50 + p3 30 + p4 20 + p11 5 = 205 en 5 cobros.

-- --- Como admin -------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);

do $$
declare r record; n int;
begin
  -- a) por día: 31 filas; borde de medianoche Madrid
  select count(*) into n from public.ventas_ingresos_por_periodo('2000-03-01', '2000-03-31', 'dia');
  if n <> 31 then raise exception 'FALLO a) dia: % filas, esperado 31', n; end if;

  select * into r from public.ventas_ingresos_por_periodo('2000-03-01', '2000-03-31', 'dia') where periodo_inicio = '2000-03-01';
  if r.total <> 5 or r.num_cobros <> 1 then raise exception 'FALLO a) 1/3 (borde 29/2 23:30 UTC): %', r; end if;
  select * into r from public.ventas_ingresos_por_periodo('2000-03-01', '2000-03-31', 'dia') where periodo_inicio = '2000-03-15';
  if r.total <> 100 or r.num_cobros <> 1 then raise exception 'FALLO a) 15/3 (borde medianoche): %', r; end if;
  select * into r from public.ventas_ingresos_por_periodo('2000-03-01', '2000-03-31', 'dia') where periodo_inicio = '2000-03-16';
  if r.total <> 80 or r.num_cobros <> 2 or r.ticket_medio <> 40 then raise exception 'FALLO a) 16/3: %', r; end if;
  select * into r from public.ventas_ingresos_por_periodo('2000-03-01', '2000-03-31', 'dia') where periodo_inicio = '2000-03-17';
  if r.total <> 0 or r.num_cobros <> 0 or r.ticket_medio is not null then raise exception 'FALLO a) día vacío: %', r; end if;
  select * into r from public.ventas_ingresos_por_periodo('2000-03-31', '2000-03-31', 'dia');
  if r.total <> 0 then raise exception 'FALLO a) 31/3 no debe incluir p10 (es 1/4 en Madrid): %', r; end if;

  -- a) por semana: empiezan en lunes
  select * into r from public.ventas_ingresos_por_periodo('2000-03-01', '2000-03-31', 'semana') where periodo_inicio = '2000-03-13';
  if r.total <> 180 or r.num_cobros <> 3 then raise exception 'FALLO a) semana del lunes 13/3: %', r; end if;
  select * into r from public.ventas_ingresos_por_periodo('2000-03-01', '2000-03-31', 'semana') where periodo_inicio = '2000-03-20';
  if r.total <> 20 or r.num_cobros <> 1 then raise exception 'FALLO a) semana del lunes 20/3: %', r; end if;
  if exists (select 1 from public.ventas_ingresos_por_periodo('2000-03-01', '2000-03-31', 'semana') where extract(isodow from periodo_inicio) <> 1) then
    raise exception 'FALLO a) hay semanas que no empiezan en lunes';
  end if;

  -- a) por mes y año
  select * into r from public.ventas_ingresos_por_periodo('2000-02-01', '2000-04-30', 'mes') where periodo_inicio = '2000-03-01';
  if r.total <> 205 or r.num_cobros <> 5 or r.ticket_medio <> 41 then raise exception 'FALLO a) marzo: %', r; end if;
  select * into r from public.ventas_ingresos_por_periodo('2000-02-01', '2000-04-30', 'mes') where periodo_inicio = '2000-04-01';
  if r.total <> 10 then raise exception 'FALLO a) abril (p10): %', r; end if;
  select * into r from public.ventas_ingresos_por_periodo('2000-01-01', '2000-12-31', 'anio');
  if r.total <> 255 or r.num_cobros <> 7 then raise exception 'FALLO a) año 2000: %', r; end if;

  -- b) ranking: Microblading = p1 + p4 (por cita) + p2 (sin cita, por su servicio_id) -> más vendido;
  --    Lifting = p3 (su cita manda sobre su servicio_id de Microblading) -> menos vendido;
  --    "Sin servicio asignado" = p11 (ni cita ni servicio_id)
  select * into r from public.ventas_ranking_servicios('2000-03-01', '2000-03-31') where servicio_id = '00000000-0000-4000-8000-0000000000e1';
  if r.total <> 170 or r.num_ventas <> 3 or not r.es_mas_vendido or r.es_menos_vendido then raise exception 'FALLO b) Microblading: %', r; end if;
  select * into r from public.ventas_ranking_servicios('2000-03-01', '2000-03-31') where servicio_id = '00000000-0000-4000-8000-0000000000e2';
  if r.total <> 30 or r.num_ventas <> 1 or r.es_mas_vendido or not r.es_menos_vendido then raise exception 'FALLO b) Lifting (la cita manda): %', r; end if;
  select * into r from public.ventas_ranking_servicios('2000-03-01', '2000-03-31') where servicio_id is null;
  if r.servicio_nombre <> 'Sin servicio asignado' or r.total <> 5 or r.num_ventas <> 1 or r.es_mas_vendido or r.es_menos_vendido then
    raise exception 'FALLO b) pago sin cita ni servicio: %', r;
  end if;
  select count(*) into n from public.ventas_ranking_servicios('2000-03-01', '2000-03-31');
  if n <> 3 then raise exception 'FALLO b) % filas, esperado 3', n; end if;

  -- c) métodos: los 4 siempre; % sobre 205
  select count(*) into n from public.ventas_por_metodo('2000-03-01', '2000-03-31');
  if n <> 4 then raise exception 'FALLO c) % métodos, esperado 4', n; end if;
  select * into r from public.ventas_por_metodo('2000-03-01', '2000-03-31') where metodo_pago = 'efectivo';
  if r.total <> 55 or r.num_cobros <> 2 or r.porcentaje_importe <> 26.8 or r.porcentaje_cobros <> 40 then raise exception 'FALLO c) efectivo: %', r; end if;
  select * into r from public.ventas_por_metodo('2000-03-01', '2000-03-31') where metodo_pago = 'tarjeta_datafono';
  if r.total <> 30 or r.num_cobros <> 1 then raise exception 'FALLO c) datáfono: %', r; end if;
  select * into r from public.ventas_por_metodo('2000-06-01', '2000-06-30') where metodo_pago = 'web';
  if r.total <> 0 or r.porcentaje_importe is not null then raise exception 'FALLO c) rango vacío: %', r; end if;

  -- d) comparativa: marzo (31 días) vs 31 días anteriores (30/1-29/2) = p9 40
  select * into r from public.ventas_comparativa('2000-03-01', '2000-03-31');
  if r.anterior_desde <> '2000-01-30' or r.anterior_hasta <> '2000-02-29' then raise exception 'FALLO d) fechas del periodo anterior: %', r; end if;
  if r.actual_total <> 205 or r.actual_num_cobros <> 5 or r.anterior_total <> 40 or r.diferencia <> 165 or r.variacion_pct <> 412.5 then
    raise exception 'FALLO d) comparativa: %', r;
  end if;
  select * into r from public.ventas_comparativa('2000-03-01', '2000-03-31', '2000-02-01', '2000-02-29');
  if r.anterior_total <> 40 then raise exception 'FALLO d) periodo anterior explícito: %', r; end if;
  select * into r from public.ventas_comparativa('2000-06-01', '2000-06-30');
  if r.actual_total <> 0 or r.variacion_pct is not null or r.actual_ticket_medio is not null then raise exception 'FALLO d) sin datos: %', r; end if;

  -- Validaciones de parámetros
  begin
    perform public.ventas_ingresos_por_periodo('2000-03-01', '2000-03-31', 'hora');
    raise exception 'FALLO: agrupación inválida aceptada';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.ventas_por_metodo('2000-03-31', '2000-03-01');
    raise exception 'FALLO: rango invertido aceptado';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- --- Como staff: todas las funciones dan 42501 -------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
do $$
begin
  begin perform public.ventas_ingresos_por_periodo('2000-03-01', '2000-03-31', 'dia'); raise exception 'FALLO: staff ve ingresos';
  exception when insufficient_privilege then null; end;
  begin perform public.ventas_ranking_servicios('2000-03-01', '2000-03-31'); raise exception 'FALLO: staff ve ranking';
  exception when insufficient_privilege then null; end;
  begin perform public.ventas_por_metodo('2000-03-01', '2000-03-31'); raise exception 'FALLO: staff ve métodos';
  exception when insufficient_privilege then null; end;
  begin perform public.ventas_comparativa('2000-03-01', '2000-03-31'); raise exception 'FALLO: staff ve comparativa';
  exception when insufficient_privilege then null; end;
  -- y no puede llamar a las auxiliares directamente
  begin perform ventas_interno.pagos_cobrados('2000-03-01', '2000-03-31'); raise exception 'FALLO: staff accede a ventas_interno';
  exception when insufficient_privilege then null; end;
end $$;

-- --- Autenticada que no está en usuarios_admin -------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
do $$
begin
  begin perform public.ventas_comparativa('2000-03-01', '2000-03-31'); raise exception 'FALLO: usuaria sin rol ve comparativa';
  exception when insufficient_privilege then null; end;
end $$;

-- --- Como anon: sin EXECUTE (permission denied) ------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin perform public.ventas_ingresos_por_periodo('2000-03-01', '2000-03-31', 'dia'); raise exception 'FALLO: anon ve ingresos';
  exception when insufficient_privilege then null; end;
  begin perform public.ventas_ranking_servicios('2000-03-01', '2000-03-31'); raise exception 'FALLO: anon ve ranking';
  exception when insufficient_privilege then null; end;
  begin perform public.ventas_por_metodo('2000-03-01', '2000-03-31'); raise exception 'FALLO: anon ve métodos';
  exception when insufficient_privilege then null; end;
  begin perform public.ventas_comparativa('2000-03-01', '2000-03-31'); raise exception 'FALLO: anon ve comparativa';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- EXECUTE solo para authenticated (y el propietario)
do $$
begin
  if exists (
    select 1 from pg_proc p
    cross join (values ('anon'), ('service_role')) as r(rol)
    where p.pronamespace = 'public'::regnamespace and p.proname like 'ventas\_%' escape '\'
      and has_function_privilege(r.rol, p.oid, 'execute')
  ) then
    raise exception 'FALLO: anon o service_role conservan EXECUTE en alguna función ventas_*';
  end if;
end $$;

select 'OK: todas las pruebas de ventas pasaron (se deshace con ROLLBACK)' as resultado;

rollback;


-- =====================================================================
-- 3. ROLLBACK del punto 1 (descomentar y ejecutar solo si hay que deshacerlo)
-- =====================================================================
-- begin;
-- drop function if exists public.ventas_ingresos_por_periodo(date, date, text);
-- drop function if exists public.ventas_ranking_servicios(date, date);
-- drop function if exists public.ventas_por_metodo(date, date);
-- drop function if exists public.ventas_comparativa(date, date, date, date);
-- drop schema if exists ventas_interno cascade;
-- drop index if exists public.pagos_pagado_creado_en_idx;
-- commit;


-- =====================================================================
-- 4. PROPUESTA (NO APLICAR TODAVÍA): pagos_select_admin solo para rol 'admin'
-- =====================================================================
-- Hoy el staff puede leer pagos. Las funciones de arriba NO dependen de esto,
-- pero un staff con su sesión podría leer la tabla directamente por la API
-- (supabase.from('pagos').select()) y sumar las ventas por su cuenta.
--
-- ANTES de aplicarlo hay que desplegar el cambio de /api/pagos/estado (ver
-- informe): el polling del cobro con QR en /admin/cobrar lee pagos con la
-- sesión de quien cobra; con esta política, para el staff devolvería 404
-- siempre y su pantalla se quedaría en "Esperando el pago…" aunque la clienta
-- hubiese pagado.
--
-- Copiar antes la definición actual (sección 0.b) para poder volver atrás.
-- Si el nombre o el "to <rol>" actual difieren, ajustar aquí.
--
-- begin;
-- drop policy if exists "pagos_select_admin" on public.pagos;
-- create policy "pagos_select_admin" on public.pagos
--   for select to authenticated
--   using (exists (
--     select 1 from public.usuarios_admin ua
--     where ua.id = (select auth.uid()) and ua.rol = 'admin'
--   ));
-- commit;
--
-- Prueba (en transacción, como staff debe dar 0 filas; como admin, > 0):
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<uuid-staff>","role":"authenticated"}', true);
--   select count(*) from public.pagos;
--   rollback;
