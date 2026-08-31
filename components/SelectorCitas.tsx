'use client'

import { useEffect, useMemo, useState } from 'react'
import { esDiaLaboral } from '@/lib/horario-negocio'

type Props = {
  servicioId: string
  onSeleccion: (fecha: string, hora: string) => void
}

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DIAS_SEMANA = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

function formatoFecha(fecha: Date): string {
  const y = fecha.getFullYear()
  const m = (fecha.getMonth() + 1).toString().padStart(2, '0')
  const d = fecha.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

function inicioDelDia(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function primerDiaDelMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1)
}

export default function SelectorCitas({ servicioId, onSeleccion }: Props) {
  const hoy = useMemo(() => inicioDelDia(new Date()), [])
  const [mesMostrado, setMesMostrado] = useState<Date>(() => primerDiaDelMes(new Date()))
  const [fechaSeleccionada, setFechaSeleccionada] = useState<Date | null>(null)
  const [horaSeleccionada, setHoraSeleccionada] = useState<string | null>(null)
  const [horariosDisponibles, setHorariosDisponibles] = useState<string[]>([])
  const [cargando, setCargando] = useState(false)
  const [diaCerrado, setDiaCerrado] = useState(false)

  const celdas = useMemo(() => {
    const primerDia = mesMostrado.getDay() // 0=domingo
    const diasEnMes = new Date(mesMostrado.getFullYear(), mesMostrado.getMonth() + 1, 0).getDate()
    const resultado: (Date | null)[] = []

    for (let i = 0; i < primerDia; i++) resultado.push(null)
    for (let d = 1; d <= diasEnMes; d++) {
      resultado.push(new Date(mesMostrado.getFullYear(), mesMostrado.getMonth(), d))
    }
    while (resultado.length % 7 !== 0) resultado.push(null)

    return resultado
  }, [mesMostrado])

  const esMesActualOAnterior =
    mesMostrado.getFullYear() < hoy.getFullYear() ||
    (mesMostrado.getFullYear() === hoy.getFullYear() && mesMostrado.getMonth() <= hoy.getMonth())

  function mesAnterior() {
    if (esMesActualOAnterior) return
    const d = new Date(mesMostrado)
    d.setMonth(d.getMonth() - 1)
    setMesMostrado(d)
  }

  function mesSiguiente() {
    const d = new Date(mesMostrado)
    d.setMonth(d.getMonth() + 1)
    setMesMostrado(d)
  }

  function diaDeshabilitado(dia: Date): boolean {
    return dia < hoy || !esDiaLaboral(dia)
  }

  function elegirDia(dia: Date) {
    if (diaDeshabilitado(dia)) return
    setFechaSeleccionada(dia)
  }

  useEffect(() => {
    if (!fechaSeleccionada || !servicioId) return

    const fechaStr = formatoFecha(fechaSeleccionada)
    setCargando(true)
    setHoraSeleccionada(null)
    setDiaCerrado(false)

    fetch(`/api/disponibilidad?fecha=${fechaStr}&servicio_id=${servicioId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.motivo === 'dia_cerrado') {
          setDiaCerrado(true)
          setHorariosDisponibles([])
        } else {
          setHorariosDisponibles(data.disponibles || [])
        }
      })
      .finally(() => setCargando(false))
  }, [fechaSeleccionada, servicioId])

  function elegirHora(hora: string) {
    if (!fechaSeleccionada) return
    setHoraSeleccionada(hora)
    onSeleccion(formatoFecha(fechaSeleccionada), hora)
  }

  return (
    <div className="selector-citas">
      <div className="selector-citas__seccion">
        <h3 className="selector-citas__titulo">Elige un día</h3>

        <div className="selector-citas__calendario">
          <div className="selector-citas__calendario-header">
            <button
              type="button"
              onClick={mesAnterior}
              disabled={esMesActualOAnterior}
              className="selector-citas__flecha"
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <span className="selector-citas__mes-nombre">
              {NOMBRES_MES[mesMostrado.getMonth()]} {mesMostrado.getFullYear()}
            </span>
            <button
              type="button"
              onClick={mesSiguiente}
              className="selector-citas__flecha"
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>

          <div className="selector-citas__grid-encabezado">
            {DIAS_SEMANA.map((d, i) => (
              <span key={i} className="selector-citas__dia-semana">
                {d}
              </span>
            ))}
          </div>

          <div className="selector-citas__grid">
            {celdas.map((dia, i) => {
              if (!dia) return <div key={i} className="selector-citas__celda-vacia" />

              const deshabilitado = diaDeshabilitado(dia)
              const esHoy = formatoFecha(dia) === formatoFecha(hoy)
              const activo = fechaSeleccionada && formatoFecha(dia) === formatoFecha(fechaSeleccionada)

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => elegirDia(dia)}
                  disabled={deshabilitado}
                  className={`selector-citas__celda ${esHoy ? 'selector-citas__celda--hoy' : ''} ${
                    activo ? 'selector-citas__celda--activo' : ''
                  } ${deshabilitado ? 'selector-citas__celda--deshabilitado' : ''}`}
                >
                  {dia.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {fechaSeleccionada && (
        <div className="selector-citas__seccion">
          <h3 className="selector-citas__titulo">Elige una hora</h3>

          {cargando && <p className="selector-citas__estado">Buscando horarios disponibles…</p>}

          {!cargando && diaCerrado && (
            <p className="selector-citas__estado">Ese día el estudio está cerrado.</p>
          )}

          {!cargando && !diaCerrado && horariosDisponibles.length === 0 && (
            <p className="selector-citas__estado">No quedan horarios disponibles ese día.</p>
          )}

          {!cargando && horariosDisponibles.length > 0 && (
            <div className="selector-citas__horas">
              {horariosDisponibles.map((hora) => (
                <button
                  key={hora}
                  type="button"
                  onClick={() => elegirHora(hora)}
                  className={`selector-citas__hora-btn ${
                    horaSeleccionada === hora ? 'selector-citas__hora-btn--activo' : ''
                  }`}
                >
                  {hora}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
