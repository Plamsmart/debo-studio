import { createClient, createServiceClient } from '@/lib/supabase/server'
import PanelClientes from '@/components/PanelClientes'
import '@/components/PanelClientes.css'

const DURACION_SIGNED_URL_SEGUNDOS = 60 * 60 * 24 // 1 día — se regenera en cada carga de la página

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

  // Si es staff, ni las notas ni el historial de pagos viajan al navegador —
  // no es solo ocultarlos visualmente, directamente no se piden.
  // (El string de columnas va inline en cada .select(): si se arma antes en
  // una variable, postgrest-js no logra inferir el tipo del resultado.)
  const { data: clientes, error } = esAdmin
    ? await supabase
        .from('clientes')
        .select('id, nombre, email, telefono, notas, foto_url, creado_en, citas(estado, fecha, servicios(nombre)), pagos(concepto, monto, metodo_pago, estado, creado_en)')
        .order('nombre', { ascending: true })
    : await supabase
        .from('clientes')
        .select('id, nombre, email, telefono, foto_url, creado_en, citas(estado, fecha, servicios(nombre))')
        .order('nombre', { ascending: true })

  if (error) {
    return (
      <div>
        <h1>Clientes</h1>
        <p>Hubo un error al cargar los clientes.</p>
      </div>
    )
  }

  // El bucket de fotos es privado (dato personal sensible), así que cada
  // carga de la página firma una URL temporal por cliente en el servidor.
  const supabaseService = createServiceClient()
  const clientesConFoto = await Promise.all(
    (clientes ?? []).map(async (cliente) => {
      if (!cliente.foto_url) {
        return { ...cliente, foto_signed_url: null }
      }
      const { data } = await supabaseService.storage
        .from('clientes-fotos')
        .createSignedUrl(cliente.foto_url, DURACION_SIGNED_URL_SEGUNDOS)
      return { ...cliente, foto_signed_url: data?.signedUrl ?? null }
    })
  )

  return (
    <div>
      <h1>Clientes</h1>
      <PanelClientes clientesIniciales={clientesConFoto} esAdmin={esAdmin} />
    </div>
  )
}
