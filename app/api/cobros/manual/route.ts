import { NextRequest } from 'next/server'
import { registrarCobroManual } from '@/lib/cobros-manuales'

// Registra un cobro hecho fuera de Stripe. Body: { metodo: 'efectivo' | 'tarjeta_datafono', concepto, monto, ... }
export async function POST(request: NextRequest) {
  return registrarCobroManual(request)
}
