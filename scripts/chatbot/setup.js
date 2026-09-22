// Preparación común: reloj fijo, mocks de módulos y helpers de test.
const path = require('path')
const ROOT = '/home/pedro/Desktop/debo-studio'

// Reloj fijo: lunes 2026-09-21 10:00 en Madrid (08:00Z). Hace deterministas
// hora_pasada / poca_antelacion / calendario del prompt.
let FAKE_NOW = Date.parse('2026-09-21T08:00:00Z')
const RealDate = Date
global.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(FAKE_NOW); else super(...a) }
  static now() { return FAKE_NOW }
}
const setNow = (iso) => { FAKE_NOW = RealDate.parse(iso) }

const state = { db: null, openai: null, resend: null }
global.__extraMocks = {
  '@/lib/supabase/server': () => ({ createServiceClient: () => state.db.cliente, createClient: async () => state.db.cliente }),
  '@/lib/chatbot/openai': () => ({ getOpenAI: () => state.openai }),
  '@/lib/resend': () => ({ getResend: () => state.resend, EMAIL_ESTUDIO: 'estudio@test' }),
  './resend': () => ({ getResend: () => state.resend, EMAIL_ESTUDIO: 'estudio@test' }),
  '@/lib/google-calendar': false,
}
require('./harness.js')

const { crearDb } = require('./fake-db.js')
const { NextRequest } = require(path.join(ROOT, 'node_modules/next/server'))
const load = (rel) => require(path.join(ROOT, rel))

// --- OpenAI guionizado ---
function crearOpenAI(guion) {
  const llamadas = []
  return {
    llamadas,
    chat: {
      completions: {
        create: async (params) => {
          llamadas.push(JSON.parse(JSON.stringify(params)))
          const n = llamadas.length - 1
          const item = typeof guion === 'function' ? guion(params, n) : guion[n]
          if (!item) throw new Error(`guion de OpenAI agotado (llamada #${n + 1})`)
          if (item instanceof Error) throw item
          return { choices: [{ message: item }] }
        },
      },
    },
  }
}
const texto = (t) => ({ role: 'assistant', content: t })
let idLlamada = 0
const llamada = (nombre, args, id) => ({
  role: 'assistant',
  content: null,
  tool_calls: [{ id: id ?? `call_${++idLlamada}`, type: 'function', function: { name: nombre, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }],
})

// Resend falso: guarda los emails enviados.
function crearResend() {
  const enviados = []
  return { enviados, emails: { send: async (m) => { enviados.push(m); return { data: {}, error: null } } } }
}

// --- Test runner mínimo ---
const resultados = []
async function test(nombre, fn) {
  const origErr = console.error, origWarn = console.warn
  console.error = () => {}; console.warn = () => {}
  try { await fn(); resultados.push([true, nombre]) }
  catch (e) { resultados.push([false, nombre, e.message]) }
  finally { console.error = origErr; console.warn = origWarn }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }
function igual(a, b, msg) { if (a !== b) throw new Error(`${msg ?? 'no coincide'}: esperado ${JSON.stringify(b)}, recibido ${JSON.stringify(a)}`) }
function resumen() {
  for (const [ok, n, m] of resultados) console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${ok ? '' : '\n       -> ' + m}`)
  const fallos = resultados.filter((r) => !r[0]).length
  console.log(`\n${resultados.length - fallos}/${resultados.length} pruebas OK`)
  process.exitCode = fallos ? 1 : 0
}

const SESSION = () => require('crypto').randomUUID()
function post(body, { ip = '203.0.113.7', headers = {}, raw } = {}) {
  const route = load('app/api/chat/route.ts')
  return route.POST(new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...headers },
    body: raw ?? JSON.stringify(body),
  }))
}

module.exports = { crearResend, ROOT, load, state, crearDb, crearOpenAI, texto, llamada, test, assert, igual, resumen, setNow, SESSION, post, NextRequest }
