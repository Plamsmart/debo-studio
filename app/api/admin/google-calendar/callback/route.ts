import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { guardarTokensDesdeCode } from '@/lib/google-calendar'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/admin/integraciones?error=sin_codigo`)
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${siteUrl}/login`)
  }

  try {
    await guardarTokensDesdeCode(code, user.id)
  } catch (err) {
    console.error('Error guardando la conexión de Google Calendar:', err)
    return NextResponse.redirect(`${siteUrl}/admin/integraciones?error=fallo_conexion`)
  }

  return NextResponse.redirect(`${siteUrl}/admin/integraciones?exito=1`)
}
