import { NextRequest } from 'next/server'
import { registrarCobroManual } from '@/lib/cobros-manuales'

// Ruta histórica del cobro en efectivo; la lógica vive en lib/cobros-manuales.ts
// (compartida con /api/cobros/manual). El método va fijo: se ignora body.metodo.
export async function POST(request: NextRequest) {
  return registrarCobroManual(request, 'efectivo')
}
