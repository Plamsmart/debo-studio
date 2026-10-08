import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { COOKIE_ESTADO_OAUTH, RUTA_COOKIE_ESTADO_OAUTH, getAuthUrl } from '@/lib/google-calendar'

const DURACION_ESTADO_OAUTH_SEGUNDOS = 10 * 60

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  if (!user) {
    return NextResponse.redirect(`${siteUrl}/login`)
  }

  const { data: usuarioAdmin } = await supabase
    .from('usuarios_admin')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()

  if (usuarioAdmin?.rol !== 'admin') {
    return NextResponse.redirect(`${siteUrl}/admin/integraciones?error=solo_admin`)
  }

  const state = randomBytes(32).toString('hex')
  const respuesta = NextResponse.redirect(getAuthUrl(state))
  // sameSite 'lax': la vuelta desde Google es una navegación GET de nivel
  // superior, así que la cookie sí viaja al callback.
  respuesta.cookies.set(COOKIE_ESTADO_OAUTH, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: RUTA_COOKIE_ESTADO_OAUTH,
    maxAge: DURACION_ESTADO_OAUTH_SEGUNDOS,
  })
  return respuesta
}
