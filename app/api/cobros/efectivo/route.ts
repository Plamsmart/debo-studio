import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getResend } from '@/lib/resend'

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
      const { data: existente, error: errorBusqueda } = await supabaseService
        .from('clientes')
        .select('id')
        .eq('email', email.trim())
        .maybeSingle()

      if (errorBusqueda) {
        console.error('Error buscando cliente existente:', errorBusqueda)
      }
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

      if (errorCliente) {
        console.error('Error creando cliente durante cobro en efectivo:', errorCliente)
      } else if (nuevoCliente) {
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
    console.error('Error registrando pago en efectivo:', errorPago)
    return NextResponse.json({ error: 'No se pudo registrar el cobro' }, { status: 500 })
  }

  // Recibo por email — solo si el cliente dejó su correo
  if (email?.trim()) {
    const resend = getResend()
    if (resend) {
      try {
        await resend.emails.send({
          from: 'Estudio Débora Pereira <onboarding@resend.dev>',
          to: email.trim(),
          subject: 'Recibo de tu compra ✨',
          html: `
            <h2>¡Gracias por tu compra!</h2>
            <p>Hola ${nombre?.trim() || ''}, este es tu recibo.</p>
            <p><strong>Concepto:</strong> ${concepto.trim()}</p>
            <p><strong>Monto:</strong> ${new Intl.NumberFormat('es-ES', {
              style: 'currency',
              currency: 'EUR',
            }).format(Number(monto))}</p>
            <p><strong>Método de pago:</strong> Efectivo (en el estudio)</p>
            <p>Gracias por confiar en Estudio Débora Pereira.</p>
          `,
        })
      } catch (errorEmail) {
        console.error('Error enviando recibo por email (efectivo):', errorEmail)
      }
    }
  }

  const avisoCliente =
    nombre?.trim() && !clienteId
      ? 'El pago se registró, pero no se pudo vincular al cliente (revisa los logs del servidor).'
      : null

  return NextResponse.json({ pagoId: pago.id, aviso: avisoCliente }, { status: 201 })
}
