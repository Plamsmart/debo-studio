import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/clientes
// Crea un cliente manualmente (ej. alguien que llegó al local sin pasar por
// la web). Protegido por la policy RLS `clientes_insert_propio_o_admin`.
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = await request.json()
  const { nombre, email, telefono, notas } = body

  if (!nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  }

  const { data: nuevoCliente, error } = await supabase
    .from('clientes')
    .insert({
      nombre: nombre.trim(),
      email: email?.trim() || null,
      telefono: telefono?.trim() || null,
      notas: notas?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'No se pudo crear el cliente (verifica permisos de administrador)' },
      { status: 403 }
    )
  }

  return NextResponse.json({ cliente: nuevoCliente }, { status: 201 })
}
