// Supabase en memoria para probar el chatbot. Reproduce lo que importa:
//  - UNIQUE(chat_conversaciones.session_id)  -> error 23505
//  - EXCLUDE citas_sin_solape (colchón 10 min, solo citas activas) -> error 23P01
//  - fallos inyectables (rpc, insert de clientes/citas, conteos)
const crypto = require('crypto')

const COLCHON = 10
const min = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b }

function crearDb() {
  const tablas = { chat_conversaciones: [], chat_mensajes: [], servicios: [], clientes: [], citas: [] }
  const fallos = {} // p.ej. { rpc: true, insert_clientes: true, count_chat_mensajes: true }
  const contadores = { rpc: 0 }
  let seq = 0
  const ahoraTick = () => new Date(Date.now() + seq++).toISOString()

  const activa = (c) => !['cancelada', 'no_asistio'].includes(c.estado)
  const solapa = (a, b) =>
    a.fecha === b.fecha &&
    min(a.hora_inicio) < min(b.hora_fin) + COLCHON &&
    min(a.hora_fin) + COLCHON > min(b.hora_inicio)

  function from(tabla) {
    const q = { op: 'select', filtros: [], orden: [], limite: null, head: false, count: false, filas: null, modo: null, sel: false }

    async function ejecutar() {
      await Promise.resolve()
      const err = (code, message) => ({ data: null, count: null, error: { code, message } })

      if (q.op === 'insert') {
        if (fallos['insert_' + tabla]) return err('XX000', 'boom interno secreto: password authentication failed for user "postgres"')
        const creadas = []
        for (const f of q.filas) {
          const fila = { id: crypto.randomUUID(), creado_en: ahoraTick(), ...f }
          if (tabla === 'citas') {
            fila.estado ??= 'pendiente'
            if (activa(fila) && tablas.citas.some((c) => activa(c) && solapa(c, fila))) {
              return err('23P01', 'conflicting key value violates exclusion constraint "citas_sin_solape"')
            }
          }
          if (tabla === 'chat_conversaciones' && tablas.chat_conversaciones.some((c) => c.session_id === fila.session_id)) {
            return err('23505', 'duplicate key value violates unique constraint "chat_conversaciones_session_id_key"')
          }
          tablas[tabla].push(fila)
          creadas.push(fila)
        }
        if (!q.sel) return { data: null, count: null, error: null }
        return q.modo ? { data: creadas[0], count: null, error: null } : { data: creadas, count: null, error: null }
      }

      if (fallos['select_' + tabla]) return err('XX000', 'boom lectura')
      if (q.count && fallos['count_' + tabla]) return err('XX000', 'boom conteo')

      let filas = tablas[tabla].filter((r) => q.filtros.every((f) => f(r)))
      for (const [col, asc] of [...q.orden].reverse()) {
        filas = [...filas].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1))
      }
      const total = filas.length
      if (q.limite !== null) filas = filas.slice(0, q.limite)

      if (q.head) return { data: null, count: total, error: null }
      if (q.modo === 'maybe') return { data: filas[0] ?? null, count: null, error: null }
      if (q.modo === 'single') {
        return filas.length ? { data: filas[0], count: null, error: null } : err('PGRST116', 'no rows')
      }
      return { data: filas, count: q.count ? total : null, error: null }
    }

    const b = {
      select(_cols, opts) { if (q.op !== 'insert') q.op = 'select'; else q.sel = true; if (opts?.count) q.count = true; if (opts?.head) q.head = true; return b },
      insert(filas) { q.op = 'insert'; q.filas = Array.isArray(filas) ? filas : [filas]; return b },
      eq(c, v) { q.filtros.push((r) => r[c] === v); return b },
      gte(c, v) { q.filtros.push((r) => r[c] >= v); return b },
      order(c, o = {}) { q.orden.push([c, o.ascending !== false]); return b },
      limit(n) { q.limite = n; return b },
      maybeSingle() { q.modo = 'maybe'; return ejecutar() },
      single() { q.modo = 'single'; return ejecutar() },
      then(res, rej) { return ejecutar().then(res, rej) },
    }
    return b
  }

  const cliente = {
    from,
    async rpc(nombre, args) {
      contadores.rpc++
      if (fallos.rpc) return { data: null, error: { code: 'XX000', message: 'boom rpc' } }
      if (nombre !== 'citas_ocupadas_del_dia') return { data: null, error: { message: 'rpc desconocida' } }
      // Con rpcObsoleta simulamos una condición de carrera: la app "no ve" la cita
      // recién creada por otra petición (solo el constraint la atrapa).
      if (fallos.rpcObsoleta) return { data: [], error: null }
      const data = tablas.citas
        .filter((c) => c.fecha === args.fecha_consulta && activa(c))
        .map((c) => ({ hora_inicio: c.hora_inicio + ':00', hora_fin: c.hora_fin + ':00' }))
      return { data, error: null }
    },
  }

  const servicio = (o = {}) => {
    const s = { id: crypto.randomUUID(), nombre: 'Servicio', categoria: 'Cejas', precio: 50, duracion_minutos: 60, activo: true, reservable: true, ...o }
    tablas.servicios.push(s)
    return s
  }

  return { cliente, tablas, fallos, contadores, servicio }
}

module.exports = { crearDb }
