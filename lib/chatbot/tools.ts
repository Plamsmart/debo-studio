import type OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { crearCitaInvitado } from '@/lib/citas'
import { obtenerHorariosDisponibles, type CodigoError } from '@/lib/disponibilidad'
import { CONTACTO_ESTUDIO } from './conocimiento'

type Cliente = SupabaseClient<Database>

// El bot solo tiene estas dos herramientas. No existe (ni debe existir) ninguna
// para cancelar, modificar o consultar citas: si el modelo intenta llamar a
// otra, el ejecutor la rechaza (ver `herramienta_desconocida`).
export const HERRAMIENTAS: OpenAI.Chat.Completions.ChatCompletionFunctionTool[] = [
  {
    type: 'function',
    function: {
      name: 'consultar_disponibilidad',
      description:
        'Devuelve los horarios libres para un servicio en una fecha concreta. Llámala SIEMPRE antes de proponer horas a la clienta.',
      parameters: {
        type: 'object',
        properties: {
          servicio_id: {
            type: 'string',
            description: 'El id EXACTO del servicio, tal como aparece en el catálogo.',
          },
          fecha: {
            type: 'string',
            description: 'Fecha en formato YYYY-MM-DD (usa el calendario del mensaje del sistema).',
          },
        },
        required: ['servicio_id', 'fecha'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_cita',
      description:
        'Registra una SOLICITUD de cita (queda pendiente de confirmar por el estudio). Llámala solo cuando la clienta haya confirmado explícitamente el resumen, y con una hora que consultar_disponibilidad haya devuelto.',
      parameters: {
        type: 'object',
        properties: {
          servicio_id: { type: 'string', description: 'El id EXACTO del servicio, tal como aparece en el catálogo.' },
          fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD.' },
          hora_inicio: { type: 'string', description: 'Hora de inicio en formato HH:mm, una de las devueltas por consultar_disponibilidad.' },
          nombre: { type: 'string', description: 'Nombre de la clienta.' },
          email: { type: 'string', description: 'Email de la clienta (preferible: ahí recibirá el enlace de pago).' },
          telefono: { type: 'string', description: 'Teléfono de la clienta (obligatorio solo si no hay email).' },
        },
        required: ['servicio_id', 'fecha', 'hora_inicio', 'nombre'],
        additionalProperties: false,
      },
    },
  },
]

export type CodigoHerramienta = CodigoError | 'argumentos_invalidos' | 'herramienta_desconocida'

// Cada código de error de Fase 0 (más los propios de la herramienta) traducido a
// lenguaje natural: qué pasó y qué debe hacer el bot. El modelo lo reformula
// con sus palabras; aquí está la sustancia para que no improvise.
const CONTACTO = `${CONTACTO_ESTUDIO.telefono} o ${CONTACTO_ESTUDIO.email}`

const TRADUCCION_ERRORES: Record<CodigoHerramienta, { que_paso: string; que_hacer: string }> = {
  fecha_invalida: {
    que_paso: 'La fecha no tiene un formato válido.',
    que_hacer: 'Confirma con la clienta qué día quiere (usa el calendario del sistema) y vuelve a intentarlo con formato YYYY-MM-DD.',
  },
  hora_invalida: {
    que_paso: 'La hora no tiene un formato válido.',
    que_hacer: 'Vuelve a consultar disponibilidad y ofrece una de las horas de la lista, en formato HH:mm.',
  },
  fecha_pasada: {
    que_paso: 'Esa fecha ya pasó.',
    que_hacer: 'Pídele otro día a partir de hoy.',
  },
  dia_cerrado: {
    que_paso: 'El estudio está cerrado ese día.',
    que_hacer: 'Díselo y ofrécele el siguiente día abierto (mira el calendario del sistema).',
  },
  fuera_de_horario: {
    que_paso: 'Esa hora queda fuera del horario de atención, teniendo en cuenta lo que dura el servicio.',
    que_hacer: 'Consulta la disponibilidad de ese día y ofrécele solo horas de la lista.',
  },
  fuera_de_intervalo: {
    que_paso: 'Las citas solo empiezan en determinados minutos (cada 30 minutos desde la apertura).',
    que_hacer: 'Consulta la disponibilidad de ese día y ofrécele solo horas de la lista.',
  },
  hora_pasada: {
    que_paso: 'Esa hora ya pasó.',
    que_hacer: 'Ofrécele una hora posterior de hoy (si la hay) u otro día.',
  },
  poca_antelacion: {
    que_paso: 'Esa hora queda demasiado cerca: se necesita al menos una hora de antelación.',
    que_hacer: 'Ofrécele una hora más tarde o, para algo urgente, que llame al estudio.',
  },
  choque: {
    que_paso: 'Ese horario ya no está libre (alguien acaba de ocuparlo o choca con otra cita).',
    que_hacer: 'Vuelve a consultar la disponibilidad de ese día y ofrécele alternativas. No reintentes la misma hora.',
  },
  servicio_no_encontrado: {
    que_paso: 'No se encontró ese servicio.',
    que_hacer: 'Revisa el catálogo, confirma con la clienta cuál de los servicios quiere y usa su id exacto.',
  },
  servicio_no_reservable: {
    que_paso: 'Ese servicio no se puede reservar online.',
    que_hacer: `Explícale que para ese servicio debe contactar directamente con el estudio: ${CONTACTO}.`,
  },
  servicio_inactivo: {
    que_paso: 'Ese servicio no está disponible actualmente.',
    que_hacer: 'Díselo y sugiere un servicio similar del catálogo o que consulte con el estudio.',
  },
  datos_incompletos: {
    que_paso: 'Falta algún dato imprescindible (nombre, servicio, fecha u hora).',
    que_hacer: 'Pídele lo que falte, sin inventarlo.',
  },
  contacto_requerido: {
    que_paso: 'Falta un dato de contacto: hace falta al menos un email o un teléfono.',
    que_hacer: 'Pídele su email (preferible, para enviarle el enlace de pago) o, si no tiene, un teléfono.',
  },
  email_invalido: {
    que_paso: 'El email no parece válido.',
    que_hacer: 'Pídele que lo revise y te lo escriba de nuevo.',
  },
  error_interno: {
    que_paso: 'Hubo un fallo técnico al guardar la solicitud.',
    que_hacer: `Discúlpate, no insistas más de una vez y ofrécele el contacto directo del estudio: ${CONTACTO}.`,
  },
  error_consulta: {
    que_paso: 'Hubo un fallo técnico al consultar la información.',
    que_hacer: `Discúlpate, no insistas más de una vez y ofrécele el contacto directo del estudio: ${CONTACTO}.`,
  },
  argumentos_invalidos: {
    que_paso: 'La llamada a la herramienta llegó con datos mal formados.',
    que_hacer: 'Comprueba con la clienta los datos que faltan o son dudosos y vuelve a intentarlo.',
  },
  herramienta_desconocida: {
    que_paso: 'Esa acción no existe: desde el chat solo se puede consultar disponibilidad y registrar solicitudes de cita.',
    que_hacer: `Explícale con amabilidad que no puedes cancelar, modificar ni consultar citas, y que eso lo gestiona el estudio: ${CONTACTO}.`,
  },
}

export type ResultadoHerramienta =
  | { ok: true; [clave: string]: unknown }
  | { ok: false; codigo: CodigoHerramienta; que_paso: string; que_hacer: string; detalle?: string }

function errorHerramienta(codigo: CodigoHerramienta, detalle?: string): ResultadoHerramienta {
  const { que_paso, que_hacer } = TRADUCCION_ERRORES[codigo]
  return { ok: false, codigo, que_paso, que_hacer, ...(detalle ? { detalle } : {}) }
}

// Texto no vacío y recortado, o null (también si el modelo mandó otro tipo).
function texto(args: Record<string, unknown>, clave: string): string | null {
  const valor = args[clave]
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

export type EjecucionHerramienta = {
  // Lo que se le devuelve al modelo (mensaje role "tool").
  contenido: string
  // Lo que se guarda como auditoría en chat_mensajes.herramientas.
  registro: { nombre: string; argumentos: unknown; resultado: ResultadoHerramienta }
}

// Ejecuta una llamada del modelo. NUNCA lanza: cualquier fallo se convierte en
// un resultado de error que el modelo puede explicar (y se loguea).
export async function ejecutarHerramienta(
  supabase: Cliente,
  nombre: string,
  argumentosJSON: string
): Promise<EjecucionHerramienta> {
  const terminar = (argumentos: unknown, resultado: ResultadoHerramienta): EjecucionHerramienta => ({
    contenido: JSON.stringify(resultado),
    registro: { nombre, argumentos, resultado },
  })

  let args: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(argumentosJSON || '{}')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('los argumentos no son un objeto')
    }
    args = parsed as Record<string, unknown>
  } catch (error) {
    console.error(`Argumentos inválidos en la herramienta ${nombre}:`, error, argumentosJSON)
    return terminar(argumentosJSON, errorHerramienta('argumentos_invalidos'))
  }

  try {
    if (nombre === 'consultar_disponibilidad') {
      const servicioId = texto(args, 'servicio_id')
      const fecha = texto(args, 'fecha')
      if (!servicioId || !fecha) return terminar(args, errorHerramienta('argumentos_invalidos'))

      const resultado = await obtenerHorariosDisponibles(supabase, fecha, servicioId)
      if (!resultado.ok) {
        return terminar(args, errorHerramienta(resultado.error.codigo, resultado.error.mensaje))
      }

      const { disponibles, motivo, mensaje } = resultado.valor
      if (disponibles.length === 0) {
        return terminar(args, {
          ok: true,
          fecha,
          horarios_disponibles: [],
          que_paso: mensaje ?? 'No queda ningún horario libre ese día para ese servicio.',
          que_hacer:
            motivo === 'dia_cerrado'
              ? TRADUCCION_ERRORES.dia_cerrado.que_hacer
              : motivo === 'fecha_pasada'
                ? TRADUCCION_ERRORES.fecha_pasada.que_hacer
                : 'Díselo y ofrécele consultar otro día.',
        })
      }
      return terminar(args, { ok: true, fecha, horarios_disponibles: disponibles })
    }

    if (nombre === 'crear_cita') {
      const servicioId = texto(args, 'servicio_id')
      const fecha = texto(args, 'fecha')
      const horaInicio = texto(args, 'hora_inicio')
      const nombreClienta = texto(args, 'nombre')
      if (!servicioId || !fecha || !horaInicio || !nombreClienta) {
        return terminar(args, errorHerramienta('datos_incompletos'))
      }
      const email = texto(args, 'email')
      const telefono = texto(args, 'telefono')

      const resultado = await crearCitaInvitado(supabase, {
        nombre: nombreClienta,
        email,
        telefono,
        servicioId,
        fecha,
        horaInicio,
      })
      if (!resultado.ok) {
        return terminar(args, errorHerramienta(resultado.error.codigo, resultado.error.mensaje))
      }

      // Solo datos que la propia clienta acaba de dar: nunca ids ni la fila de la BD.
      const { servicio, horaFin } = resultado.valor
      return terminar(args, {
        ok: true,
        estado: 'PENDIENTE de confirmar por el estudio (aún NO está confirmada)',
        servicio: servicio.nombre,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        que_decir: email
          ? 'Dile que la solicitud queda pendiente de confirmar por el estudio y que, cuando la confirme, recibirá un email con el enlace de pago.'
          : `Dile que la solicitud queda pendiente de confirmar y que, como no ha dado email, el estudio la contactará por teléfono. Puedes ofrecerle darnos también un email para recibir el enlace de pago.`,
      })
    }

    return terminar(args, errorHerramienta('herramienta_desconocida'))
  } catch (error) {
    console.error(`Error ejecutando la herramienta ${nombre}:`, error)
    return terminar(args, errorHerramienta('error_interno'))
  }
}
