// Compara POST /api/citas ANTES (HEAD) y DESPUÉS de la extracción a lib/citas.ts, con las mismas entradas.
const path = require('path')
const S = require('./setup.js')
const { load, state, crearDb, crearResend, NextRequest, test, assert, igual, resumen } = S
const antigua = require('./route-antigua.ts')
const nueva = load('app/api/citas/route.ts')

const SVC = () => ({ nombre: 'Microblading', duracion_minutos: 60 })
const casos = [
  // [nombre, preparar(db,svc) -> body]
  ['reserva válida (flujo normal de /reservar)', (s) => ({ nombre: 'Ana', email: 'ana@x.com', telefono: '600', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:00' })],
  ['reserva válida solo con teléfono', (s) => ({ nombre: 'Ana', telefono: '600', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:00' })],
  ['reserva válida solo con email', (s) => ({ nombre: 'Ana', email: 'ana@x.com', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:00' })],
  ['cliente recurrente (mismo email)', (s, db) => { db.tablas.clientes.push({ id: 'c1', nombre: 'Ana', email: 'ana@x.com' }); return { nombre: 'Ana', email: 'ana@x.com', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:00' } }],
  ['falta nombre', (s) => ({ email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:00' })],
  ['falta servicio', () => ({ nombre: 'Ana', email: 'a@x.com', fecha: '2026-09-22', hora_inicio: '11:00' })],
  ['falta fecha', (s) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, hora_inicio: '11:00' })],
  ['falta hora', (s) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-22' })],
  ['sin email ni teléfono', (s) => ({ nombre: 'Ana', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:00' })],
  ['email inválido', (s) => ({ nombre: 'Ana', email: 'nope', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:00' })],
  ['fecha inexistente', (s) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-02-31', hora_inicio: '11:00' })],
  ['hora inválida', (s) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '99:99' })],
  ['fecha pasada', (s) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-20', hora_inicio: '11:00' })],
  ['día cerrado (sábado)', (s) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-26', hora_inicio: '11:00' })],
  ['fuera de horario', (s) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '18:00' })],
  ['fuera de intervalo', (s) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:10' })],
  ['hora pasada (hoy)', (s) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-21', hora_inicio: '09:30' })],
  ['poca antelación', (s) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-21', hora_inicio: '10:30' })],
  ['choque (app)', (s, db) => { db.tablas.citas.push({ id: 'x', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:00', hora_fin: '12:00', estado: 'confirmada' }); return { nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:30' } }],
  ['choque (carrera, lo frena el constraint 23P01)', (s, db) => { db.fallos.rpcObsoleta = true; db.tablas.citas.push({ id: 'x', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:00', hora_fin: '12:00', estado: 'pendiente' }); return { nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:30' } }],
  ['servicio inexistente', () => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: '11111111-1111-4111-8111-111111111111', fecha: '2026-09-22', hora_inicio: '11:00' })],
  ['servicio no reservable', (s, db) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: db.servicio({ reservable: false }).id, fecha: '2026-09-22', hora_inicio: '11:00' })],
  ['servicio inactivo', (s, db) => ({ nombre: 'Ana', email: 'a@x.com', servicio_id: db.servicio({ activo: false }).id, fecha: '2026-09-22', hora_inicio: '11:00' })],
  ['fallo al crear el cliente', (s, db) => { db.fallos.insert_clientes = true; return { nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:00' } }],
  ['fallo al insertar la cita', (s, db) => { db.fallos.insert_citas = true; return { nombre: 'Ana', email: 'a@x.com', servicio_id: s.id, fecha: '2026-09-22', hora_inicio: '11:00' } }],
]

async function correr(ruta, prep) {
  const db = crearDb(); state.db = db; state.resend = crearResend()
  const s = db.servicio(SVC())
  const body = prep(s, db)
  const origErr = console.error; console.error = () => {}
  const r = await ruta.POST(new NextRequest('http://localhost/api/citas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  console.error = origErr
  const j = await r.json()
  return { status: r.status, body: j, db, emails: state.resend.enviados.length }
}

;(async () => {
  const diferencias = []
  for (const [nombre, prep] of casos) {
    await test(`/api/citas antes==después: ${nombre}`, async () => {
      const a = await correr(antigua, prep), n = await correr(nueva, prep)
      igual(n.status, a.status, 'status')
      if (a.status === 201) {
        igual(Object.keys(n.body).join(), Object.keys(a.body).join(), 'claves')
        igual(Object.keys(n.body.cita).sort().join(), Object.keys(a.body.cita).sort().join(), 'claves de la cita')
        igual(n.body.cita.estado, a.body.cita.estado, 'estado pendiente')
        igual(n.body.cita.hora_fin, a.body.cita.hora_fin, 'hora_fin')
        igual(n.db.tablas.clientes.length, a.db.tablas.clientes.length, 'clientes creados')
        igual(n.db.tablas.citas.length, a.db.tablas.citas.length, 'citas creadas')
        igual(n.emails, a.emails, 'email al estudio')
      } else {
        // El error (mensaje) debe ser idéntico; el `codigo` puede ser nuevo en los que antes no lo tenían
        if (n.body.error !== a.body.error) diferencias.push(`${nombre}: "${a.body.error}"  ->  "${n.body.error}"`)
        if (a.body.codigo !== undefined) igual(n.body.codigo, a.body.codigo, 'codigo')
        else if (n.body.codigo) diferencias.push(`${nombre}: se añade codigo="${n.body.codigo}" (antes sin código)`)
      }
    })
  }
  resumen()
  console.log('\nDiferencias respecto a HEAD (todas intencionadas):'); [...new Set(diferencias)].forEach((d) => console.log('  -', d))
})()
