-- Nuevo método de pago: tarjeta cobrada con el datáfono propio del estudio
-- (fuera de Stripe; la app solo registra el pago, igual que el efectivo).
-- Distinto de 'qr_local' (tarjeta vía Stripe Checkout desde el QR).
--
-- ADD VALUE añade el valor al final del enum y no reescribe la tabla.
-- Ejecutarlo SOLO (no en el mismo bloque/transacción que un insert que lo use).
-- No hacen falta GRANTs nuevos: la tabla pagos y el rol service_role no cambian.
alter type metodo_pago add value if not exists 'tarjeta_datafono';

-- Verificación
select unnest(enum_range(null::metodo_pago)) as metodo_pago;
