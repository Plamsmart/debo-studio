'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type CitaConDetalle = {
  id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  estado: string | null
  clientes: { nombre: string; email: string | null; telefono: string | null } | null
  servicios: { nombre: string; precio: number } | null
}

type Props = {
  citasIniciales: CitaConDetalle[]
  filtroActivo: string
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Completada',
  no_asistio: 'No asistió',
}

const PESTANAS = [
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'confirmada', etiqueta: 'Confirmadas' },
  { valor: 'todas', etiqueta: 'Todas' },
]

export default function PanelCitas({ citasIniciales, filtroActivo }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [citas, setCitas] = useState(citasIniciales)
  const [procesando, setProcesando] = useState<string | null>(null)

  function cambiarPestana(estado: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('estado', estado)
    router.push(`/admin/citas?${params.toString()}`)
  }

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

      const { cita: citaActualizada } = await res.json()

      // Si la pestaña actual ya no debería mostrar esta cita, la quitamos de la lista;
      // si estamos en "todas", solo actualizamos su estado en el lugar.
      setCitas((prev) => {
        if (filtroActivo === 'todas') {
          return prev.map((c) => (c.id === citaId ? { ...c, estado: citaActualizada.estado } : c))
        }
        return prev.filter((c) => c.id !== citaId)
      })
    } finally {
      setProcesando(null)
    }
  }

  return (
    <div className="panel-citas-wrap">
      <div className="panel-citas__pestanas">
        {PESTANAS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => cambiarPestana(p.valor)}
            className={`panel-citas__pestana ${
              filtroActivo === p.valor ? 'panel-citas__pestana--activa' : ''
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {citas.length === 0 ? (
        <p className="panel-citas__vacio">No hay citas en esta vista.</p>
      ) : (
        <div className="panel-citas">
          {citas.map((cita) => (
            <div key={cita.id} className="panel-citas__tarjeta">
              <div className="panel-citas__info">
                <div className="panel-citas__linea-superior">
                  <span className="panel-citas__servicio">{cita.servicios?.nombre}</span>
                  <span className={`panel-citas__badge panel-citas__badge--${cita.estado}`}>
                    {(cita.estado && ETIQUETA_ESTADO[cita.estado]) ?? cita.estado}
                  </span>
                </div>
                <span className="panel-citas__fecha">
                  {cita.fecha} · {cita.hora_inicio} - {cita.hora_fin}
                </span>
                <span className="panel-citas__cliente">
                  {cita.clientes?.nombre} — {cita.clientes?.email || 'sin email'} —{' '}
                  {cita.clientes?.telefono || 'sin teléfono'}
                </span>
                {cita.servicios?.precio != null && (
                  <span className="panel-citas__precio">
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: 'EUR',
                    }).format(cita.servicios.precio)}
                  </span>
                )}
              </div>

              {cita.estado === 'pendiente' && (
                <div className="panel-citas__acciones">
                  <button
                    type="button"
                    disabled={procesando === cita.id}
                    onClick={() => manejarAccion(cita.id, 'confirmar')}
                    className="panel-citas__btn panel-citas__btn--confirmar"
                  >
                    {procesando === cita.id ? 'Procesando…' : 'Confirmar'}
                  </button>
                  <button
                    type="button"
                    disabled={procesando === cita.id}
                    onClick={() => manejarAccion(cita.id, 'cancelar')}
                    className="panel-citas__btn panel-citas__btn--cancelar"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {cita.estado === 'confirmada' && (
                <div className="panel-citas__acciones">
                  <button
                    type="button"
                    disabled={procesando === cita.id}
                    onClick={() => manejarAccion(cita.id, 'cancelar')}
                    className="panel-citas__btn panel-citas__btn--cancelar"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
