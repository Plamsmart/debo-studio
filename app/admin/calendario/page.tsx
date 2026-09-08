import { createClient } from '@/lib/supabase/server'
import { horarioDelDia, esDiaLaboral } from '@/lib/horario-negocio'
import CalendarioDia from '@/components/CalendarioDia'
import ListaCitasDelDia from '@/components/ListaCitasDelDia'
import '@/components/CalendarioDia.css'
import '@/components/ListaCitasDelDia.css'
import '@/components/CalendarioLayout.css'

function formatoFecha(fecha: Date): string {
  const y = fecha.getFullYear()
  const m = (fecha.getMonth() + 1).toString().padStart(2, '0')
  const d = fecha.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>
}) {
  const { fecha: fechaParam } = await searchParams
  const fecha = fechaParam ? new Date(`${fechaParam}T00:00:00`) : new Date()
  fecha.setHours(0, 0, 0, 0)
  const fechaStr = formatoFecha(fecha)

  const supabase = await createClient()
  const { data: citas } = await supabase
    .from('citas')
    .select(
      'id, hora_inicio, hora_fin, estado, servicios(nombre), clientes(nombre, telefono, email)'
    )
    .eq('fecha', fechaStr)
    .neq('estado', 'cancelada')
    .order('hora_inicio', { ascending: true })

  const horario = horarioDelDia(fecha)
  const laboral = esDiaLaboral(fecha)

  const diaAnterior = new Date(fecha)
  diaAnterior.setDate(diaAnterior.getDate() - 1)
  const diaSiguiente = new Date(fecha)
  diaSiguiente.setDate(diaSiguiente.getDate() + 1)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  return (
    <div>
      <h1>Calendario</h1>
      <div className="calendario-layout">
        <div className="calendario-layout__columna-calendario">
          <CalendarioDia
            fecha={fecha}
            fechaStr={fechaStr}
            horario={horario}
            laboral={laboral}
            citas={citas ?? []}
            esHoy={fechaStr === formatoFecha(hoy)}
            urlAnterior={`/admin/calendario?fecha=${formatoFecha(diaAnterior)}`}
            urlSiguiente={`/admin/calendario?fecha=${formatoFecha(diaSiguiente)}`}
            urlHoy={`/admin/calendario?fecha=${formatoFecha(hoy)}`}
          />
        </div>

        <div className="calendario-layout__columna-lista">
          <h3 className="calendario-layout__titulo-lista">Citas de este día</h3>
          <ListaCitasDelDia citasIniciales={citas ?? []} />
        </div>
      </div>
    </div>
  )
}
