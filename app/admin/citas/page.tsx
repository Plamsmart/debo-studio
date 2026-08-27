import { createClient } from '@/lib/supabase/server'
import PanelCitas from '@/components/PanelCitas'
import '@/components/PanelCitas.css'

const ESTADOS_VALIDOS = ['pendiente', 'confirmada', 'todas'] as const
type EstadoFiltro = (typeof ESTADOS_VALIDOS)[number]

export default async function AdminCitasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>
}) {
  const { estado } = await searchParams
  const filtro: EstadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoFiltro)
    ? (estado as EstadoFiltro)
    : 'pendiente'

  const supabase = await createClient()

  let query = supabase
    .from('citas')
    .select('*, clientes(nombre, email, telefono), servicios(nombre, precio)')
    .order('fecha', { ascending: true })
    .order('hora_inicio', { ascending: true })

  if (filtro !== 'todas') {
    query = query.eq('estado', filtro)
  }

  const { data: citas, error } = await query

  if (error) {
    return (
      <div>
        <h1>Citas</h1>
        <p>Hubo un error al cargar las citas.</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Citas</h1>
      <PanelCitas key={filtro} citasIniciales={citas ?? []} filtroActivo={filtro} />
    </div>
  )
}
