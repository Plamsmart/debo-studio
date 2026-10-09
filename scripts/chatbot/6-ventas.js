// Filtros del informe de ventas (lib/ventas.ts): qué rango se pide a las RPC
// según la URL y la fecha de hoy en Madrid. Sin red ni base de datos.
const estado = { rol: 'admin', usuario: { id: 'u1' }, rpcs: [], errorRpc: null, service: 0 }
global.__extraMocks = {
  '@/lib/supabase/server': () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: estado.usuario } }) },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: estado.rol ? { rol: estado.rol } : null, error: null }) }) }),
      }),
      rpc: async (nombre, args) => {
        estado.rpcs.push([nombre, args])
        if (estado.errorRpc === nombre) return { data: null, error: { code: 'XX000', message: 'boom' } }
        if (nombre === 'ventas_comparativa') return { data: [{ actual_total: 0, actual_num_cobros: 0, actual_ticket_medio: null, anterior_desde: args.p_anterior_desde, anterior_hasta: args.p_anterior_hasta, anterior_total: 0, diferencia: 0, variacion_pct: null }], error: null }
        return { data: [], error: null }
      },
    }),
    createServiceClient: () => { estado.service++; throw new Error('service_role no debe usarse en /admin/ventas') },
  }),
  'next/navigation': () => ({
    redirect: (url) => { const e = new Error(`REDIRECT:${url}`); e.redirect = url; throw e },
    useRouter: () => ({}),
  }),
  '@/components/PanelVentas.css': () => ({}),
}
require('./harness.js')
const path = require('path')
const { ROOT } = require('./harness.js')
const v = require(path.join(ROOT, 'lib/ventas.ts'))

const resultados = []
function test(nombre, fn) {
  try { fn(); resultados.push([true, nombre]) } catch (e) { resultados.push([false, nombre, e.message]) }
}
// Intl usa espacios duros (U+00A0/U+202F) antes de € y %: se normalizan para comparar.
const norm = (x) => (typeof x === 'string' ? x.replace(/[\u00a0\u202f]/g, ' ') : x)
function igual(a, b, msg) { a = norm(a); if (a !== b) throw new Error(`${msg ?? 'no coincide'}: esperado ${JSON.stringify(b)}, recibido ${JSON.stringify(a)}`) }
function assert(c, msg) { if (!c) throw new Error(msg) }
const f = (params, ahora) => v.resolverFiltrosVentas(params, new Date(ahora))
const rango = (r) => `${r.desde}..${r.hasta} vs ${r.anteriorDesde}..${r.anteriorHasta} [${r.agrupacion}]`

// Viernes 9 oct 2026, 12:00 en Madrid (UTC+2)
const AHORA = '2026-10-09T10:00:00Z'

test('hoy en Madrid, no en UTC (22:30 UTC del 9 = 00:30 del 10 en Madrid)', () => {
  igual(v.hoyEnMadrid(new Date('2026-10-09T22:30:00Z')), '2026-10-10', 'verano')
  igual(v.hoyEnMadrid(new Date('2026-12-31T23:30:00Z')), '2027-01-01', 'invierno')
  igual(f({ periodo: 'hoy' }, '2026-10-09T22:30:00Z').desde, '2026-10-10', 'periodo hoy')
})

test('por defecto (sin parámetros o basura): este mes, por día', () => {
  igual(rango(f({}, AHORA)), '2026-10-01..2026-10-09 vs 2026-09-01..2026-09-09 [dia]')
  igual(rango(f({ periodo: 'nada', agrupacion: 'hora' }, AHORA)), '2026-10-01..2026-10-09 vs 2026-09-01..2026-09-09 [dia]')
})

test('hoy: compara con ayer', () => igual(rango(f({ periodo: 'hoy' }, AHORA)), '2026-10-09..2026-10-09 vs 2026-10-08..2026-10-08 [dia]'))

test('semana: de lunes a hoy, frente al mismo tramo de la semana anterior', () => {
  igual(rango(f({ periodo: 'semana' }, AHORA)), '2026-10-05..2026-10-09 vs 2026-09-28..2026-10-02 [dia]')
  // domingo 11/10: la semana sigue empezando el lunes 5
  igual(f({ periodo: 'semana' }, '2026-10-11T10:00:00Z').desde, '2026-10-05', 'domingo')
  // lunes 12/10: empieza semana nueva
  igual(f({ periodo: 'semana' }, '2026-10-12T10:00:00Z').desde, '2026-10-12', 'lunes')
})

test('mes: el mismo día del mes anterior se acota a su último día', () => {
  igual(rango(f({ periodo: 'mes' }, '2026-10-31T10:00:00Z')), '2026-10-01..2026-10-31 vs 2026-09-01..2026-09-30 [dia]')
  igual(rango(f({ periodo: 'mes' }, '2027-03-31T10:00:00Z')), '2027-03-01..2027-03-31 vs 2027-02-01..2027-02-28 [dia]')
})

test('año: por mes, frente al mismo tramo del año anterior (29/2 -> 28/2)', () => {
  igual(rango(f({ periodo: 'anio' }, AHORA)), '2026-01-01..2026-10-09 vs 2025-01-01..2025-10-09 [mes]')
  igual(f({ periodo: 'anio' }, '2028-02-29T10:00:00Z').anteriorHasta, '2027-02-28', 'bisiesto')
})

test('agrupación elegida se respeta si cabe', () => {
  igual(f({ periodo: 'mes', agrupacion: 'semana' }, AHORA).agrupacion, 'semana')
  igual(f({ periodo: 'anio', agrupacion: 'semana' }, AHORA).agrupacion, 'semana')
})

test('demasiadas barras: día -> semana -> mes, con aviso', () => {
  const r = f({ periodo: 'anio', agrupacion: 'dia' }, AHORA)
  igual(r.agrupacion, 'semana', 'año por día'); assert(r.avisos.length === 1, 'aviso')
  igual(f({ periodo: 'rango', desde: '2023-01-01', hasta: '2026-10-09', agrupacion: 'semana' }, AHORA).agrupacion, 'mes', '3 años por semana')
})

test('rango válido: periodo anterior de la misma duración justo antes', () => {
  igual(rango(f({ periodo: 'rango', desde: '2026-09-10', hasta: '2026-09-19' }, AHORA)), '2026-09-10..2026-09-19 vs 2026-08-31..2026-09-09 [dia]')
})

test('rango inválido (formato, fecha imposible, invertido, ausente) -> este mes con aviso', () => {
  for (const p of [
    { desde: '2026-13-01', hasta: '2026-10-01' },
    { desde: '2026-02-30', hasta: '2026-03-01' },
    { desde: '2026-10-05', hasta: '2026-10-01' },
    { desde: "2026-10-01' or 1=1", hasta: '2026-10-05' },
    { desde: '2026-10-01' },
  ]) {
    const r = f({ periodo: 'rango', ...p }, AHORA)
    igual(r.periodo, 'mes', JSON.stringify(p)); igual(r.desde, '2026-10-01', 'desde'); assert(r.avisos.length > 0, 'aviso')
  }
})

test('rango hacia el futuro se acota a hoy; entero en el futuro -> hoy', () => {
  igual(f({ periodo: 'rango', desde: '2026-10-01', hasta: '2027-01-01' }, AHORA).hasta, '2026-10-09', 'acotado')
  const r = f({ periodo: 'rango', desde: '2027-01-01', hasta: '2027-02-01' }, AHORA)
  igual(`${r.desde}..${r.hasta}`, '2026-10-09..2026-10-09', 'futuro')
})

test('rango de más de 5 años se acorta (y el anterior cabe en el límite de 10 años de las RPC)', () => {
  const r = f({ periodo: 'rango', desde: '2000-01-01', hasta: '2026-10-09' }, AHORA)
  igual(v.diasEntre(r.desde, r.hasta) + 1, v.MAX_DIAS_RANGO, 'días'); assert(r.avisos.length > 0, 'aviso')
  assert(v.diasEntre(r.anteriorDesde, r.anteriorHasta) <= 3660, 'anterior dentro del límite SQL')
})

test('parámetros repetidos en la URL: se usa el primero', () => {
  igual(f({ periodo: ['hoy', 'anio'] }, AHORA).periodo, 'hoy')
})

test('formato: euros, signos y etiquetas en español', () => {
  igual(v.formatearEurosConSigno(165), '+165,00 €'); igual(v.formatearEurosConSigno(-5.5), '-5,50 €')
  igual(v.formatearPorcentajeConSigno(412.5), '+412,5 %')
  igual(v.etiquetaPeriodo('2026-10-05', 'semana'), 'Sem. 5 oct')
  igual(v.etiquetaPeriodo('2026-10-01', 'anio'), '2026')
  igual(v.formatearRangoFechas('2026-10-01', '2026-10-09'), '1 oct 2026 – 9 oct 2026')
})

// --- Página /admin/ventas: protección en servidor y llamadas a las RPC ---
async function abrirPagina(params = {}) {
  estado.rpcs = []
  const { default: Pagina } = require(path.join(ROOT, 'app/admin/ventas/page.tsx'))
  try { return { arbol: await Pagina({ searchParams: Promise.resolve(params) }) } }
  catch (e) { if (e.redirect) return { redirect: e.redirect }; throw e }
}
function buscar(nodo, pred) {
  if (!nodo || typeof nodo !== 'object') return null
  if (Array.isArray(nodo)) { for (const n of nodo) { const r = buscar(n, pred); if (r) return r } return null }
  if (pred(nodo)) return nodo
  return buscar(nodo.props?.children, pred)
}
const pruebasAsync = [
  ['página: staff -> redirect a /admin/citas sin llamar a ninguna RPC', async () => {
    estado.rol = 'staff'
    const r = await abrirPagina()
    igual(r.redirect, '/admin/citas', 'redirect'); igual(estado.rpcs.length, 0, 'rpcs')
  }],
  ['página: usuaria sin fila en usuarios_admin -> redirect; sin sesión -> /login', async () => {
    estado.rol = null
    igual((await abrirPagina()).redirect, '/admin/citas', 'sin rol')
    estado.usuario = null
    igual((await abrirPagina()).redirect, '/login', 'sin sesión')
    estado.usuario = { id: 'u1' }
  }],
  ['página: admin -> las 4 RPC con la sesión y el rango validado (nunca service_role)', async () => {
    estado.rol = 'admin'
    const r = await abrirPagina({ periodo: 'rango', desde: '2026-09-10', hasta: '2026-09-19', agrupacion: 'semana' })
    igual(r.redirect, undefined, 'sin redirect')
    igual(estado.rpcs.map((x) => x[0]).sort().join(), 'ventas_comparativa,ventas_ingresos_por_periodo,ventas_por_metodo,ventas_ranking_servicios', 'rpcs')
    const ingresos = estado.rpcs.find((x) => x[0] === 'ventas_ingresos_por_periodo')[1]
    igual(JSON.stringify(ingresos), '{"p_desde":"2026-09-10","p_hasta":"2026-09-19","p_agrupacion":"semana"}', 'args')
    const comp = estado.rpcs.find((x) => x[0] === 'ventas_comparativa')[1]
    igual(`${comp.p_anterior_desde}..${comp.p_anterior_hasta}`, '2026-08-31..2026-09-09', 'periodo anterior')
    igual(estado.service, 0, 'service_role')
    assert(buscar(r.arbol, (n) => n.props && 'datos' in n.props), 'pinta el informe')
  }],
  ['página: basura en la URL no llega a las RPC', async () => {
    estado.rol = 'admin'
    await abrirPagina({ periodo: 'rango', desde: "1' or 1=1", hasta: '2026-10-01', agrupacion: 'x' })
    for (const [, args] of estado.rpcs) for (const v of Object.values(args)) assert(/^(\d{4}-\d{2}-\d{2}|dia|semana|mes|anio)$/.test(v), `valor raro: ${v}`)
  }],
  ['página: si falla una RPC -> mensaje de error (y log), sin informe', async () => {
    estado.rol = 'admin'; estado.errorRpc = 'ventas_por_metodo'
    const logs = []; const orig = console.error; console.error = (...a) => logs.push(a)
    try {
      const r = await abrirPagina()
      assert(buscar(r.arbol, (n) => n.props?.role === 'alert'), 'mensaje de error')
      assert(!buscar(r.arbol, (n) => n.props && 'datos' in n.props), 'sin informe')
      assert(logs.length > 0, 'console.error')
    } finally { console.error = orig; estado.errorRpc = null }
  }],
  ['informe: comparativa con y sin base, vacío, etiquetas de método y "Sin servicio" aparte', async () => {
    const { renderToStaticMarkup } = require(path.join(ROOT, 'node_modules/react-dom/server'))
    const React = require(path.join(ROOT, 'node_modules/react'))
    const { default: InformeVentas } = require(path.join(ROOT, 'components/InformeVentas.tsx'))
    const html = (datos) => norm(renderToStaticMarkup(React.createElement(InformeVentas, { datos, agrupacion: 'dia' })))
    const resumen = { actual_total: 205, actual_num_cobros: 5, actual_ticket_medio: 41, anterior_desde: '2026-09-01', anterior_hasta: '2026-09-09', anterior_total: 40, diferencia: 165, variacion_pct: 412.5 }
    const datos = {
      resumen,
      ingresos: [{ periodo_inicio: '2026-10-01', total: 205, num_cobros: 5, ticket_medio: 41 }],
      ranking: [
        { servicio_id: 's1', servicio_nombre: 'Microblading', total: 170, num_ventas: 3, es_mas_vendido: true, es_menos_vendido: false },
        { servicio_id: 's2', servicio_nombre: 'Lifting', total: 30, num_ventas: 1, es_mas_vendido: false, es_menos_vendido: true },
        { servicio_id: null, servicio_nombre: 'Sin servicio asignado', total: 5, num_ventas: 1, es_mas_vendido: false, es_menos_vendido: false },
      ],
      metodos: [
        { metodo_pago: 'qr_local', total: 20, num_cobros: 1, porcentaje_importe: 9.8, porcentaje_cobros: 20 },
        { metodo_pago: 'tarjeta_datafono', total: 30, num_cobros: 1, porcentaje_importe: 14.6, porcentaje_cobros: 20 },
      ],
    }
    let h = html(datos)
    assert(h.includes('+165,00 €') && h.includes('+412,5 %'), 'comparativa con base')
    assert(h.includes('QR en el local') && h.includes('Tarjeta (datáfono)'), 'etiquetas de método')
    assert(h.includes('Más vendido') && h.includes('Menos vendido'), 'destacados')
    assert(h.includes('Sin servicio asignado: 1 cobro'), 'sin servicio aparte')
    assert(!/<li[^>]*>.{0,200}Sin servicio asignado/.test(h), 'sin servicio fuera del ranking')
    h = html({ ...datos, resumen: { ...resumen, anterior_total: 0, diferencia: 205, variacion_pct: null } })
    assert(h.includes('Sin datos del periodo anterior') && !h.includes('Infinity') && !h.includes('+0 %'), 'sin base')
    h = html({ ingresos: [], ranking: [], metodos: [], resumen: { ...resumen, actual_total: 0, actual_num_cobros: 0, actual_ticket_medio: null, diferencia: -40, variacion_pct: -100 } })
    assert(h.includes('No hay cobros confirmados en este periodo') && h.includes('—'), 'vacío')
    assert(h.includes('-40,00 €') && h.includes('-100 %'), 'bajada al 0')
  }],
]

;(async () => {
for (const [nombre, fn] of pruebasAsync) {
  try { await fn(); resultados.push([true, nombre]) } catch (e) { resultados.push([false, nombre, e.message]) }
}
for (const [ok, n, m] of resultados) console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${ok ? '' : '\n       -> ' + m}`)
const fallos = resultados.filter((r) => !r[0]).length
console.log(`\n${resultados.length - fallos}/${resultados.length} pruebas OK`)
process.exitCode = fallos ? 1 : 0
})()
