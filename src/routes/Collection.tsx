import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCollection } from '../hooks/useCollection'
import { useApp } from '../context/AppContext'
import { removeFromCollection } from '../lib/queries'
import HoloCard from '../components/HoloCard/HoloCard'
import type { CollectionEntry } from '../types'

export default function Collection() {
  const navigate = useNavigate()
  const { collection } = useCollection()
  const { state, dispatch } = useApp()

  const [selected, setSelected] = useState<CollectionEntry | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [removing, setRemoving] = useState<CollectionEntry | null>(null)
  const [removeQty, setRemoveQty] = useState(1)

  function openStepper(entry: CollectionEntry) {
    setRemoving(entry)
    setRemoveQty(1)
  }

  function closeStepper() {
    setRemoving(null)
  }

  async function confirmRemove() {
    if (!removing || !state.user) return
    const snapshot = state.collection
    dispatch({ type: 'REMOVE_CARD', cardId: removing.card_id, quantity: removeQty })
    closeStepper()
    try {
      await removeFromCollection(state.user.id, removing.card_id, removeQty)
    } catch {
      dispatch({ type: 'SET_COLLECTION', collection: snapshot })
      alert('Failed to remove card. Please try again.')
    }
  }

  return (
    <div className="collection">
      <header className="collection__header">
        <button className="btn btn--secondary" onClick={() => navigate('/shop')}>
          ← Shop
        </button>
        <h1 className="collection__title">Collection</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="collection__count">{collection.length} cards</span>
          <button
            className="btn btn--secondary"
            onClick={() => setEditMode(m => !m)}
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>
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
              className={`collection__slot${editMode ? ' collection__slot--edit' : ''}`}
              onClick={() => {
                if (editMode) openStepper(entry)
                else setSelected(entry)
              }}
            >
              <HoloCard card={entry.card} size="sm" interactive={false} holoSeed={entry.holo_seed ?? undefined} />
              {entry.count > 1 && (
                <span className="collection__count-badge">×{entry.count}</span>
              )}
              {editMode && (
                <span className="collection__remove-badge">×</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card detail modal */}
      {selected && !editMode && (
        <div className="collection__modal" onClick={() => setSelected(null)}>
          <div className="collection__modal-inner" onClick={e => e.stopPropagation()}>
            <HoloCard card={selected.card} size="lg" interactive holoSeed={selected.holo_seed ?? undefined} />
            <div className="collection__modal-info">
              <h2>{selected.card.name}</h2>
              <p>{selected.card.set} · #{selected.card.number}</p>
              <p className="collection__rarity">{selected.card.rarity.replace('_', ' ')}</p>
            </div>
            <button
              className="btn btn--danger"
              onClick={() => { openStepper(selected); setSelected(null) }}
            >
              Remove
            </button>
            <button className="btn btn--secondary" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Quantity stepper modal */}
      {removing && (
        <div className="collection__modal" onClick={closeStepper}>
          <div className="collection__modal-inner" onClick={e => e.stopPropagation()}>
            <HoloCard card={removing.card} size="sm" interactive={false} holoSeed={removing.holo_seed ?? undefined} />
            <div className="collection__modal-info">
              <h2>{removing.card.name}</h2>
              <p>{removing.card.set} · #{removing.card.number}</p>
              <p>You own: {removing.count}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                className="btn btn--secondary"
                onClick={() => setRemoveQty(q => Math.max(1, q - 1))}
                disabled={removeQty <= 1}
              >−</button>
              <span>{removeQty}</span>
              <button
                className="btn btn--secondary"
                onClick={() => setRemoveQty(q => Math.min(removing.count, q + 1))}
                disabled={removeQty >= removing.count}
              >+</button>
            </div>
            <button className="btn btn--danger" onClick={confirmRemove}>
              Remove {removeQty === removing.count ? 'all' : removeQty}
            </button>
            <button className="btn btn--secondary" onClick={closeStepper}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
