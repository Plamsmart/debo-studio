import Link from 'next/link'

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

export default function CalendarioDia({
  fecha,
  horario,
  laboral,
  citas,
  esHoy,
  urlAnterior,
  urlSiguiente,
  urlHoy,
}: Props) {
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

      {!laboral || !horario ? (
        <p className="calendario-dia__cerrado">El estudio está cerrado este día.</p>
      ) : (
        <CalendarioGrid
          horario={horario}
          citas={citas}
          esHoy={esHoy}
        />
      )}
    </div>
  )
}

function CalendarioGrid({
  horario,
  citas,
  esHoy,
}: {
  horario: { abre: string; cierra: string }
  citas: CitaCalendario[]
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

        {citas.map((cita) => {
          const inicio = minutosDesdeHHMM(cita.hora_inicio.slice(0, 5))
          const fin = minutosDesdeHHMM(cita.hora_fin.slice(0, 5))
          const top = (inicio - apertura) * pxPorMin
          const alto = Math.max((fin - inicio) * pxPorMin, 22)
          const pendiente = cita.estado === 'pendiente'

          return (
            <div
              key={cita.id}
              className={`calendario-dia__evento ${
                pendiente ? 'calendario-dia__evento--pendiente' : ''
              }`}
              style={{ top, height: alto }}
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
