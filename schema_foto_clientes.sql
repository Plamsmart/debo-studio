-- Foto de perfil circular para clientes en el panel admin.
alter table clientes add column if not exists foto_url text;

-- Bucket privado para las fotos de clientes (dato personal sensible — GDPR,
-- son rostros de clientes reales). No lleva políticas de storage.objects:
-- sin políticas, RLS deniega todo a 'anon'/'authenticated' por defecto y
-- solo el service_role (usado desde el backend/API route, nunca expuesto
-- al navegador) puede subir/leer/borrar objetos. La app muestra las fotos
-- generando signed URLs de corta duración desde el servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clientes-fotos',
  'clientes-fotos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
