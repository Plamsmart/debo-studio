'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type CitaDia = {
  id: string
  hora_inicio: string
  hora_fin: string
  estado: string | null
  servicios: { nombre: string } | null
  clientes: { nombre: string; telefono: string | null; email: string | null } | null
}

type Props = {
  citasIniciales: CitaDia[]
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  no_asistio: 'No asistió',
}

export default function ListaCitasDelDia({ citasIniciales }: Props) {
  const router = useRouter()
  const [citas, setCitas] = useState(citasIniciales)
  const [procesando, setProcesando] = useState<string | null>(null)

  async function manejarAccion(citaId: string, accion: 'confirmar' | 'cancelar') {
    setProcesando(citaId)
    try {
      const res = await fetch(`/api/citas/${citaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo actualizar la cita')
        return
      }

      if (accion === 'cancelar') {
        // El calendario visual no muestra citas canceladas, así que la
        // quitamos aquí también para que ambas vistas queden consistentes.
        setCitas((prev) => prev.filter((c) => c.id !== citaId))
      } else {
        setCitas((prev) =>
          prev.map((c) => (c.id === citaId ? { ...c, estado: 'confirmada' } : c))
        )
      }

      // Refresca la grilla del calendario (Server Component) para que
      // también refleje el cambio, sin recargar toda la página.
      router.refresh()
    } finally {
      setProcesando(null)
    }
  }

  if (citas.length === 0) {
    return <p className="lista-citas-dia__vacio">No hay citas este día.</p>
  }

  return (
    <div className="lista-citas-dia">
      {citas.map((cita) => (
        <div key={cita.id} className="lista-citas-dia__tarjeta">
          <div className="lista-citas-dia__info">
            <div className="lista-citas-dia__linea-superior">
              <span className="lista-citas-dia__hora">
                {cita.hora_inicio.slice(0, 5)} - {cita.hora_fin.slice(0, 5)}
              </span>
              <span
                className={`lista-citas-dia__badge lista-citas-dia__badge--${cita.estado}`}
              >
                {ETIQUETA_ESTADO[cita.estado ?? ''] ?? cita.estado}
              </span>
            </div>
            <span className="lista-citas-dia__servicio">{cita.servicios?.nombre ?? 'Servicio'}</span>
            <span className="lista-citas-dia__cliente">
              {cita.clientes?.nombre ?? 'Cliente'} — {cita.clientes?.telefono || 'sin teléfono'}
            </span>
          </div>

          {(cita.estado === 'pendiente' || cita.estado === 'confirmada') && (
            <div className="lista-citas-dia__acciones">
              {cita.estado === 'pendiente' && (
                <button
                  type="button"
                  disabled={procesando === cita.id}
                  onClick={() => manejarAccion(cita.id, 'confirmar')}
                  className="lista-citas-dia__btn lista-citas-dia__btn--confirmar"
                >
                  {procesando === cita.id ? '…' : 'Confirmar'}
                </button>
              )}
              <button
                type="button"
                disabled={procesando === cita.id}
                onClick={() => manejarAccion(cita.id, 'cancelar')}
                className="lista-citas-dia__btn lista-citas-dia__btn--cancelar"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
