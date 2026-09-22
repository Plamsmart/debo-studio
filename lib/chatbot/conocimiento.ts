// Base de conocimiento del bot (v1: archivo en código, no tabla editable).
// SOLO datos verificables del sitio. El horario NO va aquí: se genera desde
// lib/horario-negocio.ts (una única fuente de verdad) en prompt.ts, y el
// catálogo de servicios y precios se lee en vivo de la tabla `servicios`.

export const CONTACTO_ESTUDIO = {
  telefono: '695 39 38 74',
  email: 'estudiodeborapereira@gmail.com',
  instagram: '@deborapereirastudio',
  direccion: 'Eihera Plaza, 15, Bajo A, 20305 Irun, Gipuzkoa',
} as const

// TODO(Débora): completar antes de publicar con clientas reales. Mientras no
// estén aquí, el bot NO tiene esa información y (por sus reglas) responde que
// lo consulten con el estudio en vez de inventarla:
//   - política de cancelación / cambios de cita
//   - si se pide señal o pago previo, y cuánto
//   - cuidados antes y después de cada tratamiento
//   - contraindicaciones (embarazo, alergias, medicación…)
//   - qué son exactamente los bonos y las formaciones
export const CONOCIMIENTO_NEGOCIO = `
Estudio Débora Pereira es un estudio de estética integral y micropigmentación en Irun (Gipuzkoa).
Lema: "Cuidamos tu imagen, potenciamos tu esencia."
Filosofía: la excelencia, la naturalidad y la personalización son la esencia del trabajo; la estética se entiende como el arte de realzar la belleza individual con sutileza, precisión y armonía.
Puntos fuertes: atención personalizada (cada tratamiento se adapta a la piel, el tiempo y lo que necesita cada persona), materiales e higiene de primer nivel, y un espacio cercano y tranquilo en el centro de Irun.

Contacto del estudio:
- Dirección: ${CONTACTO_ESTUDIO.direccion}
- Teléfono: ${CONTACTO_ESTUDIO.telefono}
- Email: ${CONTACTO_ESTUDIO.email}
- Instagram: ${CONTACTO_ESTUDIO.instagram}

Cómo funcionan las reservas:
1. La clienta solicita una cita (en la web o por este chat). La solicitud queda PENDIENTE de confirmar.
2. El estudio revisa la solicitud y la confirma.
3. Al confirmarla, la clienta recibe un email con el enlace para completar el pago con tarjeta.

Los bonos y las formaciones existen, pero no se reservan por el chat: para esos, la clienta debe contactar directamente con el estudio.
`.trim()
