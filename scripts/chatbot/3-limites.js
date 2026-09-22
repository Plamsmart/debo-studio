const S = require('./setup.js')
const { load, state, crearDb, crearOpenAI, crearResend, texto, test, assert, igual, resumen, SESSION, post, setNow } = S
const crypto = require('crypto')
const SAL = 'sal-de-prueba'
const { hashIp, inicioDeMesEnNegocio } = load('lib/chatbot/limites.ts')
const IP = '203.0.113.7'
const hIP = (ip = IP) => hashIp(ip, SAL)
const hace = (ms) => new Date(Date.now() - ms).toISOString()
const MIN = 60_000, H = 3_600_000

function fresco(guion = [texto('ok')]) {
  process.env.CHAT_IP_SALT = SAL
  delete process.env.CHAT_LIMITE_CONVERSACIONES_MES
  const db = crearDb(); state.db = db; state.resend = crearResend()
  state.openai = crearOpenAI(typeof guion === 'function' ? guion : guion.length ? [...guion, ...Array(50).fill(texto('ok'))] : [])
  return db
}
const conv = (db, o = {}) => { const c = { id: crypto.randomUUID(), session_id: crypto.randomUUID(), ip_hash: hIP('198.51.100.9'), creado_en: hace(MIN), ...o }; db.tablas.chat_conversaciones.push(c); return c }
const msgUser = (db, convId, o = {}) => db.tablas.chat_mensajes.push({ id: crypto.randomUUID(), conversacion_id: convId, rol: 'user', contenido: 'x', ip_hash: null, creado_en: hace(MIN), ...o })
// Simula un turno del asistente que ya creó una cita (o el registro de otra herramienta), tal
// como queda auditado en chat_mensajes.herramientas (ver conversaciones.ts / limites.ts).
const msgAsistente = (db, convId, herramientas, o = {}) => db.tablas.chat_mensajes.push({ id: crypto.randomUUID(), conversacion_id: convId, rol: 'assistant', contenido: 'ok', herramientas, creado_en: hace(MIN), ...o })
const citaCreada = (o = {}) => [{ nombre: 'crear_cita', argumentos: {}, resultado: { ok: true, estado: 'PENDIENTE de confirmar por el estudio', ...o } }]
const sinLlamadasAOpenAI = () => igual(state.openai.llamadas.length, 0, 'NO se llamó a OpenAI')
const bloqueado = async (r, status, codigo) => {
  igual(r.status, status, 'status'); const j = await r.json(); igual(j.codigo, codigo, 'codigo')
  assert(typeof j.error === 'string' && j.error.length > 15, 'mensaje legible para mostrar')
  return j
}

;(async () => {
  // ---------- Forma de la petición / longitud ----------
  await test('mensaje vacío, solo espacios, no-texto o ausente -> 400 mensaje_invalido (sin OpenAI)', async () => {
    fresco()
    for (const m of ['', '   \n ', 123, null, undefined, { a: 1 }]) {
      await bloqueado(await post({ mensaje: m, session_id: SESSION() }), 400, 'mensaje_invalido')
    }
    sinLlamadasAOpenAI()
  })

  await test('longitud: 501 caracteres -> 400 mensaje_largo; 500 exactos pasan', async () => {
    fresco()
    await bloqueado(await post({ mensaje: 'a'.repeat(501), session_id: SESSION() }), 400, 'mensaje_largo')
    sinLlamadasAOpenAI()
    igual((await post({ mensaje: 'a'.repeat(500), session_id: SESSION() })).status, 200, '500 caracteres')
    igual((await post({ mensaje: ' ' + 'a'.repeat(500) + ' ', session_id: SESSION() })).status, 200, 'se mide recortado')
  })

  await test('session_id ausente / no UUID / inyección -> 400 session_invalida', async () => {
    fresco()
    for (const s of [undefined, '', 'abc', 12345, "' or 1=1 --", '../../etc/passwd', crypto.randomUUID() + 'x']) {
      await bloqueado(await post({ mensaje: 'hola', session_id: s }), 400, 'session_invalida')
    }
    sinLlamadasAOpenAI()
  })

  await test('cuerpo que no es JSON -> 400; cuerpo demasiado grande -> 413', async () => {
    fresco()
    await bloqueado(await post(null, { raw: '{no json' }), 400, 'json_invalido')
    await bloqueado(await post({ mensaje: 'hola', session_id: SESSION() }, { headers: { 'content-length': '50000' } }), 413, 'peticion_grande')
    sinLlamadasAOpenAI()
  })

  await test('sin OPENAI_API_KEY o sin CHAT_IP_SALT -> 503 controlado (falla cerrado, sin filtrar nada)', async () => {
    fresco()
    state.openai = null
    let j = await bloqueado(await post({ mensaje: 'hola', session_id: SESSION() }), 503, 'chat_no_disponible')
    assert(j.error.includes('695 39 38 74'), 'ofrece contacto')
    fresco(); delete process.env.CHAT_IP_SALT
    await bloqueado(await post({ mensaje: 'hola', session_id: SESSION() }), 503, 'chat_no_disponible')
    sinLlamadasAOpenAI()
    igual(state.db.tablas.chat_conversaciones.length, 0, 'no se creó nada')
  })

  // ---------- Tope de mensajes por conversación ----------
  await test('30 mensajes por conversación: el 30º pasa y el 31º -> 429 limite_mensajes (sin OpenAI)', async () => {
    const db = fresco()
    const c = conv(db)
    for (let i = 0; i < 29; i++) msgUser(db, c.id)
    igual((await post({ mensaje: 'el 30', session_id: c.session_id })).status, 200, 'mensaje nº 30')
    state.openai.llamadas.length = 0
    const j = await bloqueado(await post({ mensaje: 'el 31', session_id: c.session_id }), 429, 'limite_mensajes')
    assert(j.error.includes('Reservar cita') && j.error.includes('695 39 38 74'), 'alternativa: web + contacto')
    sinLlamadasAOpenAI()
    igual(db.tablas.chat_mensajes.filter((m) => m.rol === 'user').length, 30, 'el 31º no se guardó')
  })

  await test('el tope de mensajes es por conversación: otra sesión sigue funcionando', async () => {
    const db = fresco()
    const c = conv(db)
    for (let i = 0; i < 30; i++) msgUser(db, c.id)
    await bloqueado(await post({ mensaje: 'x', session_id: c.session_id }), 429, 'limite_mensajes')
    igual((await post({ mensaje: 'hola', session_id: SESSION() })).status, 200)
  })

  // ---------- Tope de citas por conversación ----------
  await test('3 citas por conversación: la 4ª solicitud no llega a OpenAI y responde con 429 limite_citas', async () => {
    const db = fresco()
    const c = conv(db)
    for (let i = 0; i < 3; i++) msgAsistente(db, c.id, citaCreada())
    const j = await bloqueado(await post({ mensaje: 'Quiero reservar otra cita más', session_id: c.session_id }), 429, 'limite_citas')
    assert(j.error.includes('695 39 38 74'), 'deriva al contacto directo del estudio')
    sinLlamadasAOpenAI()
  })

  await test('con menos de 3 citas creadas, la conversación sigue funcionando con normalidad', async () => {
    const db = fresco()
    const c = conv(db)
    for (let i = 0; i < 2; i++) msgAsistente(db, c.id, citaCreada())
    igual((await post({ mensaje: 'una más', session_id: c.session_id })).status, 200, 'todavía por debajo del tope')
  })

  await test('el tope de citas es por conversación: otra sesión sigue funcionando', async () => {
    const db = fresco()
    const c = conv(db)
    for (let i = 0; i < 3; i++) msgAsistente(db, c.id, citaCreada())
    await bloqueado(await post({ mensaje: 'otra', session_id: c.session_id }), 429, 'limite_citas')
    igual((await post({ mensaje: 'hola', session_id: SESSION() })).status, 200, 'otra conversación no está topada')
  })

  await test('solo cuentan las citas CREADAS con éxito: turnos con tools fallidas o de otro tipo no topan', async () => {
    const db = fresco()
    const c = conv(db)
    msgAsistente(db, c.id, [{ nombre: 'crear_cita', argumentos: {}, resultado: { ok: false, codigo: 'choque' } }])
    msgAsistente(db, c.id, [{ nombre: 'consultar_disponibilidad', argumentos: {}, resultado: { ok: true, horarios_disponibles: [] } }])
    msgAsistente(db, c.id, null) // turno sin herramientas
    igual((await post({ mensaje: 'hola', session_id: c.session_id })).status, 200, 'nada de esto cuenta como cita creada')
  })

  // ---------- Rate limit por IP ----------
  await test('rate limit por IP: 20 mensajes en 10 min -> 429 rate_limit; los de hace 11 min no cuentan; otra IP no se ve afectada', async () => {
    const db = fresco()
    const otra = conv(db)
    for (let i = 0; i < 20; i++) msgUser(db, otra.id, { ip_hash: hIP(), creado_en: hace(2 * MIN) })
    await bloqueado(await post({ mensaje: 'hola', session_id: SESSION() }), 429, 'rate_limit')
    sinLlamadasAOpenAI()
    igual((await post({ mensaje: 'hola', session_id: SESSION() }, { ip: '192.0.2.55' })).status, 200, 'otra IP')

    const db2 = fresco()
    const c2 = conv(db2)
    for (let i = 0; i < 20; i++) msgUser(db2, c2.id, { ip_hash: hIP(), creado_en: hace(11 * MIN) })
    igual((await post({ mensaje: 'hola', session_id: SESSION() })).status, 200, 'ventana ya vencida')
  })

  await test('rate limit: 19 pasan y el 20º mensaje de la ventana ya bloquea (límite exacto = 20)', async () => {
    const db = fresco()
    const c = conv(db)
    for (let i = 0; i < 19; i++) msgUser(db, c.id, { ip_hash: hIP() })
    igual((await post({ mensaje: 'nº 20', session_id: SESSION() })).status, 200, 'se permite hasta 20')
    await bloqueado(await post({ mensaje: 'nº 21', session_id: SESSION() }), 429, 'rate_limit')
  })

  await test('IP nueva conversación: 5 en 24 h -> la 6ª sesión nueva 429 ip_conversaciones; las conversaciones existentes siguen; las de hace 25 h no cuentan', async () => {
    const db = fresco()
    const cs = Array.from({ length: 5 }, () => conv(db, { ip_hash: hIP(), creado_en: hace(2 * H) }))
    const j = await bloqueado(await post({ mensaje: 'hola', session_id: SESSION() }), 429, 'ip_conversaciones')
    assert(j.error.includes('Reservar cita'))
    sinLlamadasAOpenAI()
    igual((await post({ mensaje: 'sigo aquí', session_id: cs[0].session_id })).status, 200, 'conversación existente de esa IP')

    const db2 = fresco()
    for (let i = 0; i < 5; i++) conv(db2, { ip_hash: hIP(), creado_en: hace(25 * H) })
    igual((await post({ mensaje: 'hola', session_id: SESSION() })).status, 200, 'las de hace 25 h no cuentan')
  })

  // ---------- Límite mensual ----------
  await test('300/mes por defecto: con 299 abre la nº 300; con 300 -> 429 limite_conversaciones', async () => {
    const db = fresco()
    for (let i = 0; i < 299; i++) conv(db, { ip_hash: hIP('10.0.' + (i % 250) + '.' + (i % 200)) })
    igual((await post({ mensaje: 'la 300', session_id: SESSION() })).status, 200, 'la conversación nº 300')
    const j = await bloqueado(await post({ mensaje: 'la 301', session_id: SESSION() }, { ip: '192.0.2.99' }), 429, 'limite_conversaciones')
    assert(j.error.includes('Reservar cita') && j.error.includes('695 39 38 74'))
    igual(state.openai.llamadas.length, 1, 'solo la nº 300 llegó a OpenAI')
  })

  await test('CHAT_LIMITE_CONVERSACIONES_MES se respeta; una conversación ya abierta puede seguir tras alcanzar el tope', async () => {
    const db = fresco()
    process.env.CHAT_LIMITE_CONVERSACIONES_MES = '3'
    const abiertas = [conv(db), conv(db), conv(db)]
    await bloqueado(await post({ mensaje: 'hola', session_id: SESSION() }), 429, 'limite_conversaciones')
    igual((await post({ mensaje: 'sigo', session_id: abiertas[1].session_id })).status, 200, 'la ya abierta continúa')
  })

  await test('CHAT_LIMITE_CONVERSACIONES_MES=0 cierra el chat a conversaciones nuevas; valor inválido cae al defecto (300)', async () => {
    const db = fresco()
    process.env.CHAT_LIMITE_CONVERSACIONES_MES = '0'
    await bloqueado(await post({ mensaje: 'hola', session_id: SESSION() }), 429, 'limite_conversaciones')
    process.env.CHAT_LIMITE_CONVERSACIONES_MES = 'abc'
    igual((await post({ mensaje: 'hola', session_id: SESSION() })).status, 200, 'inválido -> defecto 300')
    process.env.CHAT_LIMITE_CONVERSACIONES_MES = '-5'
    igual((await post({ mensaje: 'hola', session_id: SESSION() }, { ip: '192.0.2.1' })).status, 200, 'negativo -> defecto')
  })

  await test('el límite mensual cuenta el MES en hora de Madrid (borde 31 ago 21:59Z fuera / 22:01Z dentro)', async () => {
    const db = fresco()
    process.env.CHAT_LIMITE_CONVERSACIONES_MES = '2'
    conv(db, { creado_en: '2026-08-31T21:59:00.000Z' }) // 23:59 del 31 ago en Madrid: mes anterior
    conv(db, { creado_en: '2026-08-15T10:00:00.000Z' })
    igual((await post({ mensaje: 'hola', session_id: SESSION() })).status, 200, 'las de agosto no cuentan')
    conv(db, { creado_en: '2026-08-31T22:01:00.000Z' }) // 00:01 del 1 sep en Madrid: este mes
    await bloqueado(await post({ mensaje: 'hola', session_id: SESSION() }, { ip: '192.0.2.2' }), 429, 'limite_conversaciones')
  })

  await test('inicioDeMesEnNegocio: verano, invierno, cambios de hora y bordes', async () => {
    const t = (iso) => inicioDeMesEnNegocio(new Date(iso)).toISOString()
    igual(t('2026-09-21T08:00:00Z'), '2026-08-31T22:00:00.000Z', 'septiembre (CEST +2)')
    igual(t('2026-12-15T12:00:00Z'), '2026-11-30T23:00:00.000Z', 'diciembre (CET +1)')
    igual(t('2026-08-31T22:30:00Z'), '2026-08-31T22:00:00.000Z', '00:30 del 1 sep en Madrid ya es septiembre')
    igual(t('2026-08-31T21:30:00Z'), '2026-07-31T22:00:00.000Z', '23:30 del 31 ago en Madrid aún es agosto')
    igual(t('2026-03-15T12:00:00Z'), '2026-02-28T23:00:00.000Z', 'marzo (empieza en CET)')
    igual(t('2026-04-10T12:00:00Z'), '2026-03-31T22:00:00.000Z', 'abril (tras el cambio a CEST)')
    igual(t('2026-11-05T12:00:00Z'), '2026-10-31T23:00:00.000Z', 'noviembre (tras volver a CET)')
    igual(t('2027-01-01T00:30:00Z'), '2026-12-31T23:00:00.000Z', '1 ene 01:30 en Madrid: cambia de año')
  })

  // ---------- Privacidad de la IP ----------
  await test('la IP nunca se guarda en claro: solo SHA-256 con sal; primera entrada de X-Forwarded-For', async () => {
    const db = fresco()
    await post({ mensaje: 'hola', session_id: SESSION() }, { ip: '203.0.113.50, 70.41.3.18, 150.172.238.178' })
    const h = db.tablas.chat_conversaciones[0].ip_hash
    assert(/^[0-9a-f]{64}$/.test(h), 'hash SHA-256 hex')
    igual(h, hIP('203.0.113.50'), 'se usó la primera IP de X-Forwarded-For')
    const volcado = JSON.stringify(db.tablas)
    assert(!volcado.includes('203.0.113.50') && !volcado.includes('70.41.3.18'), 'ninguna IP en claro en ninguna tabla')
    igual(db.tablas.chat_mensajes[0].ip_hash, h, 'el mensaje lleva el mismo hash (para el rate limit)')
    assert(hashIp('1.2.3.4', 'sal-A') !== hashIp('1.2.3.4', 'sal-B'), 'con otra sal el hash cambia')
    igual(hashIp('1.2.3.4', 'sal-A'), hashIp('1.2.3.4', 'sal-A'), 'determinista')
  })

  await test('sin cabeceras de IP: cae en un cajón común (y aun así se limita)', async () => {
    const db = fresco()
    const r = await post({ mensaje: 'hola', session_id: SESSION() }, { ip: '' })
    igual(r.status, 200)
    igual(db.tablas.chat_conversaciones[0].ip_hash, hashIp('desconocida', SAL))
  })

  // ---------- Robustez de los límites ----------
  await test('carrera: dos peticiones simultáneas de una sesión nueva -> una sola conversación, ambas responden (UNIQUE 23505)', async () => {
    const db = fresco()
    const s = SESSION()
    const [a, b] = await Promise.all([post({ mensaje: 'uno', session_id: s }), post({ mensaje: 'dos', session_id: s })])
    igual(a.status, 200); igual(b.status, 200)
    igual(db.tablas.chat_conversaciones.length, 1, 'una sola conversación')
    igual(db.tablas.chat_mensajes.filter((m) => m.rol === 'user').length, 2)
  })

  await test('session_id en mayúsculas y minúsculas es la misma conversación', async () => {
    const db = fresco()
    const s = SESSION()
    await post({ mensaje: 'a', session_id: s })
    await post({ mensaje: 'b', session_id: s.toUpperCase() })
    igual(db.tablas.chat_conversaciones.length, 1)
  })

  await test('FALLA CERRADO: si no se pueden contar mensajes/conversaciones -> 502 y NO se llama a OpenAI', async () => {
    let db = fresco()
    db.fallos.count_chat_mensajes = true
    await bloqueado(await post({ mensaje: 'hola', session_id: SESSION() }), 502, 'chat_error')
    sinLlamadasAOpenAI()
    db = fresco()
    db.fallos.count_chat_conversaciones = true
    await bloqueado(await post({ mensaje: 'hola', session_id: SESSION() }), 502, 'chat_error')
    sinLlamadasAOpenAI()
    igual(db.tablas.chat_conversaciones.length, 0)
  })

  await test('un mensaje bloqueado por límites no consume nada: no se guarda ni cuenta', async () => {
    const db = fresco()
    const c = conv(db)
    for (let i = 0; i < 30; i++) msgUser(db, c.id)
    const antes = db.tablas.chat_mensajes.length
    await post({ mensaje: 'bloqueado', session_id: c.session_id })
    igual(db.tablas.chat_mensajes.length, antes, 'sin filas nuevas')
  })

  resumen()
})()
