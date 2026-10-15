'use client'

import { useState } from 'react'
import { formatearEuros } from '@/lib/ventas'
import {
  asignarColores,
  calcularReparto,
  geometriaAnillo,
  type FilaReparto,
  type MetricaReparto,
  type Porcion,
} from '@/lib/reparto-servicios'

// Anillo en SVG propio (sin librería). viewBox de 200: radio 80 y grosor 30.
const RADIO = 80
const CIRCUNFERENCIA = 2 * Math.PI * RADIO

const FORMATO_PORCENTAJE = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })

function formatearPorcentaje(porcion: Porcion, total: number): string {
  // Una porción real que redondea a 0,0 % no se muestra como "0 %", ni su
  // vecina como "100 %" (se leería como si sumaran más de 100).
  if (porcion.decimas === 0 && porcion.valor > 0) return '< 0,1 %'
  if (porcion.decimas === 1000 && porcion.valor < total) return '> 99,9 %'
  return `${FORMATO_PORCENTAJE.format(porcion.decimas / 10)} %`
}

function formatearValor(valor: number, metrica: MetricaReparto): string {
  if (metrica === 'ingresos') return formatearEuros(valor)
  return `${valor} ${valor === 1 ? 'venta' : 'ventas'}`
}

function colorDe(porcion: Porcion, colores: Map<string, number>): string {
  if (porcion.tipo === 'sin_servicio') return 'var(--reparto-sin-servicio)'
  return `var(--reparto-${colores.get(porcion.clave) ?? 1})`
}

export default function GraficoRepartoServicios({ filas }: { filas: FilaReparto[] }) {
  const [metrica, setMetrica] = useState<MetricaReparto>('ingresos')
  const [activa, setActiva] = useState<string | null>(null)

  const { total, porciones } = calcularReparto(filas, metrica)
  const colores = asignarColores(calcularReparto(filas, 'ingresos').porciones, porciones)
  const arcos = geometriaAnillo(porciones.map((p) => p.valor), CIRCUNFERENCIA)
  const resaltada = porciones.find((p) => p.clave === activa) ?? null
  const textoMetrica = metrica === 'ingresos' ? 'ingresos' : 'número de ventas'

  function cambiarMetrica(nueva: MetricaReparto) {
    setMetrica(nueva)
    setActiva(null)
  }

  // Con ratón se resalta al pasar por encima; en táctil, al tocar (y se quita
  // tocando otra vez). Se mira pointerType para que el "mouseenter" que
  // emulan los móviles antes del click no lo active y desactive a la vez.
  const alEntrar = (clave: string) => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setActiva(clave)
  }
  const alSalir = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setActiva(null)
  }
  // Al tocar o con teclado (Intro/Espacio) se alterna; con ratón ya lo hace el hover.
  const alternar = (clave: string) => (e: React.MouseEvent) => {
    if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') return
    setActiva((actual) => (actual === clave ? null : clave))
  }

  return (
    <section className="panel-ventas__bloque">
      <h2>Reparto por servicio</h2>
      <div className="reparto__selector" role="group" aria-label="Medir el reparto por">
        <button type="button" aria-pressed={metrica === 'ingresos'} onClick={() => cambiarMetrica('ingresos')}>
          Por ingresos (€)
        </button>
        <button type="button" aria-pressed={metrica === 'ventas'} onClick={() => cambiarMetrica('ventas')}>
          Por nº de ventas
        </button>
      </div>

      {total <= 0 ? (
        <p className="panel-ventas__vacio">
          {metrica === 'ingresos' && filas.some((f) => Number(f.num_ventas) > 0)
            ? 'Los cobros de este periodo suman 0 €. Prueba «Por nº de ventas».'
            : 'No hay ventas por servicio en este periodo.'}
        </p>
      ) : (
        <div className="reparto">
          <div
            className="reparto__anillo"
            role="img"
            aria-label={`Gráfico de anillo del reparto por ${textoMetrica}: ${porciones
              .map((p) => `${p.nombre}, ${formatearPorcentaje(p, total)}`)
              .join('; ')}. Total: ${formatearValor(total, metrica)}. Detalle en la leyenda.`}
          >
            <svg viewBox="0 0 200 200" onPointerLeave={alSalir}>
              {porciones.map((p, i) => (
                <circle
                  key={p.clave}
                  className={`reparto__porcion${activa && activa !== p.clave ? ' reparto__porcion--atenuada' : ''}${activa === p.clave ? ' reparto__porcion--activa' : ''}`}
                  cx="100"
                  cy="100"
                  r={RADIO}
                  fill="none"
                  style={{ stroke: colorDe(p, colores) }}
                  strokeDasharray={`${arcos[i].largo} ${CIRCUNFERENCIA - arcos[i].largo}`}
                  strokeDashoffset={-arcos[i].inicio}
                  transform="rotate(-90 100 100)"
                  onPointerEnter={alEntrar(p.clave)}
                  onClick={alternar(p.clave)}
                />
              ))}
            </svg>
            <div className="reparto__centro">
              {resaltada ? (
                <>
                  <span className="reparto__centro-titulo">{resaltada.nombre}</span>
                  <strong className="reparto__centro-valor">{formatearValor(resaltada.valor, metrica)}</strong>
                  <span className="reparto__centro-titulo">{formatearPorcentaje(resaltada, total)}</span>
                </>
              ) : (
                <>
                  <span className="reparto__centro-titulo">Total</span>
                  <strong className="reparto__centro-valor">
                    {metrica === 'ingresos' ? formatearEuros(total) : total}
                  </strong>
                  {metrica === 'ventas' && <span className="reparto__centro-titulo">{total === 1 ? 'venta' : 'ventas'}</span>}
                </>
              )}
            </div>
          </div>

          <ul className="reparto__leyenda">
            {porciones.map((p) => (
              <li key={p.clave} className={activa === p.clave ? 'reparto__item reparto__item--activo' : 'reparto__item'}>
                <button
                  type="button"
                  className="reparto__item-boton"
                  aria-pressed={activa === p.clave}
                  onPointerEnter={alEntrar(p.clave)}
                  onPointerLeave={alSalir}
                  onClick={alternar(p.clave)}
                >
                  <span className="reparto__muestra" style={{ background: colorDe(p, colores) }} aria-hidden="true" />
                  <span className="reparto__item-nombre">{p.nombre}</span>
                  <span className="reparto__item-cifras">
                    {formatearValor(p.valor, metrica)} · {formatearPorcentaje(p, total)}
                  </span>
                </button>
                {p.tipo === 'otros' && (
                  <details className="reparto__otros">
                    <summary>Qué incluye</summary>
                    <ul>
                      {p.agrupados.map((s, i) => (
                        <li key={i}>
                          {s.nombre}: {formatearValor(s.valor, metrica)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
