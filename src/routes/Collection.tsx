import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCollection } from '../hooks/useCollection'
import HoloCard from '../components/HoloCard/HoloCard'
import type { CollectionEntry } from '../types'

export default function Collection() {
  const navigate = useNavigate()
  const { collection } = useCollection()
  const [selected, setSelected] = useState<CollectionEntry | null>(null)

  return (
    <div className="collection">
      <header className="collection__header">
        <button className="btn btn--secondary" onClick={() => navigate('/shop')}>
          ← Shop
        </button>
        <h1 className="collection__title">Collection</h1>
        <span className="collection__count">{collection.length} cards</span>
      </header>

      {collection.length === 0 ? (
        <div className="collection__empty">
          <p>No cards yet. Open some packs!</p>
          <button className="btn btn--primary" onClick={() => navigate('/shop')}>
            Go to Shop
          </button>
        </div>
      ) : (
        <div className="collection__grid">
          {collection.map((entry) => (
            <div
              key={entry.id}
              className="collection__slot"
              onClick={() => setSelected(entry)}
            >
              <HoloCard card={entry.card} size="sm" interactive={false} holoSeed={entry.holo_seed ?? undefined} />
              {entry.count > 1 && (
                <span className="collection__count-badge">×{entry.count}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="collection__modal" onClick={() => setSelected(null)}>
          <div className="collection__modal-inner" onClick={e => e.stopPropagation()}>
            <HoloCard card={selected.card} size="lg" interactive holoSeed={selected.holo_seed ?? undefined} />
            <div className="collection__modal-info">
              <h2>{selected.card.name}</h2>
              <p>{selected.card.set} · #{selected.card.number}</p>
              <p className="collection__rarity">{selected.card.rarity.replace('_', ' ')}</p>
            </div>
            <button className="btn btn--secondary" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
