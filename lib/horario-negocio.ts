// Configuración del horario de atención — Estudio Débora Pereira.
// Más adelante esto puede moverse a una tabla `configuracion` en Supabase
// para que la dueña lo edite desde el panel admin sin tocar código.

export type HorarioDia = { abre: string; cierra: string } | null; // null = cerrado

// 0 = domingo, 1 = lunes, 2 = martes, 3 = miércoles, 4 = jueves, 5 = viernes, 6 = sábado
export const HORARIO_POR_DIA: Record<number, HorarioDia> = {
  0: null, // domingo - cerrado
  1: { abre: "09:30", cierra: "18:30" }, // lunes
  2: { abre: "09:30", cierra: "18:30" }, // martes
  3: { abre: "09:30", cierra: "18:30" }, // miércoles
  4: { abre: "09:30", cierra: "16:00" }, // jueves
  5: { abre: "09:30", cierra: "16:00" }, // viernes
  6: null, // sábado - cerrado
};

export const HORARIO_NEGOCIO = {
  intervaloSlotsMinutos: 30, // cada cuánto se ofrece un horario para reservar
  colchonMinutos: 10, // tiempo de descanso/preparación entre una cita y la siguiente
};

export function esDiaLaboral(fecha: Date): boolean {
  return HORARIO_POR_DIA[fecha.getDay()] !== null;
}

export function horarioDelDia(fecha: Date): HorarioDia {
  return HORARIO_POR_DIA[fecha.getDay()];
}
