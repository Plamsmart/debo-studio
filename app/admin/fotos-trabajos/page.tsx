import { createClient } from '@/lib/supabase/server'
import PanelFotosTrabajos from '@/components/PanelFotosTrabajos'
import '@/components/PanelFotosTrabajos.css'

const BUCKET = 'fotos-trabajos'

export default async function AdminFotosTrabajosPage() {
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

  if (!esAdmin) {
    return (
      <div>
        <h1>Fotos de trabajos</h1>
        <p>Esta sección es solo para la administradora.</p>
      </div>
    )
  }

  const { data: fotos, error: errorFotos } = await supabase
    .from('fotos_trabajos')
    .select('*, servicios(id, nombre)')
    .order('orden', { ascending: true })

  const { data: servicios, error: errorServicios } = await supabase
    .from('servicios')
    .select('id, nombre, categoria')
    .eq('activo', true)
    .eq('reservable', true)
    .order('categoria', { ascending: true })
    .order('nombre', { ascending: true })

  if (errorFotos || errorServicios) {
    console.error('Error cargando fotos de trabajos o servicios:', errorFotos, errorServicios)
    return (
      <div>
        <h1>Fotos de trabajos</h1>
        <p>Hubo un error al cargar los datos.</p>
      </div>
    )
  }

  const fotosConUrl = (fotos ?? []).map((foto) => {
    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(foto.storage_path)
    return { ...foto, url: publicUrlData.publicUrl }
  })

  return (
    <div>
      <h1>Fotos de trabajos</h1>
      <PanelFotosTrabajos fotosIniciales={fotosConUrl} servicios={servicios ?? []} />
    </div>
  )
}
