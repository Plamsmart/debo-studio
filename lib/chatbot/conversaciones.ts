import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { RegistroHerramienta } from './agente'

type Cliente = SupabaseClient<Database>
export type Conversacion = Database['public']['Tables']['chat_conversaciones']['Row']
export type MensajeChat = { rol: 'user' | 'assistant'; contenido: string }

export async function buscarConversacion(supabase: Cliente, sessionId: string): Promise<Conversacion | null> {
  const { data, error } = await supabase
    .from('chat_conversaciones')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (error) {
    console.error('Error buscando la conversación del chat:', error)
    throw new Error('No se pudo consultar la conversación')
  }
  return data
}

// Crea la conversación. Si dos peticiones simultáneas de la misma sesión llegan
// a la vez, la segunda choca con el UNIQUE de session_id (23505): en ese caso
// devolvemos la que ya existe en vez de fallar.
export async function crearConversacion(
  supabase: Cliente,
  sessionId: string,
  ipHash: string
): Promise<Conversacion> {
  const { data, error } = await supabase
    .from('chat_conversaciones')
    .insert({ session_id: sessionId, ip_hash: ipHash })
    .select()
    .single()

  if (error?.code === '23505') {
    const existente = await buscarConversacion(supabase, sessionId)
    if (existente) return existente
  }
  if (error || !data) {
    console.error('Error creando la conversación del chat:', error)
    throw new Error('No se pudo crear la conversación')
  }
  return data
}

// Últimos mensajes en orden cronológico. Se descarta un 'assistant' inicial
// para que el historial que ve el modelo arranque siempre con la clienta.
export async function obtenerHistorial(
  supabase: Cliente,
  conversacionId: string,
  maximo: number
): Promise<MensajeChat[]> {
  const { data, error } = await supabase
    .from('chat_mensajes')
    .select('rol, contenido')
    .eq('conversacion_id', conversacionId)
    .order('creado_en', { ascending: false })
    .limit(maximo)

  if (error) {
    console.error('Error leyendo el historial del chat:', error)
    throw new Error('No se pudo leer el historial')
  }

  const mensajes = (data ?? []).reverse() as MensajeChat[]
  return mensajes[0]?.rol === 'assistant' ? mensajes.slice(1) : mensajes
}

export async function guardarMensajeUsuario(
  supabase: Cliente,
  conversacionId: string,
  contenido: string,
  ipHash: string
): Promise<void> {
  const { error } = await supabase
    .from('chat_mensajes')
    .insert({ conversacion_id: conversacionId, rol: 'user', contenido, ip_hash: ipHash })

  if (error) {
    console.error('Error guardando el mensaje de la clienta:', error)
    throw new Error('No se pudo guardar el mensaje')
  }
}

export async function guardarMensajeAsistente(
  supabase: Cliente,
  conversacionId: string,
  contenido: string,
  herramientas: RegistroHerramienta[]
): Promise<void> {
  const { error } = await supabase.from('chat_mensajes').insert({
    conversacion_id: conversacionId,
    rol: 'assistant',
    contenido,
    herramientas: herramientas.length > 0 ? (herramientas as unknown as Json) : null,
  })

  // La respuesta ya está generada: si no se puede guardar, lo registramos pero
  // la clienta la recibe igual (perder el historial es mejor que perder la respuesta).
  if (error) {
    console.error('Error guardando la respuesta del asistente:', error)
  }
}
