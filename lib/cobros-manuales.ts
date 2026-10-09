// Registro de cobros hechos fuera de Stripe (efectivo, datáfono propio del
// estudio). Lo comparten POST /api/cobros/manual (método en el body) y
// POST /api/cobros/efectivo (método fijo, se mantiene por compatibilidad).
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getResend } from '@/lib/resend'
import { escaparHtml } from '@/lib/html'
import { HORARIO_NEGOCIO } from '@/lib/horario-negocio'
import { esMetodoCobroManual, type MetodoCobroManual } from '@/lib/metodos-pago'

const ETIQUETA_RECIBO: Record<MetodoCobroManual, string> = {
  efectivo: 'Efectivo (en el estudio)',
  tarjeta_datafono: 'Tarjeta (datáfono)',
}

// El servidor corre en UTC: la fecha del recibo se muestra en hora del estudio.
export function formatearFechaHoraRecibo(fecha: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: HORARIO_NEGOCIO.zonaHoraria,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(fecha) // "9 de octubre de 2026 a las 14:30"
}

// Los campos opcionales llegan del formulario; cualquier cosa que no sea texto cuenta como vacío.
function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

// Busca la clienta por email; si no existe (o no hay email), la crea.
// Devuelve null si no se pudo vincular (el cobro se registra igual).
async function buscarOCrearCliente(
  supabaseService: ReturnType<typeof createServiceClient>,
  datos: { nombre: string; email: string; telefono: string }
): Promise<string | null> {
  if (datos.email) {
    const { data: existente, error: errorBusqueda } = await supabaseService
      .from('clientes')
      .select('id')
      .eq('email', datos.email)
      .maybeSingle()

    if (errorBusqueda) {
      console.error('Error buscando cliente existente:', errorBusqueda)
    }
    if (existente) return existente.id
  }

  const { data: nuevoCliente, error: errorCliente } = await supabaseService
    .from('clientes')
    .insert({
      nombre: datos.nombre,
      email: datos.email || null,
      telefono: datos.telefono || null,
    })
    .select('id')
    .single()

  if (errorCliente) {
    console.error('Error creando cliente durante cobro manual:', errorCliente)
    return null
  }
  return nuevoCliente?.id ?? null
}

// `metodoFijo` lo pasa una ruta dedicada a un solo método; sin él, el método
// se lee y valida desde el body.
export async function registrarCobroManual(request: NextRequest, metodoFijo?: MetodoCobroManual) {
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

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la petición no es JSON válido' }, { status: 400 })
  }
  const { concepto, monto, servicio_id } = body ?? {}

  const metodo = metodoFijo ?? body?.metodo
  if (!esMetodoCobroManual(metodo)) {
    return NextResponse.json({ error: 'Método de pago no válido' }, { status: 400 })
  }

  const montoNumero = Number(monto)
  if (typeof concepto !== 'string' || !concepto.trim() || !Number.isFinite(montoNumero)) {
    return NextResponse.json({ error: 'Faltan datos: concepto y monto son requeridos' }, { status: 400 })
  }
  if (montoNumero < 0.01) {
    return NextResponse.json({ error: 'El monto debe ser mayor que 0 €' }, { status: 400 })
  }

  const nombre = texto(body.nombre)
  const email = texto(body.email)
  const telefono = texto(body.telefono)

  const supabaseService = createServiceClient()

  const clienteId = nombre ? await buscarOCrearCliente(supabaseService, { nombre, email, telefono }) : null

  const { data: pago, error: errorPago } = await supabaseService
    .from('pagos')
    .insert({
      cita_id: null,
      cliente_id: clienteId,
      servicio_id: servicio_id || null,
      concepto: concepto.trim(),
      stripe_session_id: null,
      monto: montoNumero,
      estado: 'pagado',
      metodo_pago: metodo,
    })
    .select('id')
    .single()

  if (errorPago || !pago) {
    console.error(`Error registrando pago manual (${metodo}):`, errorPago)
    return NextResponse.json({ error: 'No se pudo registrar el cobro' }, { status: 500 })
  }

  // Recibo por email — solo si el cliente dejó su correo
  if (email) {
    const resend = getResend()
    if (resend) {
      try {
        const { error: errorResend } = await resend.emails.send({
          from: 'Estudio Débora Pereira <reservas@estudiodeborapereira.com>',
          to: email,
          subject: 'Recibo de tu compra ✨',
          html: `
            <h2>¡Gracias por tu compra!</h2>
            <p>Hola ${escaparHtml(nombre)}, este es tu recibo.</p>
            <p><strong>Concepto:</strong> ${escaparHtml(concepto.trim())}</p>
            <p><strong>Monto:</strong> ${new Intl.NumberFormat('es-ES', {
              style: 'currency',
              currency: 'EUR',
            }).format(montoNumero)}</p>
            <p><strong>Método de pago:</strong> ${ETIQUETA_RECIBO[metodo]}</p>
            <p><strong>Fecha:</strong> ${formatearFechaHoraRecibo(new Date())}</p>
            <p>Gracias por confiar en Estudio Débora Pereira.</p>
          `,
        })
        if (errorResend) {
          console.error('Error de Resend al enviar email:', errorResend)
        }
      } catch (errorEmail) {
        console.error(`Error enviando recibo por email (${metodo}):`, errorEmail)
      }
    }
  }

  const avisoCliente =
    nombre && !clienteId
      ? 'El pago se registró, pero no se pudo vincular al cliente (revisa los logs del servidor).'
      : null

  return NextResponse.json({ pagoId: pago.id, aviso: avisoCliente }, { status: 201 })
}
