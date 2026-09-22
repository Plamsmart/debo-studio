import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { RegistroHerramienta } from './agente'
import { CHATBOT, limiteConversacionesMes } from './config'
import { CONTACTO_ESTUDIO } from './conocimiento'

type Cliente = SupabaseClient<Database>

// Límites del chatbot. /api/chat es público y cada mensaje puede costar dinero,
// así que TODO se comprueba antes de llamar a OpenAI. Comprobaciones baratas
// primero (formato del mensaje), luego las que consultan la base de datos.
//
// Los mensajes están pensados para mostrarse tal cual en el widget: siempre dan
// una salida alternativa (reservar en la web o contactar al estudio).

export type CodigoLimite =
  | 'mensaje_invalido'
  | 'mensaje_largo'
  | 'rate_limit'
  | 'limite_mensajes'
  | 'ip_conversaciones'
  | 'limite_conversaciones'
  | 'limite_citas'

export type ErrorLimite = { codigo: CodigoLimite; mensaje: string; status: number }
export type ResultadoLimite = { ok: true } | { ok: false; error: ErrorLimite }

const CONTACTO = `${CONTACTO_ESTUDIO.telefono} o ${CONTACTO_ESTUDIO.email}`
const ALTERNATIVA = `Puedes reservar directamente desde la web (sección "Reservar cita") o escribirnos: ${CONTACTO}.`

function bloqueo(codigo: CodigoLimite, mensaje: string, status: number): ResultadoLimite {
  return { ok: false, error: { codigo, mensaje, status } }
}

// --- Mensaje ---

export function validarMensaje(
  valor: unknown
): { ok: true; texto: string } | { ok: false; error: ErrorLimite } {
  if (typeof valor !== 'string' || !valor.trim()) {
    return { ok: false, error: { codigo: 'mensaje_invalido', mensaje: 'Escribe un mensaje para poder ayudarte.', status: 400 } }
  }
  const texto = valor.trim()
  if (texto.length > CHATBOT.maxLongitudMensaje) {
    return {
      ok: false,
      error: {
        codigo: 'mensaje_largo',
        mensaje: `Tu mensaje es demasiado largo (máximo ${CHATBOT.maxLongitudMensaje} caracteres). ¿Puedes resumirlo?`,
        status: 400,
      },
    }
  }
  return { ok: true, texto }
}

// --- IP ---

// En Vercel, x-forwarded-for lo establece la plataforma (sobrescribe lo que
// mande el cliente). Se toma la primera entrada: la IP original.
export function obtenerIp(headers: Headers): string {
  const reenviada = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return reenviada || headers.get('x-real-ip')?.trim() || 'desconocida'
}

// La IP nunca se guarda en claro: solo SHA-256(sal + ip). La sal (CHAT_IP_SALT)
// impide reconstruir IPs recorriendo el espacio IPv4 a partir de la base de datos.
export function hashIp(ip: string, sal: string): string {
  return createHash('sha256').update(`${sal}:${ip}`).digest('hex')
}

// --- Ventanas de tiempo ---

// Primer instante del mes actual en la zona horaria del negocio (UTC en el
// servidor no serviría: el 1 a las 00:30 en Irun todavía es el mes anterior en UTC).
export function inicioDeMesEnNegocio(ahora: Date = new Date(), zona = 'Europe/Madrid'): Date {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit' }).formatToParts(ahora)
  const anio = partes.find((p) => p.type === 'year')!.value
  const mes = partes.find((p) => p.type === 'month')!.value

  // Desfase de Madrid ese día ("GMT+02:00" -> "+02:00"). El cambio de hora cae a
  // finales de marzo/octubre, nunca el día 1, así que el desfase del mediodía UTC
  // del día 1 es el de la medianoche local.
  const desfase =
    new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' })
      .formatToParts(new Date(`${anio}-${mes}-01T12:00:00Z`))
      .find((p) => p.type === 'timeZoneName')!
      .value.replace('GMT', '') || '+00:00'

  return new Date(`${anio}-${mes}-01T00:00:00${desfase}`)
}

function haceMinutos(minutos: number, ahora: Date): string {
  return new Date(ahora.getTime() - minutos * 60_000).toISOString()
}

// --- Comprobaciones contra la base de datos ---
// Todas fallan CERRADAS: si no se puede contar, se lanza y el endpoint responde
// con error en vez de dejar pasar peticiones sin control.

async function contar(
  consulta: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  descripcion: string
): Promise<number> {
  const { count, error } = await consulta
  if (error) {
    console.error(`Error contando ${descripcion}:`, error)
    throw new Error(`No se pudo comprobar el límite (${descripcion})`)
  }
  return count ?? 0
}

// Rate limit por IP: mensajes de la clienta en la última ventana.
export async function comprobarRateLimitMensajes(
  supabase: Cliente,
  ipHash: string,
  ahora: Date = new Date()
): Promise<ResultadoLimite> {
  const { max, ventanaMinutos } = CHATBOT.rateLimitMensajes
  const enVentana = await contar(
    supabase
      .from('chat_mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('rol', 'user')
      .eq('ip_hash', ipHash)
      .gte('creado_en', haceMinutos(ventanaMinutos, ahora)),
    'mensajes por IP'
  )

  if (enVentana >= max) {
    return bloqueo('rate_limit', `Estás escribiendo muy rápido. Espera unos minutos y vuelve a intentarlo. ${ALTERNATIVA}`, 429)
  }
  return { ok: true }
}

// Tope de mensajes de una conversación ya existente.
export async function comprobarLimiteMensajesConversacion(
  supabase: Cliente,
  conversacionId: string
): Promise<ResultadoLimite> {
  const enviados = await contar(
    supabase
      .from('chat_mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('conversacion_id', conversacionId)
      .eq('rol', 'user'),
    'mensajes de la conversación'
  )

  if (enviados >= CHATBOT.maxMensajesPorConversacion) {
    return bloqueo('limite_mensajes', `Esta conversación ha llegado al máximo de mensajes. ${ALTERNATIVA}`, 429)
  }
  return { ok: true }
}

// Tope de citas creadas por el bot dentro de la MISMA conversación (no es un
// límite de seguridad, sino de uso razonable: a partir de la 4ª, mejor que la
// clienta hable directo con el estudio). Las citas no guardan a qué
// conversación pertenecen, así que se cuentan desde la auditoría que ya se
// guarda en chat_mensajes.herramientas (ver conversaciones.ts).
export async function comprobarLimiteCitasConversacion(
  supabase: Cliente,
  conversacionId: string
): Promise<ResultadoLimite> {
  const { data, error } = await supabase
    .from('chat_mensajes')
    .select('herramientas')
    .eq('conversacion_id', conversacionId)
    .eq('rol', 'assistant')

  if (error) {
    console.error('Error contando las citas creadas en la conversación:', error)
    throw new Error('No se pudo comprobar el límite (citas de la conversación)')
  }

  const creadas = (data ?? []).reduce((total, fila) => {
    const registros = (fila.herramientas as unknown as RegistroHerramienta[] | null) ?? []
    return total + registros.filter((r) => r.nombre === 'crear_cita' && r.resultado?.ok === true).length
  }, 0)

  if (creadas >= CHATBOT.maxCitasPorConversacion) {
    return bloqueo('limite_citas', `Ya gestioné el máximo de citas que puedo crear en esta conversación. ${ALTERNATIVA}`, 429)
  }
  return { ok: true }
}

// Antes de ABRIR una conversación nueva: tope por IP y tope mensual global.
export async function comprobarConversacionNueva(
  supabase: Cliente,
  ipHash: string,
  ahora: Date = new Date()
): Promise<ResultadoLimite> {
  const { max, ventanaHoras } = CHATBOT.rateLimitConversacionesNuevas
  const deLaIp = await contar(
    supabase
      .from('chat_conversaciones')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('creado_en', haceMinutos(ventanaHoras * 60, ahora)),
    'conversaciones por IP'
  )
  if (deLaIp >= max) {
    return bloqueo('ip_conversaciones', `Has iniciado demasiadas conversaciones seguidas. ${ALTERNATIVA}`, 429)
  }

  const delMes = await contar(
    supabase
      .from('chat_conversaciones')
      .select('id', { count: 'exact', head: true })
      .gte('creado_en', inicioDeMesEnNegocio(ahora).toISOString()),
    'conversaciones del mes'
  )
  if (delMes >= limiteConversacionesMes()) {
    return bloqueo('limite_conversaciones', `El asistente virtual ha alcanzado su límite de conversaciones de este mes. ${ALTERNATIVA}`, 429)
  }

  return { ok: true }
}
