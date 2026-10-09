'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AGRUPACIONES_VENTAS,
  PERIODOS_VENTAS,
  formatearRangoFechas,
  type AgrupacionVentas,
  type FiltrosVentas,
  type PeriodoVentas,
} from '@/lib/ventas'

type Props = {
  filtros: FiltrosVentas
  children: React.ReactNode
}

// Selector de periodo/agrupación + contenedor del informe. El informe lo pinta
// el servidor; aquí solo se cambia la URL y se atenúa mientras llega el nuevo.
// La URL solo lleva preferencias: el servidor las valida y acota, y las RPC
// exigen rol 'admin' igualmente.
export default function PanelVentas({ filtros, children }: Props) {
  const router = useRouter()
  const [cargando, startTransition] = useTransition()
  const [periodo, setPeriodo] = useState<PeriodoVentas>(filtros.periodo)
  const [desde, setDesde] = useState(filtros.desde)
  const [hasta, setHasta] = useState(filtros.hasta)

  function navegar(cambios: { periodo?: PeriodoVentas; agrupacion?: AgrupacionVentas; desde?: string; hasta?: string }) {
    const nuevoPeriodo = cambios.periodo ?? filtros.periodo
    const params = new URLSearchParams({ periodo: nuevoPeriodo })
    // Al cambiar de periodo, el servidor elige la agrupación que mejor encaja.
    if (cambios.agrupacion) params.set('agrupacion', cambios.agrupacion)
    else if (!cambios.periodo) params.set('agrupacion', filtros.agrupacion)
    if (nuevoPeriodo === 'rango') {
      params.set('desde', cambios.desde ?? filtros.desde)
      params.set('hasta', cambios.hasta ?? filtros.hasta)
    }
    startTransition(() => router.push(`/admin/ventas?${params}`))
  }

  function elegirPeriodo(valor: PeriodoVentas) {
    setPeriodo(valor)
    // El rango personalizado espera a que se pulse "Aplicar".
    if (valor !== 'rango') navegar({ periodo: valor })
  }

  function aplicarRango(e: React.FormEvent) {
    e.preventDefault()
    navegar({ periodo: 'rango', desde, hasta })
  }

  return (
    <>
      <form className="panel-ventas__filtros" onSubmit={aplicarRango}>
        <label className="panel-ventas__campo">
          <span>Periodo</span>
          <select value={periodo} onChange={(e) => elegirPeriodo(e.target.value as PeriodoVentas)} disabled={cargando}>
            {PERIODOS_VENTAS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label className="panel-ventas__campo">
          <span>Agrupar</span>
          <select
            value={filtros.agrupacion}
            onChange={(e) => navegar({ agrupacion: e.target.value as AgrupacionVentas })}
            disabled={cargando || periodo !== filtros.periodo}
          >
            {AGRUPACIONES_VENTAS.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.etiqueta}
              </option>
            ))}
          </select>
        </label>

        {periodo === 'rango' && (
          <div className="panel-ventas__rango">
            <label className="panel-ventas__campo">
              <span>Desde</span>
              <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} required />
            </label>
            <label className="panel-ventas__campo">
              <span>Hasta</span>
              <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} required />
            </label>
            <button type="submit" className="panel-ventas__aplicar" disabled={cargando || !desde || !hasta}>
              Aplicar
            </button>
          </div>
        )}
      </form>

      <p className="panel-ventas__rango-actual">
        {formatearRangoFechas(filtros.desde, filtros.hasta)}
        {cargando && <span className="panel-ventas__cargando"> · Actualizando…</span>}
      </p>
      {filtros.avisos.map((aviso) => (
        <p key={aviso} className="panel-ventas__aviso">
          {aviso}
        </p>
      ))}

      <div className={cargando ? 'panel-ventas__resultados panel-ventas__resultados--cargando' : 'panel-ventas__resultados'} aria-busy={cargando}>
        {children}
      </div>
    </>
  )
}
