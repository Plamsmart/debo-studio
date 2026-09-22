import subprocess, shutil, os, sys
ROOT='/home/pedro/Desktop/debo-studio'
SP=os.path.dirname(os.path.abspath(__file__))
# (descripcion, archivo, texto_original, texto_mutado, prueba_que_debe_fallar)
M=[
 ("BUG ORIGINAL de zorion-chat: el resultado de la tool NO vuelve al modelo", 'lib/chatbot/agente.ts',
  "      mensajes.push({ role: 'tool', tool_call_id: llamada.id, content: ejecucion.contenido })\n    }\n  }",
  "    }\n  }", '1-flujo.js'),
 ("rate limit: >= pasa a > (límite off-by-one)", 'lib/chatbot/limites.ts',
  "if (enVentana >= max)", "if (enVentana > max)", '3-limites.js'),
 ("se elimina el tope de longitud del mensaje", 'lib/chatbot/limites.ts',
  "if (texto.length > CHATBOT.maxLongitudMensaje)", "if (false)", '3-limites.js'),
 ("la IP se guarda en claro (hash desactivado)", 'lib/chatbot/limites.ts',
  "return createHash('sha256').update(`${sal}:${ip}`).digest('hex')", "return ip", '3-limites.js'),
 ("el mes se calcula en UTC en vez de hora de Madrid", 'lib/chatbot/limites.ts',
  "return new Date(`${anio}-${mes}-01T00:00:00${desfase}`)", "return new Date(`${anio}-${mes}-01T00:00:00Z`)", '3-limites.js'),
 ("se elimina el tope de citas por conversación", 'lib/chatbot/limites.ts',
  "if (creadas >= CHATBOT.maxCitasPorConversacion)", "if (false)", '3-limites.js'),
 ("se quita el manejo del 23P01 (constraint) en crear cita", 'lib/citas.ts',
  "if (esChoquePorConstraint(errorInsert)) {", "if (false) {", '2-errores-robustez.js'),
 ("el prompt deja de exigir 'pendiente' (regla suprimida)", 'lib/chatbot/prompt.ts',
  "que la solicitud queda PENDIENTE de confirmar", "que la solicitud queda registrada", '1-flujo.js'),
 ("crear_cita devuelve la fila de la BD al modelo (fuga de ids)", 'lib/chatbot/tools.ts',
  "        hora_fin: horaFin,\n", "        hora_fin: horaFin,\n        cita: resultado.valor.cita,\n", '1-flujo.js'),
 ("se añade un executor de cancelar_cita (el bot podría cancelar)", 'lib/chatbot/tools.ts',
  "    return terminar(args, errorHerramienta('herramienta_desconocida'))",
  "    if (nombre === 'cancelar_cita') { await supabase.from('citas').update({ estado: 'cancelada' }).eq('id', String(args.cita_id)); return terminar(args, { ok: true }) }\n    return terminar(args, errorHerramienta('herramienta_desconocida'))", '2-errores-robustez.js'),
 ("fallo ABIERTO: si el conteo falla, se deja pasar", 'lib/chatbot/limites.ts',
  "    throw new Error(`No se pudo comprobar el límite (${descripcion})`)", "    return 0", '3-limites.js'),
]
ok_total=0
for desc, arch, orig, mut, prueba in M:
    p=os.path.join(ROOT,arch); bak=os.path.join(SP,'bak_'+os.path.basename(arch))
    shutil.copy(p,bak)
    src=open(p).read()
    if orig not in src:
        print(f"?? NO SE PUDO MUTAR (texto no encontrado): {desc}"); continue
    try:
        open(p,'w').write(src.replace(orig,mut,1))
        r=subprocess.run(['node',os.path.join(SP,prueba)],cwd=ROOT,capture_output=True,text=True,timeout=120)
        fallos=[l for l in r.stdout.splitlines() if l.startswith('FAIL')]
        detectado = r.returncode!=0 and len(fallos)>0
        ok_total+=detectado
        print(f"{'DETECTADA ' if detectado else 'NO DETECTADA'} | {desc}\n             -> {len(fallos)} prueba(s) en rojo" + (f": {fallos[0][5:90]}" if fallos else ""))
    finally:
        shutil.copy(bak,p)
        os.remove(bak)
        assert open(p).read()==src, "RESTAURACIÓN FALLIDA "+arch
print(f"\n{ok_total}/{len(M)} mutaciones detectadas")
