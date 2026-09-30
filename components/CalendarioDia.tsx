import Link from 'next/link'
import type { EventoGoogleDelDia } from '@/lib/google-calendar'

type HorarioDia = { abre: string; cierra: string } | null

type CitaCalendario = {
  id: string
  hora_inicio: string
  hora_fin: string
  estado: string | null
  servicios: { nombre: string } | null
  clientes: { nombre: string; telefono: string | null; email: string | null } | null
}

type Props = {
  fecha: Date
  fechaStr: string
  horario: HorarioDia
  laboral: boolean
  citas: CitaCalendario[]
  eventosGoogle: EventoGoogleDelDia[]
  esHoy: boolean
  urlAnterior: string
  urlSiguiente: string
  urlHoy: string
}

const PX_POR_HORA = 84

function minutosDesdeHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function formatearFechaLarga(fecha: Date): string {
  const texto = fecha.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

type Columna = { columna: number; columnas: number }

// Reparte en columnas los bloques que se solapan (las citas entre sí no pueden,
// pero un evento de Google sí puede caer encima de una cita). Cada grupo de
// bloques encadenados por solapes comparte el mismo número de columnas.
function repartirEnColumnas(bloques: { inicio: number; fin: number }[]): Columna[] {
  const orden = bloques
    .map((_, i) => i)
    .sort((a, b) => bloques[a].inicio - bloques[b].inicio || bloques[b].fin - bloques[a].fin)
  const posiciones: Columna[] = new Array(bloques.length)
  let grupo: number[] = []
  let finesPorColumna: number[] = []
  let finGrupo = -Infinity

  const cerrarGrupo = () => {
    for (const i of grupo) posiciones[i].columnas = finesPorColumna.length
    grupo = []
    finesPorColumna = []
  }

  for (const i of orden) {
    const { inicio, fin } = bloques[i]
    if (inicio >= finGrupo) cerrarGrupo()
    let columna = finesPorColumna.findIndex((f) => f <= inicio)
    if (columna === -1) {
      columna = finesPorColumna.length
      finesPorColumna.push(fin)
    } else {
      finesPorColumna[columna] = fin
    }
    posiciones[i] = { columna, columnas: 1 }
    grupo.push(i)
    finGrupo = inicio >= finGrupo ? fin : Math.max(finGrupo, fin)
  }
  cerrarGrupo()

  return posiciones
}

export default function CalendarioDia({
  fecha,
  horario,
  laboral,
  citas,
  eventosGoogle,
  esHoy,
  urlAnterior,
  urlSiguiente,
  urlHoy,
}: Props) {
  const eventosDiaCompleto = eventosGoogle.filter((e) => e.diaCompleto)

  return (
    <div className="calendario-dia">
      <div className="calendario-dia__header">
        <div className="calendario-dia__nav">
          <Link href={urlAnterior} className="calendario-dia__flecha" aria-label="Día anterior">
            ‹
          </Link>
          <Link href={urlHoy} className="calendario-dia__btn-hoy">
            Hoy
          </Link>
          <Link href={urlSiguiente} className="calendario-dia__flecha" aria-label="Día siguiente">
            ›
          </Link>
        </div>
        <span className="calendario-dia__fecha">{formatearFechaLarga(fecha)}</span>
      </div>

      {eventosDiaCompleto.length > 0 && (
        <div className="calendario-dia__todo-el-dia">
          {eventosDiaCompleto.map((evento) => (
            <div
              key={evento.id}
              className="calendario-dia__todo-el-dia-evento"
              title={`${evento.titulo}\nTodo el día — Google Calendar (solo lectura)`}
            >
              <span className="calendario-dia__etiqueta-google">Google</span>
              <span className="calendario-dia__evento-titulo">{evento.titulo}</span>
            </div>
          ))}
        </div>
      )}

      {!laboral || !horario ? (
        <p className="calendario-dia__cerrado">El estudio está cerrado este día.</p>
      ) : (
        <CalendarioGrid
          horario={horario}
          citas={citas}
          eventosGoogle={eventosGoogle.filter((e) => !e.diaCompleto)}
          esHoy={esHoy}
        />
      )}
    </div>
  )
}

type BloqueGrid =
  | { tipo: 'cita'; inicio: number; fin: number; cita: CitaCalendario }
  | { tipo: 'google'; inicio: number; fin: number; evento: EventoGoogleDelDia }

function CalendarioGrid({
  horario,
  citas,
  eventosGoogle,
  esHoy,
}: {
  horario: { abre: string; cierra: string }
  citas: CitaCalendario[]
  eventosGoogle: EventoGoogleDelDia[]
  esHoy: boolean
}) {
  const apertura = minutosDesdeHHMM(horario.abre)
  const cierre = minutosDesdeHHMM(horario.cierra)
  const pxPorMin = PX_POR_HORA / 60
  const alturaTotal = (cierre - apertura) * pxPorMin

  // Marcas de hora en el eje izquierdo (cada hora completa dentro del rango)
  const marcas: number[] = []
  for (let m = Math.ceil(apertura / 60) * 60; m <= cierre; m += 60) {
    marcas.push(m)
  }

  const ahora = new Date()
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes()
  const mostrarLineaAhora = esHoy && minutosAhora >= apertura && minutosAhora <= cierre

  // Los eventos de Google se recortan al horario visible; los que caen
  // completamente fuera solo aparecen en la lista de la derecha.
  const bloques: BloqueGrid[] = [
    ...citas.map((cita) => ({
      tipo: 'cita' as const,
      inicio: minutosDesdeHHMM(cita.hora_inicio.slice(0, 5)),
      fin: minutosDesdeHHMM(cita.hora_fin.slice(0, 5)),
      cita,
    })),
    ...eventosGoogle.flatMap((evento) => {
      const inicio = Math.max(minutosDesdeHHMM(evento.inicio), apertura)
      const fin = Math.min(minutosDesdeHHMM(evento.fin), cierre)
      return fin > inicio ? [{ tipo: 'google' as const, inicio, fin, evento }] : []
    }),
  ]
  const columnas = repartirEnColumnas(bloques)

  return (
    <div className="calendario-dia__grid-wrap">
      <div className="calendario-dia__grid" style={{ height: alturaTotal }}>
        {marcas.map((m) => (
          <div
            key={m}
            className="calendario-dia__linea-hora"
            style={{ top: (m - apertura) * pxPorMin }}
          >
            <span className="calendario-dia__etiqueta-hora">
              {Math.floor(m / 60)
                .toString()
                .padStart(2, '0')}
              :00
            </span>
          </div>
        ))}

        {mostrarLineaAhora && (
          <div
            className="calendario-dia__linea-ahora"
            style={{ top: (minutosAhora - apertura) * pxPorMin }}
          />
        )}

        {bloques.map((bloque, i) => {
          const top = (bloque.inicio - apertura) * pxPorMin
          const alto = Math.max((bloque.fin - bloque.inicio) * pxPorMin, 22)
          const { columna, columnas: total } = columnas[i]
          // Con una sola columna se mantiene el ancho completo del CSS.
          const posicion =
            total > 1
              ? {
                  left: `calc(0.5rem + (100% - 1rem) * ${columna} / ${total})`,
                  width: `calc((100% - 1rem) / ${total} - 3px)`,
                  right: 'auto',
                }
              : {}

          if (bloque.tipo === 'google') {
            const { evento } = bloque
            return (
              <div
                key={`google-${evento.id}`}
                className="calendario-dia__evento calendario-dia__evento--google"
                style={{ top, height: alto, ...posicion }}
                title={`${evento.titulo}\n${evento.inicio} - ${evento.fin}\nGoogle Calendar (solo lectura)`}
              >
                <span className="calendario-dia__evento-hora">
                  <span className="calendario-dia__etiqueta-google">Google</span> {evento.inicio}
                </span>
                <span className="calendario-dia__evento-titulo">{evento.titulo}</span>
              </div>
            )
          }

          const { cita } = bloque
          const pendiente = cita.estado === 'pendiente'

          return (
            <div
              key={cita.id}
              className={`calendario-dia__evento ${
                pendiente ? 'calendario-dia__evento--pendiente' : ''
              }`}
              style={{ top, height: alto, ...posicion }}
              title={`${cita.servicios?.nombre ?? 'Servicio'} — ${cita.clientes?.nombre ?? 'Cliente'}\n${cita.hora_inicio.slice(0, 5)} - ${cita.hora_fin.slice(0, 5)}\n${cita.clientes?.telefono ?? ''}`}
            >
              <span className="calendario-dia__evento-hora">
                {cita.hora_inicio.slice(0, 5)}
              </span>
              <span className="calendario-dia__evento-titulo">
                {cita.servicios?.nombre ?? 'Servicio'} — {cita.clientes?.nombre ?? 'Cliente'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
