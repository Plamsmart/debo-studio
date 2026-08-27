import { createClient } from '@/lib/supabase/server'
import PanelCobrar from '@/components/PanelCobrar'
import '@/components/PanelCobrar.css'

export default async function AdminCobrarPage() {
  const supabase = await createClient()

  const { data: servicios } = await supabase
    .from('servicios')
    .select('id, nombre, precio')
    .eq('activo', true)
    .order('nombre', { ascending: true })

  return (
    <div>
      <h1>Cobrar en el local</h1>
      <PanelCobrar servicios={servicios ?? []} />
    </div>
  )
}
