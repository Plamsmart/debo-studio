-- service_role necesita poder insertar el registro de pago (al confirmar la cita)
-- y actualizarlo (desde el webhook, cuando Stripe confirma el pago).
GRANT SELECT, INSERT, UPDATE ON public.pagos TO service_role;
