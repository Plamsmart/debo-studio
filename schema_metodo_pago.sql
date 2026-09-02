-- Método de pago: de dónde vino el cobro
create type metodo_pago as enum ('web', 'qr_local', 'efectivo');

alter table pagos add column if not exists metodo_pago metodo_pago not null default 'web';

-- Vínculo directo a cliente y servicio, para pagos que NO vienen de una cita
-- (cobros en el local, con o sin QR). Antes, la única forma de saber el
-- cliente de un pago era a través de cita_id -> citas.cliente_id, lo cual
-- no existe para cobros sueltos del mostrador.
alter table pagos add column if not exists cliente_id uuid references clientes(id);
alter table pagos add column if not exists servicio_id uuid references servicios(id);

-- Backfill: para los pagos históricos que sí vienen de una cita, copiamos
-- el cliente y servicio desde ahí, para que el historial completo quede
-- consistente sin importar el método de pago.
update pagos p
set cliente_id = c.cliente_id, servicio_id = c.servicio_id
from citas c
where p.cita_id = c.id and p.cliente_id is null;

-- Verificación
select metodo_pago, count(*) from pagos group by metodo_pago;
