import { google } from 'googleapis'
import { createServiceClient } from './supabase/server'

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/google-calendar/callback`

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )
}

// Genera la URL a la que mandamos a Débora para que autorice el acceso.
export function getAuthUrl() {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // necesario para recibir un refresh_token (si no, el acceso expira en 1h y no se puede renovar solo)
    prompt: 'consent', // fuerza que Google siempre entregue el refresh_token, incluso si ya había autorizado antes
    scope: ['https://www.googleapis.com/auth/calendar.events'],
  })
}

// Intercambia el código que Google nos manda por los tokens reales, y los guarda.
export async function guardarTokensDesdeCode(code: string, adminId: string) {
  const oauth2Client = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)

  if (!tokens.refresh_token) {
    throw new Error(
      'Google no devolvió un refresh_token. Esto pasa si ya se había autorizado antes sin revocar el acceso — revoca el acceso en https://myaccount.google.com/permissions e intenta de nuevo.'
    )
  }

  const supabase = createServiceClient()

  // Solo debe existir una conexión activa a la vez — si ya había una, la reemplazamos.
  await supabase.from('google_calendar_config').delete().not('id', 'is', null)

  const { error } = await supabase.from('google_calendar_config').insert({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    conectado_por: adminId,
  })

  if (error) throw error
}

export async function obtenerConfigCalendario() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('google_calendar_config')
    .select('*')
    .order('conectado_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

// Devuelve un cliente OAuth ya autenticado y con el access_token vigente
// (lo refresca automáticamente si está por vencer). Devuelve null si no
// hay ninguna conexión configurada — en ese caso, el llamador debe omitir
// la sincronización sin tratarlo como un error.
async function obtenerClienteAutenticado() {
  const config = await obtenerConfigCalendario()
  if (!config) return null

  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({
    access_token: config.access_token,
    refresh_token: config.refresh_token,
  })

  const expiraEn = config.token_expiry ? new Date(config.token_expiry).getTime() : 0
  const yaVaAVencer = expiraEn < Date.now() + 60_000 // margen de 1 minuto

  if (yaVaAVencer) {
    const { credentials } = await oauth2Client.refreshAccessToken()
    oauth2Client.setCredentials(credentials)

    const supabase = createServiceClient()
    await supabase
      .from('google_calendar_config')
      .update({
        access_token: credentials.access_token,
        token_expiry: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
      })
      .eq('id', config.id)
  }

  return oauth2Client
}

type DatosCitaParaEvento = {
  fecha: string
  hora_inicio: string
  hora_fin: string
  nombreServicio: string
  nombreCliente: string
  emailCliente?: string | null
  telefonoCliente?: string | null
}

// Crea el evento en Google Calendar. Devuelve el ID del evento creado, o
// null si no hay ningún calendario conectado (esto NO es un error — el
// negocio puede seguir operando perfectamente sin esta integración).
export async function crearEventoCita(cita: DatosCitaParaEvento): Promise<string | null> {
  const oauth2Client = await obtenerClienteAutenticado()
  if (!oauth2Client) return null

  const config = await obtenerConfigCalendario()
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  const evento = await calendar.events.insert({
    calendarId: config?.calendar_id || 'primary',
    requestBody: {
      summary: `${cita.nombreServicio} — ${cita.nombreCliente}`,
      description: `Cliente: ${cita.nombreCliente}\nEmail: ${cita.emailCliente || '—'}\nTeléfono: ${cita.telefonoCliente || '—'}`,
      start: { dateTime: `${cita.fecha}T${cita.hora_inicio}`, timeZone: 'Europe/Madrid' },
      end: { dateTime: `${cita.fecha}T${cita.hora_fin}`, timeZone: 'Europe/Madrid' },
    },
  })

  return evento.data.id ?? null
}

// Borra el evento (cuando una cita ya confirmada se cancela después).
// Si falla, solo lo registramos — nunca debe bloquear la cancelación real
// de la cita en nuestra base de datos.
export async function eliminarEventoCita(googleEventId: string) {
  const oauth2Client = await obtenerClienteAutenticado()
  if (!oauth2Client) return

  const config = await obtenerConfigCalendario()
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  try {
    await calendar.events.delete({
      calendarId: config?.calendar_id || 'primary',
      eventId: googleEventId,
    })
  } catch (err) {
    console.error('Error eliminando evento de Google Calendar:', err)
  }
}
