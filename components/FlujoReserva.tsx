'use client'

import { useState } from 'react'
import type { Tables } from '@/lib/supabase/database.types'
import SelectorServicio from './SelectorServicio'
import SelectorCitas from './SelectorCitas'
import FormularioCliente, { type DatosCliente } from './FormularioCliente'
import './SelectorServicio.css'
import './SelectorCitas.css'
import './FormularioCliente.css'
import './FlujoReserva.css'

type Servicio = Tables<'servicios'>

type Props = {
  servicios: Servicio[]
}

type EstadoEnvio = 'idle' | 'enviando' | 'exito' | 'error'

export default function FlujoReserva({ servicios }: Props) {
  const [servicioElegido, setServicioElegido] = useState<Servicio | null>(null)
  const [seleccion, setSeleccion] = useState<{ fecha: string; hora: string } | null>(null)
  const [estadoEnvio, setEstadoEnvio] = useState<EstadoEnvio>('idle')
  const [mensajeError, setMensajeError] = useState<string | null>(null)

  function elegirServicio(servicio: Servicio) {
    setServicioElegido(servicio)
    setSeleccion(null)
    setEstadoEnvio('idle')
  }

  function elegirFechaHora(fecha: string, hora: string) {
    setSeleccion({ fecha, hora })
    setEstadoEnvio('idle')
  }

  async function confirmarReserva(datosCliente: DatosCliente) {
    if (!servicioElegido || !seleccion) return

    setEstadoEnvio('enviando')
    setMensajeError(null)

    try {
      const res = await fetch('/api/citas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: datosCliente.nombre,
          email: datosCliente.email,
          telefono: datosCliente.telefono,
          servicio_id: servicioElegido.id,
          fecha: seleccion.fecha,
          hora_inicio: seleccion.hora,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMensajeError(data.error || 'No se pudo enviar tu solicitud, inténtalo de nuevo.')
        setEstadoEnvio('error')
        return
      }

      setEstadoEnvio('exito')
    } catch {
      setMensajeError('Hubo un problema de conexión, inténtalo de nuevo.')
      setEstadoEnvio('error')
    }
  }

  if (estadoEnvio === 'exito') {
    return (
      <div className="flujo-reserva__exito">
        <h3 className="flujo-reserva__titulo">¡Solicitud enviada! ✨</h3>
        <p>
          Recibimos tu solicitud para <strong>{servicioElegido?.nombre}</strong> el{' '}
          {seleccion?.fecha} a las {seleccion?.hora}. El estudio va a revisarla y te
          confirmaremos pronto.
        </p>
      </div>
    )
  }

  return (
    <div className="flujo-reserva">
      <section className="flujo-reserva__paso">
        <h3 className="flujo-reserva__titulo">1. Elige un servicio</h3>
        <SelectorServicio
          servicios={servicios}
          servicioSeleccionadoId={servicioElegido?.id ?? null}
          onSeleccionar={elegirServicio}
        />
      </section>

      {servicioElegido && (
        <section className="flujo-reserva__paso">
          <h3 className="flujo-reserva__titulo">2. Elige fecha y hora</h3>
          <SelectorCitas servicioId={servicioElegido.id} onSeleccion={elegirFechaHora} />
        </section>
      )}

      {servicioElegido && seleccion && (
        <section className="flujo-reserva__paso">
          <h3 className="flujo-reserva__titulo">3. Tus datos de contacto</h3>
          <p className="flujo-reserva__resumen-linea">
            <strong>{servicioElegido.nombre}</strong> — {seleccion.fecha} a las {seleccion.hora}
          </p>
          <FormularioCliente onConfirmar={confirmarReserva} enviando={estadoEnvio === 'enviando'} />
          {estadoEnvio === 'error' && mensajeError && (
            <p className="flujo-reserva__error">{mensajeError}</p>
          )}
        </section>
      )}
    </div>
  )
}
