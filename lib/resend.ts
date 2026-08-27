import { Resend } from 'resend'

// Instancia perezosa: si RESEND_API_KEY no está configurada, esto NO debe
// tumbar el endpoint completo — solo debe fallar cuando de verdad se intenta
// enviar un email (y eso ya está cubierto por el try/catch en cada ruta).
let _resend: Resend | null = null

export function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null
  }
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

// Email donde el estudio recibe los avisos de nuevas citas.
export const EMAIL_ESTUDIO =
  process.env.STUDIO_NOTIFICATION_EMAIL || 'estudiodeborapereira@gmail.com'
