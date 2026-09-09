# Contexto del proyecto — Estudio Débora Pereira (debo-studio)

> Este documento existe para que cualquier conversación nueva con Claude (o
> Claude Code) pueda retomar este proyecto sin perder el contexto acumulado.
> Súbelo al inicio de un chat nuevo, o déjalo en la raíz del repo como
> `AGENTS.md`/`CLAUDE.md` para que Claude Code lo lea automáticamente.

## Qué es el proyecto

Plataforma web completa para **Estudio Débora Pereira**, un negocio de
estética integral y micropigmentación en Irun, Gipuzkoa (España). Pedro
(el desarrollador, primer proyecto de portafolio) lo está construyendo con
Claude, cobrando una tarifa de lanzamiento (700€ implementación + 100€/mes
mantenimiento) a cambio de usarlo como caso de referencia.

**Sitio en producción:** https://estudiodeborapereira.com (también responde
en https://debo-studio.vercel.app)
**Repositorio:** GitHub — `Plamsmart/debo-studio`, rama `main`
**Despliegue:** Vercel, auto-deploy en cada push a `main`

## Stack técnico

- **Next.js** (App Router, TypeScript) — framework principal
- **Supabase** — base de datos Postgres + autenticación (proyecto ref:
  `oujdpjwjiqehfsqawkbt`)
- **Stripe** — pagos (modo Test todavía, no se ha pasado a Live)
- **Resend** — emails transaccionales, dominio propio verificado
  (`reservas@estudiodeborapereira.com`)
- **Google Calendar API** — sincronización de citas (proyecto Google Cloud:
  "Debo-Studio", modo Testing con usuarios de prueba autorizados)
- **Vercel** — hosting
- **Namecheap** — registro del dominio

## Modelo de datos (Supabase, tablas principales)

- `servicios` — catálogo (56 reservables + 8 bonos + 3 formaciones, estos
  últimos con `reservable = false`, no aparecen en `/reservar`)
- `clientes` — sin cuenta de usuario obligatoria (reservas de invitado)
- `citas` — con `estado` (pendiente/confirmada/cancelada/completada/no_asistio),
  `google_event_id` (vínculo con el evento de Google Calendar)
- `pagos` — con `metodo_pago` (web/qr_local/efectivo), `cliente_id` y
  `servicio_id` directos (no solo a través de `cita_id`, para soportar
  cobros del local sin cita asociada)
- `usuarios_admin` — con `rol` ('admin' o 'staff'); staff tiene acceso
  restringido (sin notas de clientes, sin poder borrar, sin gestionar
  servicios)
- `google_calendar_config` — guarda el refresh_token de Google, tabla
  bloqueada con RLS sin políticas (solo `service_role` puede tocarla)

**RLS:** todas las tablas tienen Row Level Security. El patrón recurrente
de bug fue **falta de GRANT** (permiso a nivel de tabla, distinto de RLS) —
pasó con `servicios`, `citas`, `clientes` y `pagos` para el rol
`service_role`. Si algo nuevo empieza a fallar con "permission denied for
table X", primero revisar GRANTs, no solo políticas RLS.

## Decisiones de arquitectura importantes

- **Reservas sin cuenta:** el endpoint público `/api/citas` usa
  `service_role` (bypassa RLS) porque toda la validación pasa por el
  código del backend antes de insertar — es el único lugar del proyecto
  donde se hace esto intencionalmente para escritura pública.
- **Roles admin/staff:** protegidos en 3 capas (política RLS específica
  por rol, chequeo en el endpoint API, y ocultamiento en la UI) — patrón
  usado en `clientes` y `servicios`.
- **Tokens de diseño centralizados:** `app/marca-tokens.css` define todas
  las variables de color (`--marca-*`) en `:root`, importado una sola vez
  en `app/layout.tsx`. Antes cada componente admin redeclaraba sus propios
  colores — ya no, todo hereda de este archivo.
- **Tipografía:** Montserrat (next/font/google) cargada una sola vez en
  `app/layout.tsx`, disponible en toda la app vía `var(--font-montserrat)`.
  Es sustituto gratuito de Gotham (la fuente oficial del manual de marca,
  pendiente de decidir si se compra la licencia).

## Identidad de marca (manual oficial de Débora)

- Bronce institucional (Pantone 876C): `#8F654D`
- Gris institucional (Cool Gray 11C): `#53565A`
- Cobre oscuro/claro (degradado del emblema): `#AF6F49` / `#E0B689`
- Logo: extraído en alta calidad directo del PDF vectorial del manual
  (no de capturas) — `public/emblema.png` (solo la flor),
  `public/logo-vertical.png`, `public/logo-horizontal.png`

## Bugs recurrentes / patrones a recordar

1. **`.select()` con string armado en variable + ternario** rompe la
   inferencia de tipos de `postgrest-js` (TypeScript no puede inferir el
   resultado). Solución: separar en 2 bloques completos con el string
   del select inline en cada uno. Ya pasó 2 veces (`admin/citas`,
   `admin/clientes`).
2. **Cambios de esquema en Supabase requieren regenerar
   `lib/supabase/database.types.ts`** con
   `npx supabase gen types typescript --project-id oujdpjwjiqehfsqawkbt > lib/supabase/database.types.ts`
   — si no, `npm run build` falla aunque `npm run dev` no se queje.
3. **`next/image` con `width`/`height` que no coinciden con la proporción
   real del archivo** distorsiona la imagen (el navegador usa esos
   atributos para el aspect-ratio, no el archivo real). Para el emblema,
   se resolvió usando `<img>` simple sin esos atributos, controlando el
   tamaño solo por CSS.
4. **Resend NO lanza excepción cuando rechaza un envío** (modo test,
   restricción de dominio) — devuelve `{ data, error }` sin throw. Hay
   que revisar el campo `error` explícitamente, no solo `try/catch`. Ya
   corregido en los 4 archivos que envían emails.
5. **El truco `+alias@gmail.com`** (ej. `zorionagencia+prueba1@gmail.com`)
   sirve para simular clientes/usuarios distintos en Supabase, pero
   **Resend en modo test solo entrega al email EXACTO** con el que te
   registraste — los alias con `+` se rechazan con 403 silencioso si no
   se revisan los logs de Resend.
6. **Descargas de archivos con el mismo nombre** — Chrome les agrega
   `(1)`, `(2)` etc. Varias veces se copió el archivo equivocado por
   descuido. Verificar siempre con `ls -la` que el tamaño/fecha coincida
   con lo esperado antes de asumir que el reemplazo funcionó.
7. **Vercel: dominio sin `www` con redirect a `www`** rompe los webhooks
   de Stripe (Stripe no sigue redirects 308). El webhook debe apuntar a
   la URL exacta que responde 200 directo (en este caso, con `www`).
8. **WhatsApp Business API** cambia a cobrar TODOS los mensajes
   (incluyendo respuestas de servicio) desde el 1 de octubre de 2026 —
   por eso el chatbot arranca solo en el widget web (sin costo de Meta),
   WhatsApp queda como fase futura con su propio costo aparte.

## Panel de administración — secciones

- `/admin/citas` — lista con pestañas (Pendientes/Confirmadas/Todas)
- `/admin/calendario` — vista de día estilo Google Calendar + lista de
  citas del día lado a lado, con horario real por día de la semana
- `/admin/servicios` — CRUD del catálogo (solo admin puede modificar)
- `/admin/clientes` — historial de pagos por cliente, notas (solo admin)
- `/admin/cobrar` — cobro en el local (QR vía Stripe Checkout, o efectivo
  instantáneo)
- `/admin/integraciones` — conectar/ver estado de Google Calendar

## Pendiente / próximos pasos

1. **Chatbot con IA** (siguiente sesión de trabajo) — adaptar el proyecto
   `zorion-chat` (repo separado: `Plamsmart/zorion-chat`, construido
   originalmente para un gimnasio con integración a AimHarder) hacia
   `debo-studio`. Decisión ya tomada: **clonar y simplificar el código
   dentro de `debo-studio`** (no conectar como tenant de zorion-chat), por
   temas de aislamiento de seguridad/datos entre clientes futuros.
   Las herramientas de reserva del bot deben reescribirse para llamar a
   `/api/disponibilidad` y `/api/citas` (las propias), no a AimHarder.
   Ya incluido en el presupuesto formal (700€) con límite de 300
   conversaciones/mes en el mantenimiento.
2. **Licencia de Gotham** — pendiente de que Débora confirme si ya la
   tiene. Por ahora se usa Montserrat (gratis) como sustituto.
3. **Stripe en modo Live** — sigue en Test, falta decidir cuándo pasar a
   cobros reales (requiere cuenta bancaria de Débora conectada).
4. **Documento de presupuesto formal** — ya generado
   (`Presupuesto_Estudio_Debora_Pereira.docx`), pendiente de enviárselo a
   Débora para su aceptación.
5. **WhatsApp** — pausado indefinidamente, se retomará como fase aparte
   con presupuesto propio si el negocio lo pide más adelante.

## Cuentas y credenciales (dónde viven, no los valores)

- Supabase: proyecto `debo-studio`, org `zorion.Org`
- Vercel: proyecto `debo-studio`, cuenta de Pedro
- Stripe: cuenta "Estudio Débora Pereira" (separada de otros proyectos de
  Pedro), modo Test
- Google Cloud: proyecto "Debo-Studio"
- Resend: cuenta `zorionagencia@gmail.com`, dominio
  `estudiodeborapereira.com` verificado
- Namecheap: dominio `estudiodeborapereira.com` comprado

## Convención de trabajo con Claude Code

Cuando se piden cambios grandes que tocan archivos ya existentes, mejor
dar **instrucciones precisas** (qué buscar, qué reemplazar) en vez de
sobrescribir el archivo completo a ciegas — varias veces el archivo real
en el proyecto había cambiado desde la última copia que Claude tenía, y
sobrescribirlo completo revirtió trabajo sin querer. Siempre pedir
verificación con `npm run build` (no solo `npm run dev`, que es menos
estricto con TypeScript) antes de dar un cambio por bueno.
