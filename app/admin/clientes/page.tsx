import { createClient } from '@/lib/supabase/server'
import PanelClientes from '@/components/PanelClientes'
import '@/components/PanelClientes.css'

export default async function AdminClientesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: usuarioAdmin } = await supabase
    .from('usuarios_admin')
    .select('rol')
    .eq('id', user?.id ?? '')
    .maybeSingle()

  const esAdmin = usuarioAdmin?.rol === 'admin'

  // Si es staff, ni siquiera pedimos la columna `notas` — así nunca viaja
  // al navegador, no es solo un tema de ocultarla visualmente.
  const columnas = esAdmin
    ? 'id, nombre, email, telefono, notas, creado_en, citas(estado, fecha, servicios(nombre))'
    : 'id, nombre, email, telefono, creado_en, citas(estado, fecha, servicios(nombre))'

  const { data: clientes, error } = await supabase
    .from('clientes')
    .select(columnas)
    .order('nombre', { ascending: true })

  if (error) {
    return (
      <div>
        <h1>Clientes</h1>
        <p>Hubo un error al cargar los clientes.</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Clientes</h1>
      <PanelClientes clientesIniciales={clientes ?? []} esAdmin={esAdmin} />
    </div>
  )
}
