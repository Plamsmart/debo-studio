-- FORMACIONES — solo informativas, Débora las coordina manualmente
-- (mismo patrón que Bonos: reservable=false, duracion_minutos=0 como
-- marcador de "no aplica bloque de tiempo de calendario")
insert into servicios (nombre, descripcion, categoria, duracion_minutos, precio, activo, reservable) values
('Formación: Diseño de cejas', null, 'Formaciones', 0, 370.00, true, false),
('Formación: Auto maquillaje', 'Día, noche, eventos...', 'Formaciones', 0, 90.00, true, false),
('Formación: Auto maquillaje en grupo', 'Grupos reducidos. Precio por persona.', 'Formaciones', 0, 70.00, true, false);

-- Verificación
select categoria, nombre, precio, reservable
from servicios
where categoria = 'Formaciones'
order by nombre;
