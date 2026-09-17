import { createClient } from '@/lib/supabase/server'
import PanelResenas from '@/components/PanelResenas'
import '@/components/PanelResenas.css'

const BUCKET = 'fotos-trabajos'

export default async function AdminResenasPage() {
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
        <h1>Reseñas</h1>
        <p>Esta sección es solo para la administradora.</p>
      </div>
    )
  }

  const { data: resenas, error: errorResenas } = await supabase
    .from('resenas')
    .select('*')
    .order('orden', { ascending: true })

  if (errorResenas) {
    console.error('Error cargando reseñas:', errorResenas)
    return (
      <div>
        <h1>Reseñas</h1>
        <p>Hubo un error al cargar los datos.</p>
      </div>
    )
  }

  const resenasConUrl = (resenas ?? []).map((resena) => ({
    ...resena,
    url: resena.foto_url
      ? supabase.storage.from(BUCKET).getPublicUrl(resena.foto_url).data.publicUrl
      : null,
  }))

  return (
    <div>
      <h1>Reseñas</h1>
      <PanelResenas resenasIniciales={resenasConUrl} />
    </div>
  )
}
