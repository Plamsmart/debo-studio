# Arnés de pruebas del chatbot (Fase 1)

Pruebas de `lib/chatbot/` y `app/api/chat/route.ts` que corren **sin tocar
Supabase ni OpenAI reales**: transpila el `.ts` del proyecto al vuelo y
sustituye `@/lib/supabase/server`, `@/lib/resend`, `@/lib/chatbot/openai` y
`@/lib/google-calendar` por dobles en memoria. No usa Jest ni ningún test
runner — son scripts de Node sueltos con un runner mínimo casero
(`setup.js`).

Se movieron aquí desde el scratchpad temporal de la sesión donde se
escribieron (se habría perdido al cerrarla). Nacieron como arnés
desechable, pero quedan versionados porque documentan el comportamiento
esperado mejor que cualquier prosa y sirven para detectar regresiones
futuras en `lib/chatbot/` y `lib/citas.ts`.

## Cómo correrlas

Desde la raíz del repo (no llevan `npm test`, se corren directo con `node`):

```bash
node scripts/chatbot/1-flujo.js              # flujo feliz, prompt, modelo/tools
node scripts/chatbot/2-errores-robustez.js   # cada código de error + robustez (prompt injection, etc.)
node scripts/chatbot/3-limites.js            # límites: mensaje, rate limit, mensual, citas por conversación
node scripts/chatbot/4-regresion-citas.js    # /api/citas: compara route-antigua.ts (pre-refactor) vs la actual
node scripts/chatbot/tam.js                  # tamaño del system prompt con 56 servicios (sin red)
python3 scripts/chatbot/mutaciones.py        # mutation testing: confirma que las pruebas SÍ detectan bugs reales
```

`live.js` es distinto: habla con la API real de OpenAI (BD sigue simulada).
Cuesta céntimos y no es determinista.

```bash
OPENAI_API_KEY=sk-... node scripts/chatbot/live.js
```

## Archivos

- `setup.js` — helpers comunes: reloj fijo (lunes 2026-09-21), runner de
  tests (`test`/`assert`/`igual`/`resumen`), `post()` para llamar a
  `POST /api/chat`, OpenAI guionizado (`crearOpenAI`/`texto`/`llamada`).
- `harness.js` — transpila `.ts` al vuelo (vía `typescript` ya instalado en
  el proyecto) e intercepta `require` para servir los dobles de módulos.
- `fake-db.js` — Supabase en memoria específico del chatbot: reproduce el
  `UNIQUE(chat_conversaciones.session_id)` (23505) y el
  `EXCLUDE citas_sin_solape` (23P01), con fallos inyectables por tabla/RPC.
- `fake-supabase.js` — doble genérico más simple, usado por
  `4-regresion-citas.js` a través de `route-antigua.ts`.
- `route-antigua.ts` — snapshot de `app/api/citas/route.ts` **antes** de
  extraer `lib/citas.ts`. Es intencionalmente una foto fija: sirve de
  referencia para el test de regresión, no se actualiza con cambios
  posteriores al endpoint actual (si el endpoint cambia a propósito, hay
  que revisar las diferencias que imprime el test, no "arreglar" este archivo).
- `mutaciones.py` — por cada bug conocido, lo introduce temporalmente en el
  código real, corre la prueba que debería detectarlo, y restaura el
  archivo original (con backup a `bak_<archivo>` que se borra al terminar).
  Es la forma de comprobar que las pruebas no son solo verdes por
  casualidad.

## Al agregar un límite o herramienta nuevos

Si se agrega un límite nuevo en `lib/chatbot/limites.ts` (como el tope de
citas por conversación), conviene añadir también su entrada en la lista
`M` de `mutaciones.py` (desactivar el `if` del límite) apuntando a la
prueba de `3-limites.js` que debería ponerse en rojo — así queda
verificado que el límite realmente hace algo, no solo que existe.
