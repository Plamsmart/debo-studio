// Filtros y formato del informe de ventas (/admin/ventas). Sin dependencias de
// servidor: lo usan la página (para validar y acotar lo que llega por la URL)
// y el selector de periodo (cliente). Los agregados los calculan las RPC
// ventas_* en Supabase (ver schema_ventas.sql); aquí solo se decide QUÉ rango
// pedir.
//
// Todas las fechas son 'YYYY-MM-DD' en hora de Madrid. Para operar con ellas se
// tratan como medianoche UTC, así sumar días o meses no depende de la zona del
// servidor ni de los cambios de hora.
import { HORARIO_NEGOCIO } from '@/lib/horario-negocio'

export const PERIODOS_VENTAS = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: 'semana', etiqueta: 'Esta semana' },
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: 'anio', etiqueta: 'Este año' },
  { valor: 'rango', etiqueta: 'Rango personalizado' },
] as const
export type PeriodoVentas = (typeof PERIODOS_VENTAS)[number]['valor']

export const AGRUPACIONES_VENTAS = [
  { valor: 'dia', etiqueta: 'Por día' },
  { valor: 'semana', etiqueta: 'Por semana' },
  { valor: 'mes', etiqueta: 'Por mes' },
  { valor: 'anio', etiqueta: 'Por año' },
] as const
export type AgrupacionVentas = (typeof AGRUPACIONES_VENTAS)[number]['valor']

export type FiltrosVentas = {
  periodo: PeriodoVentas
  desde: string
  hasta: string
  agrupacion: AgrupacionVentas
  anteriorDesde: string
  anteriorHasta: string
  avisos: string[]
}

// Rango personalizado: como mucho 5 años (las RPC aceptan 10, y el periodo
// anterior de comparación ocupa otros tantos días).
export const MAX_DIAS_RANGO = 5 * 366
// Más barras que esto no se leen en un móvil: se pasa a una agrupación mayor.
const MAX_DIAS_AGRUPANDO_POR_DIA = 93
const MAX_DIAS_AGRUPANDO_POR_SEMANA = 2 * 366

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

function aFecha(texto: string): Date {
  return new Date(`${texto}T00:00:00Z`)
}

function aTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

export function esFechaValida(texto: unknown): texto is string {
  if (typeof texto !== 'string' || !FORMATO_FECHA.test(texto)) return false
  const fecha = aFecha(texto)
  // '2026-13-01' da Invalid Date y '2026-02-30' se desborda al 2 de marzo: ambas fuera.
  return !Number.isNaN(fecha.getTime()) && aTexto(fecha) === texto
}

export function sumarDias(texto: string, dias: number): string {
  const fecha = aFecha(texto)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return aTexto(fecha)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000)
}

function lunesDe(texto: string): string {
  const diaSemana = aFecha(texto).getUTCDay() // 0 = domingo
  return sumarDias(texto, -((diaSemana + 6) % 7))
}

// Mismo día N meses antes; si ese mes es más corto, su último día (31 oct -> 30 sep).
function mismoDiaMesesAntes(texto: string, meses: number): string {
  const [anio, mes, dia] = texto.split('-').map(Number)
  const ultimoDiaDestino = new Date(Date.UTC(anio, mes - 1 - meses + 1, 0)).getUTCDate()
  return aTexto(new Date(Date.UTC(anio, mes - 1 - meses, Math.min(dia, ultimoDiaDestino))))
}

export function hoyEnMadrid(ahora: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HORARIO_NEGOCIO.zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

function primerValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}

function esPeriodo(valor: unknown): valor is PeriodoVentas {
  return PERIODOS_VENTAS.some((p) => p.valor === valor)
}

function esAgrupacion(valor: unknown): valor is AgrupacionVentas {
  return AGRUPACIONES_VENTAS.some((a) => a.valor === valor)
}

function agrupacionPorDefecto(dias: number): AgrupacionVentas {
  if (dias <= 31) return 'dia'
  if (dias <= 190) return 'semana'
  return 'mes'
}

// Convierte lo que llega por la URL en un rango seguro. Nada de la URL se usa
// sin validar: lo que no encaja se sustituye por el valor por defecto (este
// mes) con un aviso visible.
export function resolverFiltrosVentas(
  params: Record<string, string | string[] | undefined>,
  ahora: Date = new Date()
): FiltrosVentas {
  const avisos: string[] = []
  const hoy = hoyEnMadrid(ahora)
  const periodoPedido = primerValor(params.periodo)
  let periodo: PeriodoVentas = esPeriodo(periodoPedido) ? periodoPedido : 'mes'

  let desde = hoy
  let hasta = hoy
  let anteriorDesde: string
  let anteriorHasta: string

  if (periodo === 'rango') {
    const desdePedido = primerValor(params.desde)
    const hastaPedido = primerValor(params.hasta)
    if (!esFechaValida(desdePedido) || !esFechaValida(hastaPedido) || desdePedido > hastaPedido) {
      avisos.push('El rango elegido no es válido; se muestra este mes.')
      periodo = 'mes'
    } else {
      desde = desdePedido
      hasta = hastaPedido
      if (hasta > hoy) {
        hasta = hoy
        avisos.push('El rango se ha acotado hasta hoy.')
      }
      if (desde > hasta) {
        avisos.push('El rango elegido empieza en el futuro; se muestra hoy.')
        desde = hasta
      }
      if (diasEntre(desde, hasta) + 1 > MAX_DIAS_RANGO) {
        desde = sumarDias(hasta, -(MAX_DIAS_RANGO - 1))
        avisos.push('El rango máximo es de 5 años; se ha acortado.')
      }
    }
  }

  // Periodos "hasta hoy" y su mismo tramo en el periodo anterior, para que la
  // comparación sea justa (1-9 oct frente a 1-9 sep, no frente a septiembre entero).
  switch (periodo) {
    case 'hoy':
      anteriorDesde = anteriorHasta = sumarDias(hoy, -1)
      break
    case 'semana':
      desde = lunesDe(hoy)
      anteriorDesde = sumarDias(desde, -7)
      anteriorHasta = sumarDias(hoy, -7)
      break
    case 'mes':
      desde = `${hoy.slice(0, 8)}01`
      anteriorDesde = mismoDiaMesesAntes(desde, 1)
      anteriorHasta = mismoDiaMesesAntes(hoy, 1)
      break
    case 'anio':
      desde = `${hoy.slice(0, 4)}-01-01`
      anteriorDesde = mismoDiaMesesAntes(desde, 12)
      anteriorHasta = mismoDiaMesesAntes(hoy, 12)
      break
    case 'rango': {
      const dias = diasEntre(desde, hasta) + 1
      anteriorHasta = sumarDias(desde, -1)
      anteriorDesde = sumarDias(desde, -dias)
      break
    }
  }
  if (periodo !== 'rango') hasta = hoy

  const dias = diasEntre(desde, hasta) + 1
  const agrupacionPedida = primerValor(params.agrupacion)
  let agrupacion: AgrupacionVentas = esAgrupacion(agrupacionPedida)
    ? agrupacionPedida
    : periodo === 'anio'
      ? 'mes'
      : agrupacionPorDefecto(dias)

  if (agrupacion === 'dia' && dias > MAX_DIAS_AGRUPANDO_POR_DIA) {
    agrupacion = 'semana'
    avisos.push('Demasiados días para verlos uno a uno; se agrupa por semana.')
  }
  if (agrupacion === 'semana' && dias > MAX_DIAS_AGRUPANDO_POR_SEMANA) {
    agrupacion = 'mes'
    avisos.push('Demasiadas semanas para verlas una a una; se agrupa por mes.')
  }

  return { periodo, desde, hasta, agrupacion, anteriorDesde, anteriorHasta, avisos }
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const FORMATO_EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function formatearEuros(importe: number): string {
  return FORMATO_EUROS.format(importe)
}

export function formatearEurosConSigno(importe: number): string {
  return `${importe > 0 ? '+' : ''}${FORMATO_EUROS.format(importe)}`
}

export function formatearPorcentajeConSigno(porcentaje: number): string {
  const texto = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(porcentaje)
  return `${porcentaje > 0 ? '+' : ''}${texto} %`
}

// Las fechas se formatean en UTC porque ya son días de Madrid ('YYYY-MM-DD').
function formatear(texto: string, opciones: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', ...opciones }).format(aFecha(texto))
}

export function formatearFechaCorta(texto: string): string {
  return formatear(texto, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatearRangoFechas(desde: string, hasta: string): string {
  if (desde === hasta) return formatearFechaCorta(desde)
  return `${formatearFechaCorta(desde)} – ${formatearFechaCorta(hasta)}`
}

// Etiqueta de una barra del gráfico (periodo_inicio que devuelve la RPC).
export function etiquetaPeriodo(inicio: string, agrupacion: AgrupacionVentas): string {
  switch (agrupacion) {
    case 'dia':
      return formatear(inicio, { day: 'numeric', month: 'short' })
    case 'semana':
      return `Sem. ${formatear(inicio, { day: 'numeric', month: 'short' })}`
    case 'mes':
      return formatear(inicio, { month: 'short', year: 'numeric' })
    case 'anio':
      return inicio.slice(0, 4)
  }
}
