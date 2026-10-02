'use client'

import { useState } from 'react'
import type { Tables } from '@/lib/supabase/database.types'
import type { FotoExpediente, SesionExpediente } from '@/lib/expediente'

type Props = {
  clienteId: string
  expedienteInicial: Tables<'expedientes_clientes'> | null
  sesionesIniciales: SesionExpediente[]
}

type FormDatos = {
  tipo_piel: string
  alergias: string
  medicacion_actual: string
  embarazo_lactancia: string
  antecedentes: string
  contraindicaciones: string
  consentimiento_firmado: boolean
  consentimiento_fecha: string
}

type FormSesion = {
  fecha: string
  tratamiento: string
  zona: string
  producto: string
  notas: string
}

const MAXIMO_FOTOS_POR_SESION = 6
const TIPOS_FOTO_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp']
const TAMANO_MAXIMO_FOTO_BYTES = 5 * 1024 * 1024

const ETIQUETA_TIPO_FOTO: Record<string, string> = {
  antes: 'Antes',
  despues: 'Después',
}

function hoyISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function formatearFecha(fechaISO: string): string {
  // Fecha sin hora (YYYY-MM-DD): se construye en hora local para que no se
  // corra un día por la zona horaria.
  const [anio, mes, dia] = fechaISO.split('-').map(Number)
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function datosDesdeExpediente(e: Tables<'expedientes_clientes'> | null): FormDatos {
  return {
    tipo_piel: e?.tipo_piel ?? '',
    alergias: e?.alergias ?? '',
    medicacion_actual: e?.medicacion_actual ?? '',
    embarazo_lactancia: e?.embarazo_lactancia ?? '',
    antecedentes: e?.antecedentes ?? '',
    contraindicaciones: e?.contraindicaciones ?? '',
    consentimiento_firmado: e?.consentimiento_firmado ?? false,
    consentimiento_fecha: e?.consentimiento_fecha ?? '',
  }
}

function sesionVacia(): FormSesion {
  return { fecha: hoyISO(), tratamiento: '', zona: '', producto: '', notas: '' }
}

// Antes primero, después a continuación; dentro de cada grupo, orden de subida.
function ordenarFotos(fotos: FotoExpediente[]): FotoExpediente[] {
  return [...fotos].sort((a, b) =>
    a.tipo === b.tipo ? a.orden - b.orden : a.tipo === 'antes' ? -1 : 1
  )
}

export default function PanelExpediente({ clienteId, expedienteInicial, sesionesIniciales }: Props) {
  const [datos, setDatos] = useState<FormDatos>(datosDesdeExpediente(expedienteInicial))
  const [actualizadoEn, setActualizadoEn] = useState(expedienteInicial?.actualizado_en ?? null)
  const [guardandoDatos, setGuardandoDatos] = useState(false)
  const [hayCambios, setHayCambios] = useState(false)

  const [sesiones, setSesiones] = useState(sesionesIniciales)
  const [mostrandoNuevaSesion, setMostrandoNuevaSesion] = useState(false)
  const [formSesion, setFormSesion] = useState<FormSesion>(sesionVacia)
  const [guardandoSesion, setGuardandoSesion] = useState(false)

  const [subiendoEn, setSubiendoEn] = useState<string | null>(null)
  const [eliminandoFotoId, setEliminandoFotoId] = useState<string | null>(null)

  function cambiarDato<K extends keyof FormDatos>(campo: K, valor: FormDatos[K]) {
    setDatos((prev) => ({ ...prev, [campo]: valor }))
    setHayCambios(true)
  }

  async function guardarDatos(e: React.FormEvent) {
    e.preventDefault()
    setGuardandoDatos(true)
    try {
      const res = await fetch(`/api/clientes/${clienteId}/expediente`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...datos,
          consentimiento_fecha: datos.consentimiento_firmado ? datos.consentimiento_fecha : '',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo guardar el expediente')
        return
      }

      const { expediente } = await res.json()
      setDatos(datosDesdeExpediente(expediente))
      setActualizadoEn(expediente.actualizado_en)
      setHayCambios(false)
    } finally {
      setGuardandoDatos(false)
    }
  }

  async function crearSesion(e: React.FormEvent) {
    e.preventDefault()
    if (!formSesion.fecha) {
      alert('La fecha es obligatoria')
      return
    }

    setGuardandoSesion(true)
    try {
      const res = await fetch(`/api/clientes/${clienteId}/sesiones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formSesion),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo registrar la sesión')
        return
      }

      const { sesion } = await res.json()
      setSesiones((prev) =>
        [sesion, ...prev].sort(
          (a, b) => b.fecha.localeCompare(a.fecha) || b.creado_en.localeCompare(a.creado_en)
        )
      )
      setFormSesion(sesionVacia())
      setMostrandoNuevaSesion(false)
    } finally {
      setGuardandoSesion(false)
    }
  }

  // Un solo botón por tipo: abre el selector de archivos y sube al elegir
  // (bug #12 de AGENTS.md). Admite varias fotos a la vez hasta completar 6.
  async function subirFotos(sesion: SesionExpediente, tipo: string, e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (archivos.length === 0) return

    const libres = MAXIMO_FOTOS_POR_SESION - sesion.fotos.length
    if (archivos.length > libres) {
      alert(
        `Esta sesión admite ${libres} foto${libres === 1 ? '' : 's'} más (máximo ${MAXIMO_FOTOS_POR_SESION}).`
      )
      return
    }

    for (const archivo of archivos) {
      if (!TIPOS_FOTO_PERMITIDOS.includes(archivo.type)) {
        alert(`"${archivo.name}" no es JPG, PNG o WEBP`)
        return
      }
      if (archivo.size > TAMANO_MAXIMO_FOTO_BYTES) {
        alert(`"${archivo.name}" supera 5MB`)
        return
      }
    }

    setSubiendoEn(`${sesion.id}-${tipo}`)
    try {
      for (const archivo of archivos) {
        const formData = new FormData()
        formData.append('foto', archivo)
        formData.append('tipo', tipo)
        const res = await fetch(`/api/sesiones/${sesion.id}/fotos`, {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json()
          alert(data.error || 'No se pudo subir la foto')
          return
        }

        const { foto } = await res.json()
        setSesiones((prev) =>
          prev.map((s) => (s.id === sesion.id ? { ...s, fotos: [...s.fotos, foto] } : s))
        )
      }
    } finally {
      setSubiendoEn(null)
    }
  }

  async function eliminarFoto(sesionId: string, foto: FotoExpediente) {
    if (!confirm('¿Eliminar esta foto? Esta acción no se puede deshacer.')) return

    setEliminandoFotoId(foto.id)
    try {
      const res = await fetch(`/api/fotos-expediente/${foto.id}`, { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo eliminar la foto')
        return
      }

      setSesiones((prev) =>
        prev.map((s) =>
          s.id === sesionId ? { ...s, fotos: s.fotos.filter((f) => f.id !== foto.id) } : s
        )
      )
    } finally {
      setEliminandoFotoId(null)
    }
  }

  return (
    <div className="expediente">
      <section className="expediente__bloque">
        <h2 className="expediente__titulo">Datos generales</h2>
        <form className="expediente__datos" onSubmit={guardarDatos}>
          <label className="expediente__campo">
            <span>Tipo de piel</span>
            <input
              value={datos.tipo_piel}
              onChange={(e) => cambiarDato('tipo_piel', e.target.value)}
              className="expediente__input"
            />
          </label>

          <label className="expediente__campo">
            <span>Embarazo / lactancia</span>
            <select
              value={datos.embarazo_lactancia}
              onChange={(e) => cambiarDato('embarazo_lactancia', e.target.value)}
              className="expediente__input"
            >
              <option value="">Sin registrar</option>
              <option value="no">No</option>
              <option value="embarazo">Embarazo</option>
              <option value="lactancia">Lactancia</option>
            </select>
          </label>

          <label className="expediente__campo expediente__campo--ancho">
            <span>Alergias</span>
            <textarea
              value={datos.alergias}
              onChange={(e) => cambiarDato('alergias', e.target.value)}
              className="expediente__input"
              rows={2}
            />
          </label>

          <label className="expediente__campo expediente__campo--ancho">
            <span>Medicación actual</span>
            <textarea
              value={datos.medicacion_actual}
              onChange={(e) => cambiarDato('medicacion_actual', e.target.value)}
              className="expediente__input"
              rows={2}
            />
          </label>

          <label className="expediente__campo expediente__campo--ancho">
            <span>Antecedentes (cirugías o tratamientos estéticos previos)</span>
            <textarea
              value={datos.antecedentes}
              onChange={(e) => cambiarDato('antecedentes', e.target.value)}
              className="expediente__input"
              rows={2}
            />
          </label>

          <label className="expediente__campo expediente__campo--ancho">
            <span>Contraindicaciones</span>
            <textarea
              value={datos.contraindicaciones}
              onChange={(e) => cambiarDato('contraindicaciones', e.target.value)}
              className="expediente__input"
              rows={2}
            />
          </label>

          <div className="expediente__consentimiento">
            <label className="expediente__check">
              <input
                type="checkbox"
                checked={datos.consentimiento_firmado}
                onChange={(e) => cambiarDato('consentimiento_firmado', e.target.checked)}
              />
              Consentimiento informado firmado
            </label>
            {datos.consentimiento_firmado && (
              <label className="expediente__campo expediente__campo--inline">
                <span>Fecha</span>
                <input
                  type="date"
                  value={datos.consentimiento_fecha}
                  onChange={(e) => cambiarDato('consentimiento_fecha', e.target.value)}
                  className="expediente__input"
                />
              </label>
            )}
          </div>

          <div className="expediente__acciones">
            {actualizadoEn && (
              <span className="expediente__meta">
                Última actualización:{' '}
                {new Date(actualizadoEn).toLocaleString('es-ES', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            )}
            <button
              type="submit"
              disabled={guardandoDatos || !hayCambios}
              className="expediente__btn-primario"
            >
              {guardandoDatos ? 'Guardando…' : 'Guardar datos'}
            </button>
          </div>
        </form>
      </section>

      <section className="expediente__bloque">
        <div className="expediente__cabecera">
          <h2 className="expediente__titulo">Sesiones</h2>
          <button
            type="button"
            className="expediente__btn-secundario"
            onClick={() => setMostrandoNuevaSesion((v) => !v)}
          >
            {mostrandoNuevaSesion ? 'Cancelar' : '+ Registrar sesión'}
          </button>
        </div>

        {mostrandoNuevaSesion && (
          <form className="expediente__form-sesion" onSubmit={crearSesion}>
            <label className="expediente__campo">
              <span>Fecha *</span>
              <input
                type="date"
                required
                value={formSesion.fecha}
                onChange={(e) => setFormSesion({ ...formSesion, fecha: e.target.value })}
                className="expediente__input"
              />
            </label>
            <label className="expediente__campo">
              <span>Tratamiento</span>
              <input
                value={formSesion.tratamiento}
                onChange={(e) => setFormSesion({ ...formSesion, tratamiento: e.target.value })}
                className="expediente__input"
              />
            </label>
            <label className="expediente__campo">
              <span>Zona</span>
              <input
                value={formSesion.zona}
                onChange={(e) => setFormSesion({ ...formSesion, zona: e.target.value })}
                className="expediente__input"
              />
            </label>
            <label className="expediente__campo">
              <span>Producto</span>
              <input
                value={formSesion.producto}
                onChange={(e) => setFormSesion({ ...formSesion, producto: e.target.value })}
                className="expediente__input"
              />
            </label>
            <label className="expediente__campo expediente__campo--ancho">
              <span>Notas</span>
              <textarea
                value={formSesion.notas}
                onChange={(e) => setFormSesion({ ...formSesion, notas: e.target.value })}
                className="expediente__input"
                rows={3}
              />
            </label>
            <div className="expediente__acciones">
              <button type="submit" disabled={guardandoSesion} className="expediente__btn-primario">
                {guardandoSesion ? 'Guardando…' : 'Guardar sesión'}
              </button>
            </div>
          </form>
        )}

        {sesiones.length === 0 ? (
          <p className="expediente__vacio">Todavía no hay sesiones registradas.</p>
        ) : (
          <div className="expediente__sesiones">
            {sesiones.map((sesion) => {
              const completa = sesion.fotos.length >= MAXIMO_FOTOS_POR_SESION
              return (
                <article key={sesion.id} className="expediente__sesion">
                  <header className="expediente__sesion-cabecera">
                    <span className="expediente__sesion-fecha">{formatearFecha(sesion.fecha)}</span>
                    {sesion.tratamiento && (
                      <span className="expediente__sesion-tratamiento">{sesion.tratamiento}</span>
                    )}
                  </header>

                  <dl className="expediente__sesion-detalle">
                    {sesion.zona && (
                      <>
                        <dt>Zona</dt>
                        <dd>{sesion.zona}</dd>
                      </>
                    )}
                    {sesion.producto && (
                      <>
                        <dt>Producto</dt>
                        <dd>{sesion.producto}</dd>
                      </>
                    )}
                    {sesion.notas && (
                      <>
                        <dt>Notas</dt>
                        <dd className="expediente__sesion-notas">{sesion.notas}</dd>
                      </>
                    )}
                  </dl>

                  {sesion.fotos.length > 0 && (
                    <div className="expediente__fotos">
                      {ordenarFotos(sesion.fotos).map((foto) => (
                        <figure key={foto.id} className="expediente__foto">
                          {foto.signed_url ? (
                            <a href={foto.signed_url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={foto.signed_url} alt={ETIQUETA_TIPO_FOTO[foto.tipo]} />
                            </a>
                          ) : (
                            <div className="expediente__foto-error">No disponible</div>
                          )}
                          <span
                            className={`expediente__foto-badge expediente__foto-badge--${foto.tipo}`}
                          >
                            {ETIQUETA_TIPO_FOTO[foto.tipo] ?? foto.tipo}
                          </span>
                          <button
                            type="button"
                            className="expediente__foto-eliminar"
                            onClick={() => eliminarFoto(sesion.id, foto)}
                            disabled={eliminandoFotoId === foto.id}
                            aria-label="Eliminar foto"
                          >
                            {eliminandoFotoId === foto.id ? '…' : '×'}
                          </button>
                        </figure>
                      ))}
                    </div>
                  )}

                  <div className="expediente__subida">
                    <span className="expediente__meta">
                      {sesion.fotos.length}/{MAXIMO_FOTOS_POR_SESION} fotos
                    </span>
                    {!completa &&
                      (['antes', 'despues'] as const).map((tipo) => {
                        const inputId = `foto-${sesion.id}-${tipo}`
                        const subiendo = subiendoEn === `${sesion.id}-${tipo}`
                        return (
                          <span key={tipo}>
                            <input
                              id={inputId}
                              type="file"
                              multiple
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(e) => subirFotos(sesion, tipo, e)}
                              className="expediente__input-oculto"
                              disabled={subiendoEn !== null}
                            />
                            <label
                              htmlFor={inputId}
                              className={`expediente__btn-foto${subiendoEn !== null ? ' expediente__btn-foto--inactivo' : ''}`}
                            >
                              {subiendo ? 'Subiendo…' : `+ Foto ${ETIQUETA_TIPO_FOTO[tipo].toLowerCase()}`}
                            </label>
                          </span>
                        )
                      })}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
