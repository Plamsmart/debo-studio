// Bloques del informe de ventas. Sin estado ni efectos: se pinta en el servidor.
import { ETIQUETA_METODO_PAGO, type MetodoPago } from '@/lib/metodos-pago'
import {
  etiquetaPeriodo,
  formatearEuros,
  formatearEurosConSigno,
  formatearPorcentajeConSigno,
  formatearRangoFechas,
  type AgrupacionVentas,
} from '@/lib/ventas'

// Tipos de las RPC (schema_ventas.sql). El generador de tipos de Supabase los
// marca todos como no nulos; aquí van como nulos los que el SQL sí puede
// devolver NULL (ticket medio sin cobros, % sin base, fila sin servicio).
type FilaIngresos = { periodo_inicio: string; total: number; num_cobros: number; ticket_medio: number | null }
type FilaServicio = {
  servicio_id: string | null
  servicio_nombre: string
  total: number
  num_ventas: number
  es_mas_vendido: boolean
  es_menos_vendido: boolean
}
type FilaMetodo = {
  metodo_pago: MetodoPago
  total: number
  num_cobros: number
  porcentaje_importe: number | null
  porcentaje_cobros: number | null
}
type Resumen = {
  actual_total: number
  actual_num_cobros: number
  actual_ticket_medio: number | null
  anterior_desde: string
  anterior_hasta: string
  anterior_total: number
  diferencia: number
  variacion_pct: number | null
}

export type DatosVentas = {
  ingresos: FilaIngresos[]
  ranking: FilaServicio[]
  metodos: FilaMetodo[]
  resumen: Resumen
}

type Props = {
  datos: DatosVentas
  agrupacion: AgrupacionVentas
}

export default function InformeVentas({ datos, agrupacion }: Props) {
  const { resumen } = datos
  const sinCobros = Number(resumen.actual_num_cobros) === 0

  return (
    <>
      <Tarjetas resumen={resumen} />
      {sinCobros ? (
        <p className="panel-ventas__vacio">No hay cobros confirmados en este periodo.</p>
      ) : (
        <>
          <GraficoIngresos filas={datos.ingresos} agrupacion={agrupacion} />
          <RankingServicios filas={datos.ranking} />
          <RepartoMetodos filas={datos.metodos} />
        </>
      )}
    </>
  )
}

function Tarjetas({ resumen }: { resumen: Resumen }) {
  const total = Number(resumen.actual_total)
  const ticket = resumen.actual_ticket_medio === null ? null : Number(resumen.actual_ticket_medio)
  const anterior = Number(resumen.anterior_total)
  const diferencia = Number(resumen.diferencia)
  // Sin base en el periodo anterior no hay comparación posible (ni 0 % ni infinito).
  const hayBase = anterior > 0 && resumen.variacion_pct !== null
  const tendencia = !hayBase || diferencia === 0 ? '' : diferencia > 0 ? ' panel-ventas__comparativa--sube' : ' panel-ventas__comparativa--baja'

  return (
    <section className="panel-ventas__tarjetas" aria-label="Resumen del periodo">
      <div className="panel-ventas__tarjeta">
        <span className="panel-ventas__tarjeta-titulo">Total cobrado</span>
        <strong className="panel-ventas__tarjeta-valor">{formatearEuros(total)}</strong>
      </div>
      <div className="panel-ventas__tarjeta">
        <span className="panel-ventas__tarjeta-titulo">Nº de cobros</span>
        <strong className="panel-ventas__tarjeta-valor">{Number(resumen.actual_num_cobros)}</strong>
      </div>
      <div className="panel-ventas__tarjeta">
        <span className="panel-ventas__tarjeta-titulo">Ticket medio</span>
        <strong className="panel-ventas__tarjeta-valor">{ticket === null ? '—' : formatearEuros(ticket)}</strong>
      </div>
      <div className={`panel-ventas__tarjeta panel-ventas__comparativa${tendencia}`}>
        <span className="panel-ventas__tarjeta-titulo">Frente al periodo anterior</span>
        {hayBase ? (
          <strong className="panel-ventas__tarjeta-valor">
            {formatearEurosConSigno(diferencia)}{' '}
            <span className="panel-ventas__tarjeta-pct">({formatearPorcentajeConSigno(Number(resumen.variacion_pct))})</span>
          </strong>
        ) : (
          <strong className="panel-ventas__tarjeta-valor panel-ventas__tarjeta-valor--suave">
            Sin datos del periodo anterior
          </strong>
        )}
        <span className="panel-ventas__tarjeta-detalle">
          {formatearRangoFechas(resumen.anterior_desde, resumen.anterior_hasta)}: {formatearEuros(anterior)}
        </span>
      </div>
    </section>
  )
}

// Barras con CSS (sin librería): altura = % sobre el periodo con más ingresos.
function GraficoIngresos({ filas, agrupacion }: { filas: FilaIngresos[]; agrupacion: AgrupacionVentas }) {
  const maximo = Math.max(...filas.map((f) => Number(f.total)), 0)
  // Con muchas barras solo se rotulan unas pocas para que no se pisen en el móvil.
  const cadaCuantas = Math.max(1, Math.ceil(filas.length / 6))

  return (
    <section className="panel-ventas__bloque">
      <h2>Ingresos por periodo</h2>
      <div className="panel-ventas__grafico" role="img" aria-label="Gráfico de barras de ingresos por periodo; los datos están en la tabla de abajo">
        {filas.map((fila, i) => {
          const total = Number(fila.total)
          const etiqueta = etiquetaPeriodo(fila.periodo_inicio, agrupacion)
          return (
            <div key={fila.periodo_inicio} className="panel-ventas__barra-col" title={`${etiqueta}: ${formatearEuros(total)}`}>
              <div
                className="panel-ventas__barra"
                style={{ height: maximo > 0 ? `${(total / maximo) * 100}%` : '0%' }}
              />
              <span className="panel-ventas__barra-etiqueta">
                {i % cadaCuantas === 0 || i === filas.length - 1 ? etiqueta : ''}
              </span>
            </div>
          )
        })}
      </div>
      <details className="panel-ventas__detalle">
        <summary>Ver tabla</summary>
        <table className="panel-ventas__tabla">
          <thead>
            <tr>
              <th scope="col">Periodo</th>
              <th scope="col">Total</th>
              <th scope="col">Cobros</th>
              <th scope="col">Ticket medio</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.periodo_inicio}>
                <td>{etiquetaPeriodo(fila.periodo_inicio, agrupacion)}</td>
                <td>{formatearEuros(Number(fila.total))}</td>
                <td>{Number(fila.num_cobros)}</td>
                <td>{fila.ticket_medio === null ? '—' : formatearEuros(Number(fila.ticket_medio))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}

function RankingServicios({ filas }: { filas: FilaServicio[] }) {
  const servicios = filas.filter((f) => f.servicio_id !== null)
  const sinServicio = filas.find((f) => f.servicio_id === null)
  const masVendidos = servicios.filter((f) => f.es_mas_vendido)
  // Si solo hay un servicio vendido es a la vez el más y el menos vendido: se muestra una vez.
  const menosVendidos = servicios.length > 1 ? servicios.filter((f) => f.es_menos_vendido) : []
  const maximo = Math.max(...servicios.map((f) => Number(f.num_ventas)), 0)

  return (
    <section className="panel-ventas__bloque">
      <h2>Servicios</h2>
      <div className="panel-ventas__destacados">
        {masVendidos.length > 0 && <Destacado titulo="Más vendido" filas={masVendidos} />}
        {menosVendidos.length > 0 && <Destacado titulo="Menos vendido" filas={menosVendidos} />}
      </div>

      {servicios.length > 0 && (
        <ol className="panel-ventas__lista">
          {servicios.map((fila) => (
            <li key={fila.servicio_id} className="panel-ventas__fila">
              <div className="panel-ventas__fila-texto">
                <span className="panel-ventas__fila-nombre">{fila.servicio_nombre}</span>
                <span className="panel-ventas__fila-cifras">
                  {Number(fila.num_ventas)} {Number(fila.num_ventas) === 1 ? 'venta' : 'ventas'} · {formatearEuros(Number(fila.total))}
                </span>
              </div>
              <div className="panel-ventas__fila-barra" style={{ width: `${maximo > 0 ? (Number(fila.num_ventas) / maximo) * 100 : 0}%` }} />
            </li>
          ))}
        </ol>
      )}

      {sinServicio && (
        <p className="panel-ventas__sin-servicio">
          Sin servicio asignado: {Number(sinServicio.num_ventas)}{' '}
          {Number(sinServicio.num_ventas) === 1 ? 'cobro' : 'cobros'} · {formatearEuros(Number(sinServicio.total))}
        </p>
      )}
    </section>
  )
}

function Destacado({ titulo, filas }: { titulo: string; filas: FilaServicio[] }) {
  return (
    <div className="panel-ventas__destacado">
      <span className="panel-ventas__tarjeta-titulo">{titulo}</span>
      {filas.map((fila) => (
        <span key={fila.servicio_id} className="panel-ventas__destacado-nombre">
          {fila.servicio_nombre}{' '}
          <span className="panel-ventas__fila-cifras">
            ({Number(fila.num_ventas)} · {formatearEuros(Number(fila.total))})
          </span>
        </span>
      ))}
    </div>
  )
}

function RepartoMetodos({ filas }: { filas: FilaMetodo[] }) {
  return (
    <section className="panel-ventas__bloque">
      <h2>Métodos de pago</h2>
      <ul className="panel-ventas__lista">
        {filas.map((fila) => {
          const porcentaje = fila.porcentaje_importe === null ? 0 : Number(fila.porcentaje_importe)
          return (
            <li key={fila.metodo_pago} className="panel-ventas__fila">
              <div className="panel-ventas__fila-texto">
                <span className="panel-ventas__fila-nombre">{ETIQUETA_METODO_PAGO[fila.metodo_pago] ?? fila.metodo_pago}</span>
                <span className="panel-ventas__fila-cifras">
                  {formatearEuros(Number(fila.total))} · {Number(fila.num_cobros)}{' '}
                  {Number(fila.num_cobros) === 1 ? 'cobro' : 'cobros'} ·{' '}
                  {new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(porcentaje)} %
                </span>
              </div>
              <div className="panel-ventas__fila-barra" style={{ width: `${porcentaje}%` }} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
