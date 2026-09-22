// Arnés desechable: ejecuta los route handlers reales con un Supabase falso.
const Module = require('module')
const path = require('path')
const fs = require('fs')
const ROOT = '/home/pedro/Desktop/debo-studio'
const ts = require(path.join(ROOT, 'node_modules/typescript'))

// Transpilar .ts al vuelo
require.extensions['.tsx'] = require.extensions['.ts'] = (m, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  m._compile(out, filename)
}

// Mocks de módulos con efectos externos
const mocks = {
  '@/lib/supabase/server': () => require(path.join(__dirname, 'fake-supabase.js')),
  '@/lib/resend': () => ({ getResend: () => null, EMAIL_ESTUDIO: 'x@x.x' }),
  '@/lib/stripe': () => ({
    stripe: { checkout: { sessions: { create: async () => ({ id: 'cs_1', url: 'https://stripe.test' }) } } },
    SITE_URL: 'http://localhost',
  }),
  '@/lib/google-calendar': () => ({ crearEventoCita: async () => null, eliminarEventoCita: async () => {} }),
  ...(global.__extraMocks || {}), // van al final para poder pisar los de arriba (false = usar el módulo real)
}
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (mocks[request]) return request
  if (request.startsWith('@/')) {
    const base = path.join(ROOT, request.slice(2))
    for (const ext of ['.ts', '/index.ts']) if (fs.existsSync(base + ext)) return base + ext
  }
  if (request.startsWith('./') && rest[0]?.filename?.startsWith(ROOT)) {
    const base = path.resolve(path.dirname(rest[0].filename), request)
    if (fs.existsSync(base + '.ts')) return base + '.ts'
  }
  return origResolve.call(this, request, ...rest)
}
const origLoad = Module._load
Module._load = function (request, ...rest) {
  if (mocks[request]) return (mocks[request].cache ??= mocks[request]())
  return origLoad.call(this, request, ...rest)
}
module.paths.push(path.join(ROOT, 'node_modules'))
process.chdir(ROOT)
module.exports = { ROOT }
