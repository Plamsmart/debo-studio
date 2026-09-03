'use client'

import { useState } from 'react'

type CitaResumen = {
  estado: string | null
  fecha: string
  servicios: { nombre: string } | null
}

type PagoResumen = {
  concepto: string | null
  monto: number
  metodo_pago: string | null
  estado: string | null
  creado_en: string | null
}

type Cliente = {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  notas?: string | null // solo presente si esAdmin=true
  creado_en: string | null
  citas: CitaResumen[] | null
  pagos?: PagoResumen[] | null // solo presente si esAdmin=true
}

type Props = {
  clientesIniciales: Cliente[]
  esAdmin: boolean
}

type FormCliente = {
  nombre: string
  email: string
  telefono: string
  notas: string
}

const FORM_VACIO: FormCliente = { nombre: '', email: '', telefono: '', notas: '' }

const ETIQUETA_METODO: Record<string, string> = {
  web: 'Web',
  qr_local: 'QR en el local',
  efectivo: 'Efectivo',
}

function serviciosConsumidos(citas: CitaResumen[] | null): string[] {
  if (!citas) return []
  const nombres = citas
    .filter((c) => c.estado === 'confirmada' || c.estado === 'completada')
    .map((c) => c.servicios?.nombre)
    .filter((n): n is string => Boolean(n))
  return Array.from(new Set(nombres))
}

function formatearPrecio(precio: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(precio)
}

function formatearFecha(fechaISO: string | null): string {
  if (!fechaISO) return ''
  const d = new Date(fechaISO)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PanelClientes({ clientesIniciales, esAdmin }: Props) {
  const [clientes, setClientes] = useState(clientesIniciales)
  const [busqueda, setBusqueda] = useState('')
  const [editandoNotasId, setEditandoNotasId] = useState<string | null>(null)
  const [notasTemp, setNotasTemp] = useState('')
  const [mostrandoNuevo, setMostrandoNuevo] = useState(false)
  const [formNuevo, setFormNuevo] = useState<FormCliente>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [historialAbiertoId, setHistorialAbiertoId] = useState<string | null>(null)

  const clientesFiltrados = clientes.filter((c) => {
    const q = busqueda.toLowerCase()
    return (
      c.nombre.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.telefono?.toLowerCase().includes(q)
    )
  })

  function iniciarEdicionNotas(cliente: Cliente) {
    if (!esAdmin) return
    setEditandoNotasId(cliente.id)
    setNotasTemp(cliente.notas ?? '')
  }

  async function guardarNotas(id: string) {
    const res = await fetch(`/api/clientes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notas: notasTemp }),
    })

    if (!res.ok) {
      const data = await res.json()
      alert(data.error || 'No se pudieron guardar las notas')
      return
    }

    const { cliente: actualizado } = await res.json()
    setClientes((prev) => prev.map((c) => (c.id === id ? { ...c, ...actualizado } : c)))
    setEditandoNotasId(null)
  }

  async function eliminarCliente(cliente: Cliente) {
    const confirmar = confirm(`¿Eliminar a ${cliente.nombre}? Esta acción no se puede deshacer.`)
    if (!confirmar) return

    const res = await fetch(`/api/clientes/${cliente.id}`, { method: 'DELETE' })

    if (!res.ok) {
      const data = await res.json()
      alert(data.error || 'No se pudo eliminar el cliente')
      return
    }

    setClientes((prev) => prev.filter((c) => c.id !== cliente.id))
  }

  async function crearCliente(e: React.FormEvent) {
    e.preventDefault()
    if (!formNuevo.nombre.trim()) {
      alert('El nombre es obligatorio')
      return
    }

    setGuardando(true)
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formNuevo),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo crear el cliente')
        return
      }

      const { cliente: creado } = await res.json()
      setClientes((prev) =>
        [...prev, { ...creado, citas: [], pagos: [] }].sort((a, b) =>
          a.nombre.localeCompare(b.nombre)
        )
      )
      setFormNuevo(FORM_VACIO)
      setMostrandoNuevo(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="panel-clientes">
      <div className="panel-clientes__barra">
        <input
          type="text"
          placeholder="Buscar por nombre, email o teléfono…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="panel-clientes__buscador"
        />
        <button
          type="button"
          className="panel-clientes__btn-nuevo"
          onClick={() => setMostrandoNuevo((v) => !v)}
        >
          {mostrandoNuevo ? 'Cancelar' : '+ Agregar cliente'}
        </button>
      </div>

      {mostrandoNuevo && (
        <form className="panel-clientes__form-nuevo" onSubmit={crearCliente}>
          <input
            placeholder="Nombre *"
            value={formNuevo.nombre}
            onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
            className="panel-clientes__input"
          />
          <input
            placeholder="Email"
            value={formNuevo.email}
            onChange={(e) => setFormNuevo({ ...formNuevo, email: e.target.value })}
            className="panel-clientes__input"
          />
          <input
            placeholder="Teléfono"
            value={formNuevo.telefono}
            onChange={(e) => setFormNuevo({ ...formNuevo, telefono: e.target.value })}
            className="panel-clientes__input"
          />
          {esAdmin && (
            <input
              placeholder="Notas (opcional)"
              value={formNuevo.notas}
              onChange={(e) => setFormNuevo({ ...formNuevo, notas: e.target.value })}
              className="panel-clientes__input panel-clientes__input--ancho"
            />
          )}
          <button type="submit" disabled={guardando} className="panel-clientes__btn-guardar">
            {guardando ? 'Guardando…' : 'Crear cliente'}
          </button>
        </form>
      )}

      {clientesFiltrados.length === 0 ? (
        <p className="panel-clientes__vacio">No se encontraron clientes.</p>
      ) : (
        <div className="panel-clientes__lista">
          {clientesFiltrados.map((cliente) => {
            const servicios = serviciosConsumidos(cliente.citas)
            const pagosCompletados = (cliente.pagos ?? [])
              .filter((p) => p.estado === 'pagado')
              .sort((a, b) => (b.creado_en ?? '').localeCompare(a.creado_en ?? ''))
            const totalGastado = pagosCompletados.reduce((sum, p) => sum + p.monto, 0)
            const historialAbierto = historialAbiertoId === cliente.id

            return (
              <div key={cliente.id} className="panel-clientes__tarjeta">
                <div className="panel-clientes__info">
                  <span className="panel-clientes__nombre">{cliente.nombre}</span>
                  <span className="panel-clientes__contacto">
                    {cliente.email || 'sin email'} — {cliente.telefono || 'sin teléfono'}
                  </span>

                  {servicios.length > 0 && (
                    <div className="panel-clientes__servicios">
                      {servicios.map((s) => (
                        <span key={s} className="panel-clientes__badge-servicio">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {esAdmin && pagosCompletados.length > 0 && (
                    <div className="panel-clientes__historial">
                      <button
                        type="button"
                        className="panel-clientes__historial-toggle"
                        onClick={() =>
                          setHistorialAbiertoId(historialAbierto ? null : cliente.id)
                        }
                      >
                        {historialAbierto ? '▾' : '▸'} Historial de pagos ·{' '}
                        {formatearPrecio(totalGastado)} total ({pagosCompletados.length})
                      </button>

                      {historialAbierto && (
                        <div className="panel-clientes__historial-lista">
                          {pagosCompletados.map((pago, i) => (
                            <div key={i} className="panel-clientes__historial-item">
                              <span className="panel-clientes__historial-concepto">
                                {pago.concepto || 'Sin concepto'}
                              </span>
                              <span
                                className={`panel-clientes__badge-metodo panel-clientes__badge-metodo--${pago.metodo_pago}`}
                              >
                                {ETIQUETA_METODO[pago.metodo_pago ?? ''] ?? pago.metodo_pago}
                              </span>
                              <span className="panel-clientes__historial-fecha">
                                {formatearFecha(pago.creado_en)}
                              </span>
                              <span className="panel-clientes__historial-monto">
                                {formatearPrecio(pago.monto)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {esAdmin &&
                    (editandoNotasId === cliente.id ? (
                      <div className="panel-clientes__notas-edicion">
                        <textarea
                          value={notasTemp}
                          onChange={(e) => setNotasTemp(e.target.value)}
                          className="panel-clientes__textarea"
                          rows={2}
                        />
                        <div className="panel-clientes__acciones-notas">
                          <button
                            type="button"
                            onClick={() => guardarNotas(cliente.id)}
                            className="panel-clientes__btn-guardar"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditandoNotasId(null)}
                            className="panel-clientes__btn-cancelar"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="panel-clientes__notas"
                        onClick={() => iniciarEdicionNotas(cliente)}
                      >
                        {cliente.notas || 'Sin notas — clic para agregar'}
                      </button>
                    ))}
                </div>

                {esAdmin && (
                  <button
                    type="button"
                    onClick={() => eliminarCliente(cliente)}
                    className="panel-clientes__btn-eliminar"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
