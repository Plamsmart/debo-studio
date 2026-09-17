'use client'

import { useState } from 'react'
import type { Tables } from '@/lib/supabase/database.types'

type Resena = Tables<'resenas'> & { url: string | null }

type Props = {
  resenasIniciales: Resena[]
}

const ESTRELLAS = [1, 2, 3, 4, 5]
const TIPOS_FOTO_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp']
const TAMANO_MAXIMO_FOTO_BYTES = 5 * 1024 * 1024

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  const letras = partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '')
  return letras.join('') || '?'
}

function SelectorEstrellas({
  valor,
  onChange,
  disabled,
}: {
  valor: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)

  return (
    <div className="panel-resenas__selector-estrellas" role="radiogroup" aria-label="Calificación">
      {ESTRELLAS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={valor === n}
          aria-label={`${n} estrella${n === 1 ? '' : 's'}`}
          disabled={disabled}
          className={`panel-resenas__estrella-btn ${
            (hover ?? valor) >= n ? 'panel-resenas__estrella-btn--activa' : ''
          }`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function Estrellas({ calificacion }: { calificacion: number }) {
  return (
    <div className="panel-resenas__estrellas" aria-label={`${calificacion} de 5 estrellas`}>
      {ESTRELLAS.map((n) => (
        <span
          key={n}
          className={`panel-resenas__estrella ${
            n <= calificacion ? 'panel-resenas__estrella--activa' : ''
          }`}
          aria-hidden="true"
        >
          ★
        </span>
      ))}
    </div>
  )
}

function Avatar({ url, nombre, grande }: { url: string | null; nombre: string; grande?: boolean }) {
  return (
    <div className={`panel-resenas__avatar ${grande ? 'panel-resenas__avatar--grande' : ''}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={nombre} className="panel-resenas__avatar-img" />
      ) : (
        <span className="panel-resenas__avatar-iniciales">{nombre ? iniciales(nombre) : '?'}</span>
      )}
    </div>
  )
}

const FORM_VACIO = { nombre_clienta: '', texto: '', calificacion: 5 }

export default function PanelResenas({ resenasIniciales }: Props) {
  const [resenas, setResenas] = useState(resenasIniciales)
  const [form, setForm] = useState(FORM_VACIO)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [fotoNueva, setFotoNueva] = useState<File | null>(null)
  const [previewFotoNueva, setPreviewFotoNueva] = useState<string | null>(null)
  const [moviendoId, setMoviendoId] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  const resenaEnEdicion = editandoId ? resenas.find((r) => r.id === editandoId) ?? null : null
  const fotoPreviewUrl = editandoId ? resenaEnEdicion?.url ?? null : previewFotoNueva

  function limpiarFotoNueva() {
    setFotoNueva(null)
    setPreviewFotoNueva((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  function empezarEdicion(resena: Resena) {
    setEditandoId(resena.id)
    setForm({
      nombre_clienta: resena.nombre_clienta,
      texto: resena.texto,
      calificacion: resena.calificacion,
    })
    limpiarFotoNueva()
  }

  function cancelarEdicion() {
    setEditandoId(null)
    setForm(FORM_VACIO)
    limpiarFotoNueva()
  }

  async function manejarSeleccionFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return

    if (!TIPOS_FOTO_PERMITIDOS.includes(archivo.type)) {
      alert('La foto debe ser JPG, PNG o WEBP')
      return
    }
    if (archivo.size > TAMANO_MAXIMO_FOTO_BYTES) {
      alert('La foto no puede superar 5MB')
      return
    }

    if (!editandoId) {
      setFotoNueva(archivo)
      setPreviewFotoNueva((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(archivo)
      })
      return
    }

    setSubiendoFoto(true)
    try {
      const formData = new FormData()
      formData.append('foto', archivo)
      const res = await fetch(`/api/resenas/${editandoId}`, { method: 'PATCH', body: formData })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo subir la foto')
        return
      }

      const { resena } = await res.json()
      setResenas((prev) => prev.map((r) => (r.id === resena.id ? resena : r)))
    } finally {
      setSubiendoFoto(false)
    }
  }

  async function manejarSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre_clienta.trim() || !form.texto.trim()) {
      alert('Completa el nombre y el texto de la reseña')
      return
    }

    setGuardando(true)
    try {
      const formData = new FormData()
      formData.append('nombre_clienta', form.nombre_clienta)
      formData.append('texto', form.texto)
      formData.append('calificacion', String(form.calificacion))

      if (editandoId) {
        const res = await fetch(`/api/resenas/${editandoId}`, { method: 'PATCH', body: formData })

        if (!res.ok) {
          const data = await res.json()
          alert(data.error || 'No se pudo actualizar la reseña')
          return
        }

        const { resena } = await res.json()
        setResenas((prev) => prev.map((r) => (r.id === resena.id ? resena : r)))
      } else {
        if (fotoNueva) formData.append('foto', fotoNueva)

        const res = await fetch('/api/resenas', { method: 'POST', body: formData })

        if (!res.ok) {
          const data = await res.json()
          alert(data.error || 'No se pudo crear la reseña')
          return
        }

        const { resena } = await res.json()
        setResenas((prev) => [...prev, resena].sort((a, b) => a.orden - b.orden))
      }

      cancelarEdicion()
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarResena(id: string) {
    if (!confirm('¿Eliminar esta reseña? No se puede deshacer.')) return

    setEliminandoId(id)
    try {
      const res = await fetch(`/api/resenas/${id}`, { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo eliminar la reseña')
        return
      }

      setResenas((prev) => prev.filter((r) => r.id !== id))
      if (editandoId === id) cancelarEdicion()
    } finally {
      setEliminandoId(null)
    }
  }

  async function moverResena(index: number, direccion: -1 | 1) {
    const otroIndex = index + direccion
    if (otroIndex < 0 || otroIndex >= resenas.length) return

    const actual = resenas[index]
    const otra = resenas[otroIndex]

    setMoviendoId(actual.id)
    try {
      const formDataActual = new FormData()
      formDataActual.append('orden', String(otra.orden))
      const formDataOtra = new FormData()
      formDataOtra.append('orden', String(actual.orden))

      const [resActual, resOtra] = await Promise.all([
        fetch(`/api/resenas/${actual.id}`, { method: 'PATCH', body: formDataActual }),
        fetch(`/api/resenas/${otra.id}`, { method: 'PATCH', body: formDataOtra }),
      ])

      if (!resActual.ok || !resOtra.ok) {
        alert('No se pudo reordenar')
        return
      }

      const nuevas = [...resenas]
      nuevas[index] = { ...actual, orden: otra.orden }
      nuevas[otroIndex] = { ...otra, orden: actual.orden }
      nuevas.sort((a, b) => a.orden - b.orden)
      setResenas(nuevas)
    } finally {
      setMoviendoId(null)
    }
  }

  return (
    <div className="panel-resenas">
      <form className="panel-resenas__form" onSubmit={manejarSubmit}>
        <h2 className="panel-resenas__form-titulo">
          {editandoId ? 'Editar reseña' : 'Nueva reseña'}
        </h2>

        <div className="panel-resenas__campo">
          <label>Foto (opcional)</label>
          <div className="panel-resenas__avatar-picker">
            <Avatar url={fotoPreviewUrl} nombre={form.nombre_clienta} grande />
            <input
              id="resena-foto-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={manejarSeleccionFoto}
              disabled={guardando || subiendoFoto}
              className="panel-resenas__avatar-input"
            />
            <label htmlFor="resena-foto-input" className="panel-resenas__avatar-btn">
              {subiendoFoto ? 'Subiendo…' : fotoPreviewUrl ? 'Cambiar foto' : 'Agregar foto'}
            </label>
          </div>
        </div>

        <div className="panel-resenas__campo">
          <label htmlFor="resena-nombre">Nombre de la clienta</label>
          <input
            id="resena-nombre"
            type="text"
            value={form.nombre_clienta}
            onChange={(e) => setForm((f) => ({ ...f, nombre_clienta: e.target.value }))}
            disabled={guardando}
            className="panel-resenas__input"
          />
        </div>

        <div className="panel-resenas__campo">
          <label htmlFor="resena-texto">Texto</label>
          <textarea
            id="resena-texto"
            value={form.texto}
            onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))}
            disabled={guardando}
            className="panel-resenas__textarea"
            rows={3}
          />
        </div>

        <div className="panel-resenas__campo">
          <label>Calificación</label>
          <SelectorEstrellas
            valor={form.calificacion}
            onChange={(n) => setForm((f) => ({ ...f, calificacion: n }))}
            disabled={guardando}
          />
        </div>

        <div className="panel-resenas__form-acciones">
          <button type="submit" disabled={guardando} className="panel-resenas__btn-guardar">
            {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : '+ Agregar reseña'}
          </button>
          {editandoId && (
            <button
              type="button"
              onClick={cancelarEdicion}
              disabled={guardando}
              className="panel-resenas__btn-cancelar"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      {resenas.length === 0 ? (
        <p className="panel-resenas__vacio">Todavía no hay reseñas.</p>
      ) : (
        <div className="panel-resenas__lista">
          {resenas.map((resena, index) => (
            <div key={resena.id} className="panel-resenas__tarjeta">
              <Avatar url={resena.url} nombre={resena.nombre_clienta} />
              <div className="panel-resenas__tarjeta-contenido">
                <div className="panel-resenas__tarjeta-encabezado">
                  <span className="panel-resenas__nombre">{resena.nombre_clienta}</span>
                  <Estrellas calificacion={resena.calificacion} />
                </div>
                <p className="panel-resenas__texto">{resena.texto}</p>
              </div>
              <div className="panel-resenas__acciones">
                <button
                  type="button"
                  disabled={index === 0 || moviendoId !== null}
                  onClick={() => moverResena(index, -1)}
                  className="panel-resenas__btn-mover"
                  aria-label="Mover arriba"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === resenas.length - 1 || moviendoId !== null}
                  onClick={() => moverResena(index, 1)}
                  className="panel-resenas__btn-mover"
                  aria-label="Mover abajo"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => empezarEdicion(resena)}
                  className="panel-resenas__btn-editar"
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={eliminandoId === resena.id}
                  onClick={() => eliminarResena(resena.id)}
                  className="panel-resenas__btn-eliminar"
                >
                  {eliminandoId === resena.id ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
