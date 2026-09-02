import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// POST /api/cobros/efectivo
// Body: { concepto, monto, servicio_id?, nombre?, email?, telefono? }
// Registra un pago en efectivo, marcado como 'pagado' de inmediato (no hay
// nada que esperar, el dinero ya está en el mostrador). Solo admins.
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: esAdmin } = await supabase
    .from('usuarios_admin')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!esAdmin) {
    return NextResponse.json({ error: 'Solo el equipo del estudio puede registrar cobros' }, { status: 403 })
  }

  const body = await request.json()
  const { concepto, monto, servicio_id, nombre, email, telefono } = body

  if (!concepto?.trim() || !monto || monto <= 0) {
    return NextResponse.json({ error: 'Faltan datos: concepto y monto son requeridos' }, { status: 400 })
  }

  const supabaseService = createServiceClient()

  let clienteId: string | null = null
  if (nombre?.trim()) {
    if (email?.trim()) {
      const { data: existente } = await supabaseService
        .from('clientes')
        .select('id')
        .eq('email', email.trim())
        .maybeSingle()
      if (existente) clienteId = existente.id
    }

    if (!clienteId) {
      const { data: nuevoCliente, error: errorCliente } = await supabaseService
        .from('clientes')
        .insert({
          nombre: nombre.trim(),
          email: email?.trim() || null,
          telefono: telefono?.trim() || null,
        })
        .select('id')
        .single()

      if (!errorCliente && nuevoCliente) {
        clienteId = nuevoCliente.id
      }
    }
  }

  const { data: pago, error: errorPago } = await supabaseService
    .from('pagos')
    .insert({
      cita_id: null,
      cliente_id: clienteId,
      servicio_id: servicio_id || null,
      concepto: concepto.trim(),
      stripe_session_id: null,
      monto: Number(monto),
      estado: 'pagado',
      metodo_pago: 'efectivo',
    })
    .select('id')
    .single()

  if (errorPago || !pago) {
    return NextResponse.json({ error: 'No se pudo registrar el cobro' }, { status: 500 })
  }

  return NextResponse.json({ pagoId: pago.id }, { status: 201 })
}
