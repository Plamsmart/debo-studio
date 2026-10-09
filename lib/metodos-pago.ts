// Métodos de pago (enum `metodo_pago` en Supabase) y sus etiquetas visibles.
// Módulo sin dependencias de servidor: lo usan tanto los paneles (cliente)
// como las rutas de /api/cobros.
import type { Database } from '@/lib/supabase/database.types'

export type MetodoPago = Database['public']['Enums']['metodo_pago']

export const ETIQUETA_METODO_PAGO: Record<MetodoPago, string> = {
  web: 'Web',
  qr_local: 'QR en el local',
  efectivo: 'Efectivo',
  tarjeta_datafono: 'Tarjeta (datáfono)',
}

// Cobros que la app solo REGISTRA (el dinero se cobra fuera de Stripe).
export const METODOS_COBRO_MANUAL = ['efectivo', 'tarjeta_datafono'] as const satisfies readonly MetodoPago[]
export type MetodoCobroManual = (typeof METODOS_COBRO_MANUAL)[number]

export function esMetodoCobroManual(valor: unknown): valor is MetodoCobroManual {
  return typeof valor === 'string' && (METODOS_COBRO_MANUAL as readonly string[]).includes(valor)
}
