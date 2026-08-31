'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Tables } from '@/lib/supabase/database.types'

type Servicio = Tables<'servicios'>

type Props = {
  servicios: Servicio[]
  servicioSeleccionadoId: string | null
  onSeleccionar: (servicio: Servicio) => void
}

function formatearPrecio(precio: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(precio)
}

function formatearDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`
}

export default function SelectorServicio({
  servicios,
  servicioSeleccionadoId,
  onSeleccionar,
}: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [categoriasAbiertas, setCategoriasAbiertas] = useState<Set<string>>(new Set())

  // Al montar, si ya hay un servicio seleccionado, abrir su categoría de entrada
  useEffect(() => {
    if (servicioSeleccionadoId) {
      const servicio = servicios.find((s) => s.id === servicioSeleccionadoId)
      if (servicio) {
        const categoria = servicio.categoria || 'Otros'
        setCategoriasAbiertas((prev) => new Set(prev).add(categoria))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const porCategoria = useMemo(() => {
    return servicios.reduce<Record<string, Servicio[]>>((acc, s) => {
      const categoria = s.categoria || 'Otros'
      if (!acc[categoria]) acc[categoria] = []
      acc[categoria].push(s)
      return acc
    }, {})
  }, [servicios])

  const busquedaActiva = busqueda.trim().length > 0

  const categoriasFiltradas = useMemo(() => {
    if (!busquedaActiva) return porCategoria

    const q = busqueda.trim().toLowerCase()
    const resultado: Record<string, Servicio[]> = {}
    for (const [categoria, items] of Object.entries(porCategoria)) {
      const coincidencias = items.filter((s) => s.nombre.toLowerCase().includes(q))
      if (coincidencias.length > 0) resultado[categoria] = coincidencias
    }
    return resultado
  }, [porCategoria, busqueda, busquedaActiva])

  function alternarCategoria(categoria: string) {
    setCategoriasAbiertas((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(categoria)) {
        nuevo.delete(categoria)
      } else {
        nuevo.add(categoria)
      }
      return nuevo
    })
  }

  if (servicios.length === 0) {
    return (
      <p className="selector-servicio__estado">
        Todavía no hay servicios disponibles para reservar.
      </p>
    )
  }

  const categorias = Object.entries(categoriasFiltradas)

  return (
    <div className="selector-servicio">
      <input
        type="text"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar un servicio…"
        className="selector-servicio__buscador"
      />

      {busquedaActiva && categorias.length === 0 && (
        <p className="selector-servicio__estado">No encontramos servicios con ese nombre.</p>
      )}

      {categorias.map(([categoria, items]) => {
        const abierta = busquedaActiva || categoriasAbiertas.has(categoria)
        return (
          <div key={categoria} className="selector-servicio__grupo">
            <button
              type="button"
              className="selector-servicio__categoria-btn"
              onClick={() => alternarCategoria(categoria)}
              aria-expanded={abierta}
            >
              <span className="selector-servicio__categoria-nombre">{categoria}</span>
              <span className="selector-servicio__categoria-meta">
                <span className="selector-servicio__categoria-conteo">{items.length}</span>
                <span
                  className={`selector-servicio__chevron ${abierta ? 'selector-servicio__chevron--abierto' : ''}`}
                  aria-hidden="true"
                >
                  ⌄
                </span>
              </span>
            </button>

            {abierta && (
              <div className="selector-servicio__lista">
                {items.map((servicio) => {
                  const activo = servicioSeleccionadoId === servicio.id
                  return (
                    <button
                      key={servicio.id}
                      type="button"
                      onClick={() => onSeleccionar(servicio)}
                      className={`selector-servicio__tarjeta ${
                        activo ? 'selector-servicio__tarjeta--activo' : ''
                      }`}
                    >
                      <div className="selector-servicio__info">
                        <span className="selector-servicio__nombre">{servicio.nombre}</span>
                        {servicio.descripcion && (
                          <span className="selector-servicio__descripcion">
                            {servicio.descripcion}
                          </span>
                        )}
                      </div>
                      <div className="selector-servicio__meta">
                        <span className="selector-servicio__duracion">
                          {formatearDuracion(servicio.duracion_minutos)}
                        </span>
                        <span className="selector-servicio__precio">
                          {formatearPrecio(servicio.precio)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
