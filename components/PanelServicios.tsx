'use client'

import { useState } from 'react'
import type { Tables } from '@/lib/supabase/database.types'

type Servicio = Tables<'servicios'>

type Props = {
  serviciosIniciales: Servicio[]
}

type FormServicio = {
  nombre: string
  descripcion: string
  categoria: string
  duracion_minutos: string
  precio: string
}

const FORM_VACIO: FormServicio = {
  nombre: '',
  descripcion: '',
  categoria: '',
  duracion_minutos: '',
  precio: '',
}

export default function PanelServicios({ serviciosIniciales }: Props) {
  const [servicios, setServicios] = useState(serviciosIniciales)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [formEdicion, setFormEdicion] = useState<FormServicio>(FORM_VACIO)
  const [mostrandoNuevo, setMostrandoNuevo] = useState(false)
  const [formNuevo, setFormNuevo] = useState<FormServicio>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  function iniciarEdicion(servicio: Servicio) {
    setEditandoId(servicio.id)
    setFormEdicion({
      nombre: servicio.nombre,
      descripcion: servicio.descripcion ?? '',
      categoria: servicio.categoria ?? '',
      duracion_minutos: String(servicio.duracion_minutos),
      precio: String(servicio.precio),
    })
  }

  function cancelarEdicion() {
    setEditandoId(null)
    setFormEdicion(FORM_VACIO)
  }

  async function guardarEdicion(id: string) {
    setGuardando(true)
    try {
      const res = await fetch(`/api/servicios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formEdicion.nombre,
          descripcion: formEdicion.descripcion,
          categoria: formEdicion.categoria,
          duracion_minutos: Number(formEdicion.duracion_minutos),
          precio: Number(formEdicion.precio),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo guardar el servicio')
        return
      }

      const { servicio: actualizado } = await res.json()
      setServicios((prev) => prev.map((s) => (s.id === id ? actualizado : s)))
      cancelarEdicion()
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActivo(servicio: Servicio) {
    const res = await fetch(`/api/servicios/${servicio.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !servicio.activo }),
    })

    if (!res.ok) {
      alert('No se pudo cambiar el estado del servicio')
      return
    }

    const { servicio: actualizado } = await res.json()
    setServicios((prev) => prev.map((s) => (s.id === servicio.id ? actualizado : s)))
  }

  async function crearServicio(e: React.FormEvent) {
    e.preventDefault()

    if (!formNuevo.nombre.trim() || !formNuevo.duracion_minutos || !formNuevo.precio) {
      alert('Completa al menos nombre, duración y precio')
      return
    }

    setGuardando(true)
    try {
      const res = await fetch('/api/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formNuevo.nombre,
          descripcion: formNuevo.descripcion,
          categoria: formNuevo.categoria,
          duracion_minutos: Number(formNuevo.duracion_minutos),
          precio: Number(formNuevo.precio),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo crear el servicio')
        return
      }

      const { servicio: creado } = await res.json()
      setServicios((prev) => [...prev, creado])
      setFormNuevo(FORM_VACIO)
      setMostrandoNuevo(false)
    } finally {
      setGuardando(false)
    }
  }

  const porCategoria = servicios.reduce<Record<string, Servicio[]>>((acc, s) => {
    const categoria = s.categoria || 'Otros'
    if (!acc[categoria]) acc[categoria] = []
    acc[categoria].push(s)
    return acc
  }, {})

  return (
    <div className="panel-servicios">
      <button
        type="button"
        className="panel-servicios__btn-nuevo"
        onClick={() => setMostrandoNuevo((v) => !v)}
      >
        {mostrandoNuevo ? 'Cancelar' : '+ Agregar servicio'}
      </button>

      {mostrandoNuevo && (
        <form className="panel-servicios__form-nuevo" onSubmit={crearServicio}>
          <input
            placeholder="Nombre"
            value={formNuevo.nombre}
            onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
            className="panel-servicios__input"
          />
          <input
            placeholder="Categoría"
            value={formNuevo.categoria}
            onChange={(e) => setFormNuevo({ ...formNuevo, categoria: e.target.value })}
            className="panel-servicios__input"
          />
          <input
            placeholder="Descripción (opcional)"
            value={formNuevo.descripcion}
            onChange={(e) => setFormNuevo({ ...formNuevo, descripcion: e.target.value })}
            className="panel-servicios__input panel-servicios__input--ancho"
          />
          <input
            type="number"
            placeholder="Duración (min)"
            value={formNuevo.duracion_minutos}
            onChange={(e) => setFormNuevo({ ...formNuevo, duracion_minutos: e.target.value })}
            className="panel-servicios__input panel-servicios__input--corto"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Precio (€)"
            value={formNuevo.precio}
            onChange={(e) => setFormNuevo({ ...formNuevo, precio: e.target.value })}
            className="panel-servicios__input panel-servicios__input--corto"
          />
          <button type="submit" disabled={guardando} className="panel-servicios__btn-guardar">
            {guardando ? 'Guardando…' : 'Crear servicio'}
          </button>
        </form>
      )}

      {Object.entries(porCategoria).map(([categoria, items]) => (
        <div key={categoria} className="panel-servicios__grupo">
          <h3 className="panel-servicios__categoria">{categoria}</h3>
          <div className="panel-servicios__lista">
            {items.map((servicio) => (
              <div
                key={servicio.id}
                className={`panel-servicios__fila ${!servicio.activo ? 'panel-servicios__fila--inactivo' : ''}`}
              >
                {editandoId === servicio.id ? (
                  <div className="panel-servicios__form-edicion">
                    <input
                      value={formEdicion.nombre}
                      onChange={(e) => setFormEdicion({ ...formEdicion, nombre: e.target.value })}
                      className="panel-servicios__input"
                    />
                    <input
                      value={formEdicion.categoria}
                      onChange={(e) =>
                        setFormEdicion({ ...formEdicion, categoria: e.target.value })
                      }
                      className="panel-servicios__input"
                    />
                    <input
                      type="number"
                      value={formEdicion.duracion_minutos}
                      onChange={(e) =>
                        setFormEdicion({ ...formEdicion, duracion_minutos: e.target.value })
                      }
                      className="panel-servicios__input panel-servicios__input--corto"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={formEdicion.precio}
                      onChange={(e) => setFormEdicion({ ...formEdicion, precio: e.target.value })}
                      className="panel-servicios__input panel-servicios__input--corto"
                    />
                    <div className="panel-servicios__acciones-edicion">
                      <button
                        type="button"
                        disabled={guardando}
                        onClick={() => guardarEdicion(servicio.id)}
                        className="panel-servicios__btn-guardar"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={cancelarEdicion}
                        className="panel-servicios__btn-cancelar"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="panel-servicios__info">
                      <span className="panel-servicios__nombre">{servicio.nombre}</span>
                      <span className="panel-servicios__meta">
                        {servicio.duracion_minutos === 0
                          ? servicio.descripcion || 'Paquete'
                          : `${servicio.duracion_minutos} min`}{' '}
                        ·{' '}
                        {new Intl.NumberFormat('es-ES', {
                          style: 'currency',
                          currency: 'EUR',
                        }).format(servicio.precio)}
                      </span>
                    </div>
                    <div className="panel-servicios__botones">
                      <button
                        type="button"
                        onClick={() => iniciarEdicion(servicio)}
                        className="panel-servicios__btn-editar"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => alternarActivo(servicio)}
                        className={`panel-servicios__btn-toggle ${
                          servicio.activo ? 'panel-servicios__btn-toggle--activo' : ''
                        }`}
                      >
                        {servicio.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
