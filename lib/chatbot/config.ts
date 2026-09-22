// Configuración y límites del chatbot. Los cuatro valores que se ajustan por
// entorno (OPENAI_API_KEY, OPENAI_MODEL, CHAT_LIMITE_CONVERSACIONES_MES,
// CHAT_IP_SALT) se leen desde funciones para que un cambio de variable no
// exija tocar código; el resto son constantes con su razón al lado.

export const CHATBOT = {
  modeloPorDefecto: 'gpt-4o-mini',
  limiteConversacionesMesPorDefecto: 300,

  // Bucle de function calling: cada vuelta es una llamada al modelo. La última
  // se fuerza a responder con texto (tool_choice 'none'), así nunca se agota
  // en silencio con la clienta esperando.
  maxIteracionesHerramientas: 5,
  maxTokensRespuesta: 600,

  // Límites por mensaje y por conversación.
  maxLongitudMensaje: 500,
  maxMensajesPorConversacion: 30,
  // Tope de citas que el bot crea dentro de la MISMA conversación. No es un
  // límite de seguridad (como los de arriba) sino de uso razonable: a partir
  // de la 4ª solicitud, mejor que la clienta hable directo con el estudio.
  maxCitasPorConversacion: 3,
  // Cuánto historial se reenvía al modelo (con el tope de 30 mensajes de la
  // clienta, esto cubre prácticamente toda la conversación).
  historialMaxMensajes: 40,

  // Rate limit por IP (hasheada). Generoso para no castigar una wifi
  // compartida, pero suficiente para frenar un script.
  rateLimitMensajes: { max: 20, ventanaMinutos: 10 },
  rateLimitConversacionesNuevas: { max: 5, ventanaHoras: 24 },

  // Tope del cuerpo de la petición (bytes): un mensaje de 500 caracteres cabe de sobra.
  maxBytesPeticion: 10_000,
} as const

export function modeloChat(): string {
  return process.env.OPENAI_MODEL?.trim() || CHATBOT.modeloPorDefecto
}

export function limiteConversacionesMes(): number {
  const bruto = process.env.CHAT_LIMITE_CONVERSACIONES_MES
  if (bruto === undefined || bruto.trim() === '') {
    return CHATBOT.limiteConversacionesMesPorDefecto
  }
  const valor = Number(bruto)
  if (!Number.isInteger(valor) || valor < 0) {
    console.error(
      `CHAT_LIMITE_CONVERSACIONES_MES inválida ("${bruto}"): se usa ${CHATBOT.limiteConversacionesMesPorDefecto}`
    )
    return CHATBOT.limiteConversacionesMesPorDefecto
  }
  return valor // 0 es válido: cierra el chat a conversaciones nuevas
}

// Algunos modelos (familia razonadora / GPT-5) rechazan `temperature`. Solo la
// mandamos a los que sabemos que la aceptan, para que cambiar OPENAI_MODEL no
// tumbe el bot con un 400.
export function admiteTemperatura(modelo: string): boolean {
  return /^gpt-(3\.5|4)/.test(modelo)
}
