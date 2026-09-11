'use client'

import { useState } from 'react'
import type { Tables } from '@/lib/supabase/database.types'

type Servicio = Pick<Tables<'servicios'>, 'id' | 'nombre' | 'categoria'>

type FotoTrabajo = Tables<'fotos_trabajos'> & {
  servicios: { id: string; nombre: string } | null
  url: string
}

type Props = {
  fotosIniciales: FotoTrabajo[]
  servicios: Servicio[]
}

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp']
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024

export default function PanelFotosTrabajos({ fotosIniciales, servicios }: Props) {
  const [fotos, setFotos] = useState(fotosIniciales)
  const [servicioNuevo, setServicioNuevo] = useState('')
  const [errorServicio, setErrorServicio] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [moviendoId, setMoviendoId] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  function manejarClickBoton(e: React.MouseEvent<HTMLLabelElement>) {
    if (subiendo) {
      e.preventDefault()
      return
    }
    if (!servicioNuevo) {
      e.preventDefault()
      setErrorServicio(true)
      return
    }
  }

  async function manejarSeleccionArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return

    if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
      alert('La foto debe ser JPG, PNG o WEBP')
      return
    }
    if (archivo.size > TAMANO_MAXIMO_BYTES) {
      alert('La foto no puede superar 5MB')
      return
    }

    setSubiendo(true)
    try {
      const formData = new FormData()
      formData.append('foto', archivo)
      formData.append('servicio_id', servicioNuevo)

      const res = await fetch('/api/fotos-trabajos', { method: 'POST', body: formData })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo subir la foto')
        return
      }

      const { foto } = await res.json()
      setFotos((prev) => [...prev, foto].sort((a, b) => a.orden - b.orden))
    } finally {
      setSubiendo(false)
    }
  }

  async function eliminarFoto(id: string) {
    if (!confirm('¿Eliminar esta foto? No se puede deshacer.')) return

    setEliminandoId(id)
    try {
      const res = await fetch(`/api/fotos-trabajos/${id}`, { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo eliminar la foto')
        return
      }

      setFotos((prev) => prev.filter((f) => f.id !== id))
    } finally {
      setEliminandoId(null)
    }
  }

  async function moverFoto(index: number, direccion: -1 | 1) {
    const otroIndex = index + direccion
    if (otroIndex < 0 || otroIndex >= fotos.length) return

    const actual = fotos[index]
    const otra = fotos[otroIndex]

    setMoviendoId(actual.id)
    try {
      const [resActual, resOtra] = await Promise.all([
        fetch(`/api/fotos-trabajos/${actual.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orden: otra.orden }),
        }),
        fetch(`/api/fotos-trabajos/${otra.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orden: actual.orden }),
        }),
      ])

      if (!resActual.ok || !resOtra.ok) {
        alert('No se pudo reordenar')
        return
      }

      const nuevas = [...fotos]
      nuevas[index] = { ...actual, orden: otra.orden }
      nuevas[otroIndex] = { ...otra, orden: actual.orden }
      nuevas.sort((a, b) => a.orden - b.orden)
      setFotos(nuevas)
    } finally {
      setMoviendoId(null)
    }
  }

  return (
    <div className="panel-fotos-trabajos">
      {servicios.length === 0 ? (
        <p className="panel-fotos-trabajos__vacio">
          No hay servicios reservables activos para asociar fotos todavía.
        </p>
      ) : (
        <div className="panel-fotos-trabajos__form-nuevo">
          <div className="panel-fotos-trabajos__campo-select">
            <select
              value={servicioNuevo}
              onChange={(e) => {
                setServicioNuevo(e.target.value)
                if (e.target.value) setErrorServicio(false)
              }}
              disabled={subiendo}
              className="panel-fotos-trabajos__select"
            >
              <option value="">Selecciona un servicio…</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.categoria ? `${s.categoria} · ${s.nombre}` : s.nombre}
                </option>
              ))}
            </select>
            {errorServicio && (
              <span className="panel-fotos-trabajos__error">Selecciona un servicio primero</span>
            )}
          </div>

          <input
            id="fotos-trabajos-input-archivo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={manejarSeleccionArchivo}
            className="panel-fotos-trabajos__input-archivo"
          />
          <label
            htmlFor="fotos-trabajos-input-archivo"
            onClick={manejarClickBoton}
            className={`panel-fotos-trabajos__btn-guardar ${
              subiendo ? 'panel-fotos-trabajos__btn-guardar--cargando' : ''
            }`}
          >
            {subiendo ? (
              <>
                <span className="panel-fotos-trabajos__spinner" aria-hidden="true" />
                Subiendo…
              </>
            ) : (
              '+ Agregar foto'
            )}
          </label>
        </div>
      )}

      {fotos.length === 0 ? (
        <p className="panel-fotos-trabajos__vacio">Todavía no hay fotos de trabajos.</p>
      ) : (
        <div className="panel-fotos-trabajos__grid">
          {fotos.map((foto, index) => (
            <div key={foto.id} className="panel-fotos-trabajos__tarjeta">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto.url}
                alt={foto.servicios?.nombre ?? 'Trabajo realizado'}
                className="panel-fotos-trabajos__imagen"
              />
              <span className="panel-fotos-trabajos__servicio">
                {foto.servicios?.nombre ?? 'Sin servicio'}
              </span>
              <div className="panel-fotos-trabajos__acciones">
                <button
                  type="button"
                  disabled={index === 0 || moviendoId !== null}
                  onClick={() => moverFoto(index, -1)}
                  className="panel-fotos-trabajos__btn-mover"
                  aria-label="Mover arriba"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === fotos.length - 1 || moviendoId !== null}
                  onClick={() => moverFoto(index, 1)}
                  className="panel-fotos-trabajos__btn-mover"
                  aria-label="Mover abajo"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={eliminandoId === foto.id}
                  onClick={() => eliminarFoto(foto.id)}
                  className="panel-fotos-trabajos__btn-eliminar"
                >
                  {eliminandoId === foto.id ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
