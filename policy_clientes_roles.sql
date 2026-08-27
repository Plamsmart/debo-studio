-- Solo el rol 'admin' (Débora) puede eliminar clientes.
-- El staff puede seguir viendo/gestionando citas y contacto básico, pero no borrar.
drop policy if exists "clientes_delete_admin" on clientes;

create policy "clientes_delete_solo_admin"
  on clientes for delete
  using (
    exists (
      select 1 from usuarios_admin
      where id = auth.uid() and rol = 'admin'
    )
  );

-- Referencia: así se agrega una cuenta de staff (rol distinto al de Débora).
-- 1. Crear el usuario en Supabase → Authentication → Users (igual que hicimos con el tuyo)
-- 2. Insertar su fila en usuarios_admin con rol = 'staff':
--    insert into usuarios_admin (id, nombre, rol)
--    values ('UUID-DEL-USUARIO', 'Nombre del staff', 'staff');
