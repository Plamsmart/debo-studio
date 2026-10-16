// useChatSession: el id de sesión (debo-chat-session-id) se crea en
// localStorage solo al enviar el primer mensaje, nunca al montar el widget,
// y se reutiliza si ya existía. Sin navegador: React y window se simulan.

// React mínimo para ejecutar el hook fuera de un render: una sola "pasada",
// los setState se ignoran (aquí solo importa el session_id).
global.__extraMocks = {
  react: () => ({
    useState: (inicial) => [typeof inicial === 'function' ? inicial() : inicial, () => {}],
    useRef: (valor) => ({ current: valor }),
    useCallback: (fn) => fn,
  }),
}
require('./harness.js')
const { useChatSession, CLAVE_SESSION_ID } = require('../../components/useChatSession.ts')

function crearAlmacen({ bloqueado = false } = {}) {
  const datos = new Map()
  const escrituras = []
  const fallar = () => { throw new Error('SecurityError: almacenamiento bloqueado') }
  return {
    datos,
    escrituras,
    getItem: (k) => (bloqueado ? fallar() : datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => (bloqueado ? fallar() : (escrituras.push(k), datos.set(k, String(v)))),
  }
}

let peticiones = []
global.fetch = async (url, opciones) => {
  peticiones.push(JSON.parse(opciones.body))
  return { ok: true, json: async () => ({ respuesta: 'Hola' }) }
}

function preparar(opciones) {
  const almacen = crearAlmacen(opciones)
  global.window = { localStorage: almacen }
  peticiones = []
  return almacen
}

const resultados = []
async function test(nombre, fn) {
  try { await fn(); resultados.push(true); console.log('OK  ', nombre) }
  catch (e) { resultados.push(false); console.log('FAIL', nombre, '\n       ->', e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }
function igual(a, b, msg) { if (a !== b) throw new Error(`${msg}: esperado ${JSON.stringify(b)}, recibido ${JSON.stringify(a)}`) }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

;(async () => {
  await test('montar el widget no escribe nada en localStorage', async () => {
    const almacen = preparar()
    useChatSession()
    igual(almacen.escrituras.length, 0, 'escrituras al montar')
    igual(almacen.datos.size, 0, 'claves guardadas')
  })

  await test('el primer mensaje crea el id, lo guarda y lo envía a /api/chat', async () => {
    const almacen = preparar()
    await useChatSession().enviarMensaje('Hola')
    const id = almacen.datos.get(CLAVE_SESSION_ID)
    assert(UUID.test(id ?? ''), `id guardado no es un UUID: ${id}`)
    igual(peticiones[0].session_id, id, 'session_id enviado')
  })

  await test('los mensajes siguientes reutilizan el mismo id sin volver a escribir', async () => {
    const almacen = preparar()
    const chat = useChatSession()
    await chat.enviarMensaje('Hola')
    await chat.enviarMensaje('¿Tenéis hueco el martes?')
    igual(almacen.escrituras.length, 1, 'escrituras')
    igual(peticiones[1].session_id, peticiones[0].session_id, 'mismo session_id')
  })

  await test('si ya existía un id (recarga o visita posterior), se reutiliza', async () => {
    const almacen = preparar()
    const previo = '11111111-2222-4333-8444-555555555555'
    almacen.datos.set(CLAVE_SESSION_ID, previo)
    await useChatSession().enviarMensaje('He vuelto')
    igual(peticiones[0].session_id, previo, 'session_id enviado')
    igual(almacen.escrituras.length, 0, 'escrituras')
  })

  await test('un mensaje vacío no crea el id', async () => {
    const almacen = preparar()
    await useChatSession().enviarMensaje('   ')
    igual(almacen.datos.size, 0, 'claves guardadas')
    igual(peticiones.length, 0, 'peticiones')
  })

  await test('con el almacenamiento bloqueado el chat funciona y mantiene el id en memoria', async () => {
    preparar({ bloqueado: true })
    const chat = useChatSession()
    await chat.enviarMensaje('Hola')
    await chat.enviarMensaje('Otra pregunta')
    assert(UUID.test(peticiones[0].session_id), 'session_id válido')
    igual(peticiones[1].session_id, peticiones[0].session_id, 'mismo session_id en la misma página')
  })

  const ok = resultados.filter(Boolean).length
  console.log(`\n${ok}/${resultados.length} pruebas OK`)
  process.exit(ok === resultados.length ? 0 : 1)
})()
