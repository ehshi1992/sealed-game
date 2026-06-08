import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import type { ArtworkBounds } from '../src/types'

const LAYOUT_DEFAULTS: Record<string, ArtworkBounds> = {
  standard: { x: 0.07, y: 0.135, w: 0.86, h: 0.385 },
  ex_gx:    { x: 0.07, y: 0.09,  w: 0.86, h: 0.42  },
  v_vmax:   { x: 0.00, y: 0.00,  w: 1.00, h: 0.65  },
  full_art:  { x: 0.00, y: 0.00,  w: 1.00, h: 1.00  },
  trainer:  { x: 0.20, y: 0.12,  w: 0.60, h: 0.28  },
  energy:   { x: 0.20, y: 0.12,  w: 0.60, h: 0.28  },
}

export function getLayoutBounds(layoutType: string): ArtworkBounds {
  return LAYOUT_DEFAULTS[layoutType] ?? LAYOUT_DEFAULTS.standard
}

async function main() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, card_layout_type')

  if (error) { console.error(error); process.exit(1) }
  if (!cards || cards.length === 0) { console.log('No cards found.'); return }

  console.log(`Processing ${cards.length} cards…`)

  for (const card of cards) {
    const bounds = getLayoutBounds(card.card_layout_type ?? 'standard')
    const { error: updateError } = await supabase
      .from('cards')
      .update({ artwork_bounds: bounds })
      .eq('id', card.id)

    if (updateError) {
      console.error(`Failed card ${card.id}:`, updateError.message)
    } else {
      console.log(`  ${card.id} → ${JSON.stringify(bounds)}`)
    }
  }

  console.log('Done.')
}

main()
