// Reparto por servicio para el gráfico de anillo de /admin/ventas. Funciones
// puras sobre las filas de la RPC ventas_ranking_servicios (sin red ni BD):
// agrupan en "Otros", calculan porcentajes que suman 100 y la geometría del
// anillo. Las usa components/GraficoRepartoServicios.tsx.

export type MetricaReparto = 'ingresos' | 'ventas'

export type FilaReparto = {
  servicio_id: string | null
  servicio_nombre: string
  total: number
  num_ventas: number
}

export type Porcion = {
  clave: string // servicio_id, 'otros' o 'sin_servicio'
  nombre: string
  tipo: 'servicio' | 'otros' | 'sin_servicio'
  valor: number
  // Porcentaje en décimas (0-1000) para que la suma sea exacta: 1000 = 100 %.
  decimas: number
  // Solo en "Otros": qué servicios incluye, de mayor a menor.
  agrupados: { nombre: string; valor: number }[]
}

export type Reparto = { total: number; porciones: Porcion[] }

// Porciones como mucho, contando "Otros" y "Sin servicio asignado".
export const MAX_PORCIONES = 6

const redondearCentimos = (x: number) => Math.round(x * 100) / 100

function valorDe(fila: FilaReparto, metrica: MetricaReparto): number {
  const valor = Number(metrica === 'ingresos' ? fila.total : fila.num_ventas)
  return Number.isFinite(valor) && valor > 0 ? valor : 0
}

// Método del resto mayor: cada porción recibe sus décimas enteras y las que
// faltan para llegar a 1000 van a los restos más grandes. Así la suma es
// siempre 100,0 % y el redondeo no deja huecos ni se pasa.
export function repartirDecimas(valores: number[]): number[] {
  const total = valores.reduce((a, b) => a + b, 0)
  if (total <= 0) return valores.map(() => 0)
  const exactas = valores.map((v) => (v / total) * 1000)
  const decimas = exactas.map(Math.floor)
  let faltan = 1000 - decimas.reduce((a, b) => a + b, 0)
  const porResto = exactas
    .map((x, i) => ({ i, resto: x - Math.floor(x) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i)
  for (const { i } of porResto) {
    if (faltan <= 0) break
    decimas[i]++
    faltan--
  }
  return decimas
}

export function calcularReparto(filas: FilaReparto[], metrica: MetricaReparto, maxPorciones = MAX_PORCIONES): Reparto {
  const servicios = filas
    .filter((f) => f.servicio_id !== null)
    .map((f) => ({ clave: f.servicio_id as string, nombre: f.servicio_nombre, valor: valorDe(f, metrica) }))
    .filter((s) => s.valor > 0)
    .sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre, 'es'))
  const sinServicio = filas
    .filter((f) => f.servicio_id === null)
    .reduce((suma, f) => suma + valorDe(f, metrica), 0)

  const huecos = maxPorciones - (sinServicio > 0 ? 1 : 0)
  const visibles = servicios.length <= huecos ? servicios : servicios.slice(0, huecos - 1)
  const agrupados = servicios.slice(visibles.length)

  const base: Omit<Porcion, 'decimas'>[] = visibles.map((s) => ({ ...s, tipo: 'servicio', agrupados: [] }))
  if (agrupados.length > 0) {
    base.push({
      clave: 'otros',
      nombre: `Otros (${agrupados.length} servicios)`,
      tipo: 'otros',
      valor: redondearCentimos(agrupados.reduce((a, s) => a + s.valor, 0)),
      agrupados: agrupados.map(({ nombre, valor }) => ({ nombre, valor })),
    })
  }
  if (sinServicio > 0) {
    base.push({ clave: 'sin_servicio', nombre: 'Sin servicio asignado', tipo: 'sin_servicio', valor: redondearCentimos(sinServicio), agrupados: [] })
  }

  const decimas = repartirDecimas(base.map((p) => p.valor))
  return {
    total: redondearCentimos(base.reduce((a, p) => a + p.valor, 0)),
    porciones: base.map((p, i) => ({ ...p, decimas: decimas[i] })),
  }
}

// Color de cada servicio (índice de --reparto-N, 1-6). Se decide sobre el
// reparto por ingresos y se conserva al cambiar a nº de ventas, para que un
// servicio no cambie de color al alternar. "Otros" usa siempre el 6, así que
// si está presente los servicios solo pueden usar del 1 al 5.
export const COLORES_SERVICIO = 6

export function asignarColores(referencia: Porcion[], actual: Porcion[]): Map<string, number> {
  const previos = new Map<string, number>()
  referencia.filter((p) => p.tipo === 'servicio').forEach((p, i) => previos.set(p.clave, i + 1))

  const hayOtros = actual.some((p) => p.tipo === 'otros')
  const permitidos = hayOtros ? COLORES_SERVICIO - 1 : COLORES_SERVICIO
  const colores = new Map<string, number>()
  const usados = new Set<number>()
  const servicios = actual.filter((p) => p.tipo === 'servicio')
  for (const p of servicios) {
    const previo = previos.get(p.clave)
    if (previo !== undefined && previo <= permitidos && !usados.has(previo)) {
      colores.set(p.clave, previo)
      usados.add(previo)
    }
  }
  for (const p of servicios) {
    if (colores.has(p.clave)) continue
    let libre = 1
    while (usados.has(libre)) libre++
    colores.set(p.clave, libre)
    usados.add(libre)
  }
  if (hayOtros) colores.set('otros', COLORES_SERVICIO)
  return colores
}

export type Arco = { inicio: number; largo: number }

// Tramos del anillo sobre una circunferencia de largo `circunferencia`.
// Cada porción deja un `hueco` al final para separarla de la siguiente, y
// ninguna se dibuja más corta que `minimo` (una de 0,1 % seguiría viéndose
// y no se montaría con la vecina); lo que se les da de más sale
// proporcionalmente de las grandes. Con una sola porción, anillo completo.
export function geometriaAnillo(valores: number[], circunferencia: number, hueco = 2, minimo = 2): Arco[] {
  const total = valores.reduce((a, b) => a + b, 0)
  if (valores.length === 0 || total <= 0) return []
  if (valores.length === 1) return [{ inicio: 0, largo: circunferencia }]

  const tramoMinimo = minimo + hueco
  const tramos = valores.map((v) => (v / total) * circunferencia)
  const fijos = new Set<number>()
  // Cada vuelta puede empujar a otra porción por debajo del mínimo: se repite
  // hasta que ninguna nueva quede por debajo (como mucho una vuelta por porción).
  for (let vuelta = 0; vuelta < valores.length; vuelta++) {
    const pequenas = tramos.map((t, i) => i).filter((i) => !fijos.has(i) && tramos[i] < tramoMinimo)
    if (pequenas.length === 0) break
    pequenas.forEach((i) => fijos.add(i))
    const libres = tramos.map((t, i) => i).filter((i) => !fijos.has(i))
    const disponible = circunferencia - fijos.size * tramoMinimo
    const sumaLibres = libres.reduce((a, i) => a + valores[i], 0)
    tramos.forEach((t, i) => {
      tramos[i] = fijos.has(i) ? tramoMinimo : (valores[i] / sumaLibres) * disponible
    })
  }

  let inicio = 0
  return tramos.map((t) => {
    const arco = { inicio, largo: t - hueco }
    inicio += t
    return arco
  })
}
