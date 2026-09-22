// Supabase falso. `state.citaInsert` / `state.citaUpdate` controlan qué devuelve
// la BD al insertar/actualizar en `citas`.
const state = {
  citaInsert: { data: { id: 'cita-1' }, error: null },
  citaUpdate: { data: null, error: null },
}

const PG_EXCLUSION = {
  code: '23P01',
  message: 'conflicting key value violates exclusion constraint "citas_sin_solape"',
  details: 'Key (...) conflicts with existing key (...).',
  hint: null,
}

// Query builder encadenable y "thenable" mínimo
function builder(table) {
  let op = 'select'
  const b = {
    select: () => b,
    eq: () => b,
    insert: () => ((op = 'insert'), b),
    update: () => ((op = 'update'), b),
    maybeSingle: async () => {
      if (table === 'servicios')
        return { data: { nombre: 'Test', duracion_minutos: 60, activo: true, reservable: true }, error: null }
      return { data: null, error: null } // clientes: no existe
    },
    single: async () => {
      if (table === 'clientes') return { data: { id: 'cliente-1' }, error: null }
      if (table === 'citas' && op === 'insert') return state.citaInsert
      if (table === 'citas' && op === 'update') return state.citaUpdate
      return { data: null, error: null }
    },
    then: (res) => res({ error: null }), // await directo (update de google_event_id, insert en pagos)
  }
  return b
}

const cliente = {
  auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
  rpc: async () => ({ data: [], error: null }), // sin citas ocupadas: hayChoque() no atrapa nada
  from: builder,
}

module.exports = {
  createServiceClient: () => cliente,
  createClient: async () => cliente,
  state,
  PG_EXCLUSION,
}
