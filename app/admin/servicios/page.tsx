import { createClient } from '@/lib/supabase/server'
import PanelServicios from '@/components/PanelServicios'
import '@/components/PanelServicios.css'

export default async function AdminServiciosPage() {
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

  const { data: servicios, error } = await supabase
    .from('servicios')
    .select('*')
    .order('categoria', { ascending: true })
    .order('nombre', { ascending: true })

  if (error) {
    return (
      <div>
        <h1>Servicios</h1>
        <p>Hubo un error al cargar los servicios.</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Servicios</h1>
      <PanelServicios serviciosIniciales={servicios ?? []} esAdmin={esAdmin} />
    </div>
  )
}
