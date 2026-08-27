import { createClient } from '@/lib/supabase/server'
import PanelServicios from '@/components/PanelServicios'
import '@/components/PanelServicios.css'

export default async function AdminServiciosPage() {
  const supabase = await createClient()

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
      <PanelServicios serviciosIniciales={servicios ?? []} />
    </div>
  )
}
