-- ============================================================
-- Columna reservable: distingue servicios que se pueden agendar
-- por el calendario (true) de los que solo son informativos, como
-- los bonos/paquetes de sesiones (false).
-- ============================================================
alter table servicios add column if not exists reservable boolean not null default true;

-- Los servicios que ya existen son todos reservables (comportamiento actual, sin cambios)
-- No hace falta tocarlos, el default ya cubre esto.

-- ============================================================
-- BONOS (paquetes de varias sesiones) — solo informativos por ahora,
-- no se pueden reservar online hasta que construyamos un sistema de
-- créditos/sesiones restantes.
-- duracion_minutos: usamos 0 como marcador de "no aplica" ya que
-- estos no representan un bloque de tiempo agendable.
-- ============================================================
insert into servicios (nombre, descripcion, categoria, duracion_minutos, precio, activo, reservable) values
('Bono Body Sculptor', '5 sesiones', 'Bonos', 0, 350.00, true, false),
('Bono Body Sculptor', '10 sesiones', 'Bonos', 0, 650.00, true, false),
('Bono Maderoterapia', '5 sesiones', 'Bonos', 0, 259.00, true, false),
('Bono Maderoterapia', '10 sesiones', 'Bonos', 0, 499.00, true, false),
('Bono Masaje relajante', '5 sesiones', 'Bonos', 0, 210.00, true, false),
('Bono Faciales', '5 sesiones', 'Bonos', 0, 350.00, true, false),
('Bono Drenaje linfático', '5 sesiones', 'Bonos', 0, 200.00, true, false),
('Bono Drenaje linfático', '10 sesiones', 'Bonos', 0, 350.00, true, false);

-- Verificación
select categoria, nombre, precio, reservable
from servicios
where categoria = 'Bonos'
order by nombre, precio;
