-- Permitir cobros del local que no están ligados a una cita online
alter table pagos alter column cita_id drop not null;

-- Descripción libre para cobros sueltos (ej. "Retoque de cejas", "Producto")
alter table pagos add column if not exists concepto text;
