import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CARD_W = 200
const CARD_H = 279

type LayerCard = {
  id: string
  name: string
  set: string
  number: string
  image_url: string
  subject_layer_url: string
  bg_layer_url: string
}

function LayerCard({ card }: { card: LayerCard }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ color: '#666', fontSize: 11, fontFamily: 'monospace', marginBottom: 8 }}>
        {card.name} · {card.set}-{card.number}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {[
          { label: 'original', src: card.image_url },
          { label: 'subject', src: card.subject_layer_url },
          { label: 'bg', src: card.bg_layer_url },
        ].map(({ label, src }) => (
          <div key={label}>
            <div style={{ color: '#555', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>{label}</div>
            <div style={{
              width: CARD_W, height: CARD_H,
              borderRadius: '4.75%/3.5%',
              overflow: 'hidden',
              background: 'repeating-conic-gradient(#222 0% 25%, #2a2a2a 0% 50%) 0 0 / 16px 16px',
            }}>
              <img
                src={src}
                alt={label}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PolygonTest() {
  const [cards, setCards] = useState<LayerCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('cards')
      .select('id, name, set, number, image_url, subject_layer_url, bg_layer_url')
      .not('subject_layer_url', 'is', null)
      .not('bg_layer_url', 'is', null)
      .order('set')
      .order('number')
      .then(({ data, error }) => {
        if (error) { setError(error.message); return }
        setCards(data as LayerCard[])
        setLoading(false)
      })
  }, [])

  return (
    <div style={{ background: '#1a1a2e', minHeight: '100vh', padding: 32, fontFamily: 'monospace' }}>
      <h2 style={{ color: '#aaa', fontSize: 13, marginBottom: 24 }}>
        CARD LAYER TEST — original / subject / bg
      </h2>
      {loading && !error && <p style={{ color: '#555', fontSize: 12 }}>loading...</p>}
      {error && <p style={{ color: '#c44', fontSize: 12 }}>error: {error}</p>}
      {!loading && cards.length === 0 && (
        <p style={{ color: '#555', fontSize: 12 }}>no processed cards yet — run process_card_layers.py first</p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        {cards.map(card => <LayerCard key={card.id} card={card} />)}
      </div>
    </div>
  )
}
