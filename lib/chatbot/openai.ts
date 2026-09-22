import OpenAI from 'openai'

// Instancia perezosa (mismo patrón que lib/resend.ts): si OPENAI_API_KEY no
// está configurada, esto NO debe tumbar la app entera — el endpoint del chat
// comprueba el null y responde con un error controlado.
let _openai: OpenAI | null = null

export function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null
  }
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _openai
}

// Lo único que el bucle necesita del SDK. Acotarlo permite probar el bucle
// con un cliente falso sin llamar a OpenAI.
export type ClienteOpenAI = Pick<OpenAI, 'chat'>
