-- Corrige citas_ocupadas_del_dia: además de las canceladas, una cita marcada
-- 'no_asistio' tampoco debe seguir bloqueando el horario.
--
-- PASO 1 — Mira la definición actual y compárala con la de abajo. Si la real
-- difiere (tipos de retorno, security definer, search_path, orden), ajusta el
-- PASO 2 para conservar esas partes y cambia SOLO la línea del `estado`:
--
--   select pg_get_functiondef('public.citas_ocupadas_del_dia(date)'::regprocedure);
--
-- (si la función recibe `text` en vez de `date`, cambia el tipo dentro de regprocedure)
--
-- PASO 2 — Aplicar. `create or replace` conserva los GRANT existentes y falla
-- sin cambiar nada si el tipo de retorno no coincide con el actual.
create or replace function public.citas_ocupadas_del_dia(fecha_consulta date)
returns table (hora_inicio time, hora_fin time)
language sql
stable
security definer -- lo que permite ver las citas de todos sin exponer datos del cliente (RLS)
set search_path = public
as $$
  select c.hora_inicio, c.hora_fin
  from citas c
  where c.fecha = fecha_consulta
    and c.estado not in ('cancelada', 'no_asistio');
$$;

-- PASO 3 — Comprobar (cambia la fecha por un día con citas):
--   select * from citas_ocupadas_del_dia('2026-09-21');
