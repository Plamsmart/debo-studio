// Flujo cita -> pago: PATCH /api/citas/[id], POST /api/cobros y el webhook de
// Stripe, con Supabase, Stripe, Resend y Google en memoria (sin red).
// Cubre: doble confirmación (secuencial y simultánea), precio 0, fallo de
// Stripe, insert de pagos fallido y webhook sin fila en pagos.
const path = require('path')
const crypto = require('crypto')

const state = { db: null, stripe: null, emails: [], eventos: [] }

global.__extraMocks = {
  '@/lib/supabase/server': () => ({
    createClient: async () => state.db.cliente,
    createServiceClient: () => state.db.cliente,
  }),
  '@/lib/stripe': () => ({
    stripe: {
      checkout: {
        sessions: {
          create: (p) => state.stripe.create(p),
          expire: (id) => state.stripe.expire(id),
        },
      },
      webhooks: { constructEvent: (body) => JSON.parse(body) },
    },
    SITE_URL: 'http://localhost',
  }),
  '@/lib/resend': () => ({
    getResend: () => ({ emails: { send: async (m) => { state.emails.push(m); return { data: {}, error: null } } } }),
    EMAIL_ESTUDIO: 'estudio@test',
  }),
  '@/lib/google-calendar': () => ({
    crearEventoCita: async (c) => { state.eventos.push(c); return `evt_${state.eventos.length}` },
    eliminarEventoCita: async () => {},
  }),
  './google-calendar': () => ({ obtenerEventosOcupadosGoogle: async () => [] }),
}
const { ROOT } = require('./harness.js')
const { NextRequest } = require(path.join(ROOT, 'node_modules/next/server'))
const load = (rel) => require(path.join(ROOT, rel))

// --- Supabase en memoria con lo que usan estas rutas (select/insert/update, eq/in, joins) ---
function crearDb() {
  const tablas = { usuarios_admin: [{ id: 'u1', rol: 'admin' }], clientes: [], servicios: [], citas: [], pagos: [] }
  const fallos = {} // p.ej. { insert_pagos: true, update_pagos: true }

  const conJoins = (fila) => ({
    ...fila,
    ...(fila.cliente_id !== undefined ? { clientes: tablas.clientes.find((c) => c.id === fila.cliente_id) ?? null } : {}),
    ...(fila.servicio_id !== undefined ? { servicios: tablas.servicios.find((s) => s.id === fila.servicio_id) ?? null } : {}),
  })

  function from(tabla) {
    const q = { op: 'select', filtros: [], valores: null, filas: null, sel: false, modo: null }
    async function ejecutar() {
      await new Promise((r) => setImmediate(r)) // deja intercalar peticiones simultáneas
      if (fallos[`${q.op}_${tabla}`]) return { data: null, error: { code: 'XX000', message: 'boom interno secreto' } }
      let filas
      if (q.op === 'insert') {
        filas = q.filas.map((f) => ({ id: crypto.randomUUID(), ...f }))
        tablas[tabla].push(...filas)
      } else {
        filas = tablas[tabla].filter((r) => q.filtros.every((f) => f(r)))
        if (q.op === 'update') filas.forEach((r) => Object.assign(r, q.valores))
      }
      if (q.op !== 'select' && !q.sel) return { data: null, error: null }
      const datos = filas.map(conJoins)
      if (q.modo === 'maybe') return { data: datos[0] ?? null, error: null }
      if (q.modo === 'single') return datos.length ? { data: datos[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
      return { data: datos, error: null }
    }
    const b = {
      select() { if (q.op === 'select') q.op = 'select'; else q.sel = true; return b },
      insert(f) { q.op = 'insert'; q.filas = Array.isArray(f) ? f : [f]; return b },
      update(v) { q.op = 'update'; q.valores = v; return b },
      eq(c, v) { q.filtros.push((r) => r[c] === v); return b },
      in(c, vs) { q.filtros.push((r) => vs.includes(r[c])); return b },
      maybeSingle() { q.modo = 'maybe'; return ejecutar() },
      single() { q.modo = 'single'; return ejecutar() },
      then(res, rej) { return ejecutar().then(res, rej) },
    }
    return b
  }

  const cliente = { from, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }
  return { cliente, tablas, fallos }
}

function crearStripe() {
  const s = { creadas: [], expiradas: [], fallarCreate: false, fallarExpire: false }
  s.create = async (p) => {
    if (s.fallarCreate) throw new Error('Stripe caído')
    const sesion = { id: `cs_${s.creadas.length + 1}`, url: `https://stripe.test/${s.creadas.length + 1}`, ...p }
    s.creadas.push(sesion)
    return sesion
  }
  s.expire = async (id) => { if (s.fallarExpire) throw new Error('no se pudo'); s.expiradas.push(id) }
  return s
}

// Escenario base: una cita pendiente de una clienta con email y servicio de 50 €.
function preparar({ precio = 50, email = 'ana@x.com', estado = 'pendiente' } = {}) {
  const db = crearDb()
  state.db = db; state.stripe = crearStripe(); state.emails = []; state.eventos = []
  const cliente = { id: 'cli1', nombre: 'Ana', email, telefono: '600' }
  const servicio = { id: 'srv1', nombre: 'Microblading', precio }
  const cita = { id: 'cita1', cliente_id: cliente.id, servicio_id: servicio.id, fecha: '2026-09-22', hora_inicio: '11:00:00', hora_fin: '12:00:00', estado, google_event_id: null }
  db.tablas.clientes.push(cliente); db.tablas.servicios.push(servicio); db.tablas.citas.push(cita)
  return { db, cita }
}

async function patchCita(accion, id = 'cita1') {
  const route = load('app/api/citas/[id]/route.ts')
  const r = await route.PATCH(
    new NextRequest(`http://localhost/api/citas/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion }) }),
    { params: Promise.resolve({ id }) }
  )
  return { status: r.status, body: await r.json() }
}

async function webhook(evento) {
  const route = load('app/api/stripe/webhook/route.ts')
  const r = await route.POST(new NextRequest('http://localhost/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=x' }, body: JSON.stringify(evento) }))
  return { status: r.status, body: await r.json() }
}

async function postCobro(body) {
  const route = load('app/api/cobros/route.ts')
  const r = await route.POST(new NextRequest('http://localhost/api/cobros', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  return { status: r.status, body: await r.json() }
}

// --- Runner mínimo (mismo formato que setup.js, sin sus mocks) ---
const resultados = []
async function test(nombre, fn) {
  const origErr = console.error, origWarn = console.warn
  const logs = []
  console.error = (...a) => logs.push(a.map(String).join(' ')); console.warn = () => {}
  try { await fn(logs); resultados.push([true, nombre]) }
  catch (e) { resultados.push([false, nombre, e.message]) }
  finally { console.error = origErr; console.warn = origWarn }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }
function igual(a, b, msg) { if (a !== b) throw new Error(`${msg ?? 'no coincide'}: esperado ${JSON.stringify(b)}, recibido ${JSON.stringify(a)}`) }

;(async () => {
  // ===== I2: confirmar/cancelar solo desde el estado correcto =====
  await test('confirmar una cita pendiente: 1 sesión, 1 pago, 1 email, 1 evento', async () => {
    const { db } = preparar()
    const r = await patchCita('confirmar')
    igual(r.status, 200, 'status')
    igual(db.tablas.citas[0].estado, 'confirmada', 'estado')
    igual(state.stripe.creadas.length, 1, 'sesiones'); igual(db.tablas.pagos.length, 1, 'pagos')
    igual(state.emails.length, 1, 'emails'); igual(state.eventos.length, 1, 'eventos')
    igual(db.tablas.citas[0].google_event_id, 'evt_1', 'google_event_id guardado')
    igual(state.stripe.creadas[0].metadata.cita_id, 'cita1', 'metadata.cita_id')
    igual(state.stripe.creadas[0].metadata.cliente_id, 'cli1', 'metadata.cliente_id')
  })

  await test('doble confirmación secuencial: la 2ª da 409 y no crea nada más', async () => {
    const { db } = preparar()
    await patchCita('confirmar')
    const r = await patchCita('confirmar')
    igual(r.status, 409, 'status 2ª'); igual(r.body.codigo, 'estado_invalido', 'codigo')
    assert(/confirmada/.test(r.body.error), 'el mensaje nombra el estado actual')
    igual(state.stripe.creadas.length, 1, 'sesiones'); igual(db.tablas.pagos.length, 1, 'pagos')
    igual(state.emails.length, 1, 'emails'); igual(state.eventos.length, 1, 'eventos')
  })

  await test('doble confirmación simultánea: una gana, la otra 409 y su sesión se expira', async () => {
    const { db } = preparar()
    const [a, b] = await Promise.all([patchCita('confirmar'), patchCita('confirmar')])
    igual([a.status, b.status].sort().join(), '200,409', 'statuses')
    igual(db.tablas.pagos.length, 1, 'pagos'); igual(state.emails.length, 1, 'emails'); igual(state.eventos.length, 1, 'eventos')
    const sobrante = state.stripe.creadas.map((s) => s.id).filter((id) => id !== db.tablas.pagos[0].stripe_session_id)
    igual(state.stripe.expiradas.join(), sobrante.join(), 'la sesión que no llegó a usarse queda expirada')
  })

  await test('confirmar una cita cancelada: 409, sigue cancelada', async () => {
    const { db } = preparar({ estado: 'cancelada' })
    const r = await patchCita('confirmar')
    igual(r.status, 409, 'status'); igual(db.tablas.citas[0].estado, 'cancelada', 'estado')
    igual(state.stripe.creadas.length, 0, 'sesiones')
  })

  await test('cancelar una cita confirmada: OK; cancelarla otra vez: 409', async () => {
    const { db } = preparar({ estado: 'confirmada' })
    igual((await patchCita('cancelar')).status, 200, 'primera')
    igual(db.tablas.citas[0].estado, 'cancelada', 'estado')
    const r = await patchCita('cancelar')
    igual(r.status, 409, 'segunda')
  })

  await test('cita inexistente: 404', async () => {
    preparar()
    igual((await patchCita('confirmar', 'no-existe')).status, 404, 'confirmar')
    igual((await patchCita('cancelar', 'no-existe')).status, 404, 'cancelar')
  })

  // ===== I3: precio y fallos de Stripe =====
  await test('precio 0: 422 con mensaje claro, la cita sigue pendiente y no se llama a Stripe', async () => {
    const { db } = preparar({ precio: 0 })
    const r = await patchCita('confirmar')
    igual(r.status, 422, 'status'); igual(r.body.codigo, 'precio_invalido', 'codigo')
    assert(/precio/.test(r.body.error), 'mensaje')
    igual(db.tablas.citas[0].estado, 'pendiente', 'estado'); igual(state.stripe.creadas.length, 0, 'sesiones')
  })

  await test('sin email: se confirma sin Stripe y con aviso (aunque el precio sea 0)', async () => {
    const { db } = preparar({ email: null, precio: 0 })
    const r = await patchCita('confirmar')
    igual(r.status, 200, 'status'); assert(r.body.aviso, 'aviso')
    igual(db.tablas.citas[0].estado, 'confirmada', 'estado'); igual(state.stripe.creadas.length, 0, 'sesiones')
  })

  await test('Stripe falla: 502 con mensaje, la cita sigue pendiente, sin pago ni email', async () => {
    const { db } = preparar()
    state.stripe.fallarCreate = true
    const r = await patchCita('confirmar')
    igual(r.status, 502, 'status'); assert(/pendiente/.test(r.body.error), 'mensaje')
    igual(db.tablas.citas[0].estado, 'pendiente', 'estado')
    igual(db.tablas.pagos.length, 0, 'pagos'); igual(state.emails.length, 0, 'emails')
  })

  await test('insert de pagos falla al confirmar: se registra con el id de sesión y la cita queda confirmada', async (logs) => {
    const { db } = preparar()
    db.fallos.insert_pagos = true
    const r = await patchCita('confirmar')
    igual(r.status, 200, 'status'); igual(db.tablas.citas[0].estado, 'confirmada', 'estado')
    assert(logs.some((l) => l.includes('cs_1')), 'console.error con el id de sesión')
  })

  // ===== I4: webhook =====
  const completado = (sesion) => ({ type: 'checkout.session.completed', data: { object: sesion } })

  await test('webhook con fila existente: la marca pagada y no crea otra', async () => {
    const { db } = preparar()
    await patchCita('confirmar')
    const r = await webhook(completado({ id: 'cs_1', payment_intent: 'pi_1', amount_total: 5000, metadata: state.stripe.creadas[0].metadata }))
    igual(r.status, 200, 'status'); igual(db.tablas.pagos.length, 1, 'pagos')
    igual(db.tablas.pagos[0].estado, 'pagado', 'estado'); igual(db.tablas.pagos[0].stripe_payment_intent_id, 'pi_1', 'payment_intent')
  })

  await test('webhook sin fila en pagos (cita): log + crea la fila desde la metadata', async (logs) => {
    const { db } = preparar()
    const r = await webhook(completado({ id: 'cs_huerfana', payment_intent: 'pi_9', amount_total: 5000, metadata: { tipo: 'cita', cita_id: 'cita1', cliente_id: 'cli1', servicio_id: 'srv1', concepto: 'Microblading' } }))
    igual(r.status, 200, 'status'); igual(db.tablas.pagos.length, 1, 'pagos')
    const p = db.tablas.pagos[0]
    igual(p.estado, 'pagado', 'estado'); igual(p.monto, 50, 'monto'); igual(p.cita_id, 'cita1', 'cita_id')
    igual(p.cliente_id, 'cli1', 'cliente_id'); igual(p.metodo_pago, 'web', 'metodo_pago'); igual(p.stripe_session_id, 'cs_huerfana', 'sesión')
    assert(logs.some((l) => l.includes('cs_huerfana')), 'console.error con el id de sesión')
  })

  await test('webhook sin fila, sesión antigua (solo cita_id): completa cliente/servicio desde la cita', async () => {
    const { db } = preparar()
    await webhook(completado({ id: 'cs_vieja', payment_intent: null, amount_total: 5000, metadata: { cita_id: 'cita1' } }))
    const p = db.tablas.pagos[0]
    igual(p.cliente_id, 'cli1', 'cliente_id'); igual(p.servicio_id, 'srv1', 'servicio_id'); igual(p.concepto, 'Microblading', 'concepto')
  })

  await test('webhook sin fila (cobro QR): crea la fila como qr_local', async () => {
    const { db } = preparar()
    await webhook(completado({ id: 'cs_qr', payment_intent: 'pi_2', amount_total: 1250, metadata: { tipo: 'cobro_local', concepto: 'Retoque', cliente_id: '', servicio_id: '' } }))
    const p = db.tablas.pagos[0]
    igual(p.metodo_pago, 'qr_local', 'metodo_pago'); igual(p.monto, 12.5, 'monto'); igual(p.cliente_id, null, 'sin cliente'); igual(p.concepto, 'Retoque', 'concepto')
  })

  await test('webhook: si tampoco se puede crear la fila, 500 para que Stripe reintente', async () => {
    const { db } = preparar()
    db.fallos.insert_pagos = true
    const r = await webhook(completado({ id: 'cs_x', amount_total: 5000, metadata: { cita_id: 'cita1' } }))
    igual(r.status, 500, 'status')
  })

  await test('webhook expired: marca fallido; si el update falla, 500', async () => {
    const { db } = preparar()
    await patchCita('confirmar')
    const ok = await webhook({ type: 'checkout.session.expired', data: { object: { id: 'cs_1' } } })
    igual(ok.status, 200, 'status'); igual(db.tablas.pagos[0].estado, 'fallido', 'estado')
    db.fallos.update_pagos = true
    igual((await webhook({ type: 'checkout.session.expired', data: { object: { id: 'cs_1' } } })).status, 500, 'status con error')
  })

  await test('webhook: el nombre de la clienta se escapa en el HTML del email', async () => {
    const { db } = preparar()
    db.tablas.clientes[0].nombre = '<a href="https://phish.test">Ana</a>'
    await webhook(completado({ id: 'cs_html', amount_total: 5000, metadata: { cita_id: 'cita1' } }))
    igual(state.emails.length, 1, 'emails')
    assert(!state.emails[0].html.includes('<a href'), 'no debe quedar HTML sin escapar')
    assert(state.emails[0].html.includes('&lt;a href=&quot;'), 'texto escapado')
  })

  // ===== Cobros QR =====
  await test('cobro QR: monto no numérico o por debajo de 0,50 € -> 400 sin llamar a Stripe', async () => {
    preparar()
    igual((await postCobro({ concepto: 'Retoque', monto: 'abc' })).status, 400, 'abc')
    igual((await postCobro({ concepto: 'Retoque', monto: 0.3 })).status, 400, '0.30')
    igual((await postCobro({ concepto: 'Retoque', monto: -5 })).status, 400, 'negativo')
    igual(state.stripe.creadas.length, 0, 'sesiones')
  })

  await test('cobro QR: Stripe falla -> 502 con mensaje, sin fila en pagos', async () => {
    const { db } = preparar()
    state.stripe.fallarCreate = true
    const r = await postCobro({ concepto: 'Retoque', monto: 20 })
    igual(r.status, 502, 'status'); assert(r.body.error, 'mensaje'); igual(db.tablas.pagos.length, 0, 'pagos')
  })

  await test('cobro QR: insert de pagos falla -> 500, log con la sesión y la sesión queda expirada', async (logs) => {
    const { db } = preparar()
    db.fallos.insert_pagos = true
    const r = await postCobro({ concepto: 'Retoque', monto: 20 })
    igual(r.status, 500, 'status'); igual(state.stripe.expiradas.join(), 'cs_1', 'expirada')
    assert(logs.some((l) => l.includes('cs_1')), 'console.error con el id de sesión')
  })

  await test('cobro QR válido: fila pendiente qr_local y metadata para el webhook', async () => {
    const { db } = preparar()
    const r = await postCobro({ concepto: 'Retoque', monto: '20' })
    igual(r.status, 200, 'status'); igual(db.tablas.pagos[0].monto, 20, 'monto numérico'); igual(db.tablas.pagos[0].metodo_pago, 'qr_local', 'metodo')
    igual(state.stripe.creadas[0].metadata.tipo, 'cobro_local', 'metadata.tipo')
  })

  for (const [ok, n, m] of resultados) console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${ok ? '' : '\n       -> ' + m}`)
  const fallos = resultados.filter((r) => !r[0]).length
  console.log(`\n${resultados.length - fallos}/${resultados.length} pruebas OK`)
  process.exitCode = fallos ? 1 : 0
})()
