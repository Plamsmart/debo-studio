import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUrl } from '@/lib/google-calendar'

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

  return NextResponse.redirect(getAuthUrl())
}
