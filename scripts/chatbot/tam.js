const S = require('./setup.js'); const { load, crearDb } = S
const db = crearDb()
const cats = ['Cejas','Labios','Facial','Corporal','Pestañas','Uñas','Depilación']
for (let i = 0; i < 56; i++) db.servicio({ nombre: `Tratamiento de ejemplo número ${i + 1} con nombre largo`, categoria: cats[i % 7], precio: 45 + i, duracion_minutos: 60 })
const { construirSystemPrompt, REGLAS_BOT } = load('lib/chatbot/prompt.ts')
;(async () => {
  const p = await construirSystemPrompt(db.cliente)
  console.log(`prompt completo: ${p.length} caracteres ≈ ${Math.round(p.length / 3.5)}–${Math.round(p.length / 4)} tokens (56 servicios)`)
  console.log(`  de ellos reglas: ${REGLAS_BOT.length} car.`)
})()
