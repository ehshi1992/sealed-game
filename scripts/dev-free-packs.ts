// One-off dev helper: make all packs free and top up ONE user's balance.
// Run: npx tsx scripts/dev-free-packs.ts
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const USER_EMAIL = 'ehshi1992@gmail.com'
const BALANCE = 9999

async function main() {
  // Resolve the target user by email.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) { console.error('listUsers failed:', listErr); process.exit(1) }
  const user = list.users.find((u) => u.email === USER_EMAIL)
  if (!user) { console.error(`No auth user with email ${USER_EMAIL}`); process.exit(1) }

  // Make packs free.
  const { data: packs, error: packErr } = await supabase
    .from('packs')
    .update({ price: 0 })
    .neq('price', 0)
    .select('id, name')
  if (packErr) { console.error('packs update failed:', packErr); process.exit(1) }
  console.log(`Set price=0 on ${packs?.length ?? 0} pack(s)`)

  // Reset only this user's balance.
  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .update({ currency: BALANCE })
    .eq('id', user.id)
    .select('id, currency')
    .single()
  if (profErr) { console.error('profile update failed:', profErr); process.exit(1) }
  console.log(`Reset ${USER_EMAIL} (${prof.id}) balance to ${prof.currency}`)
}

main()
