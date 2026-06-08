import { useState } from 'react'
import type { Binder, CollectionEntry } from '../../types'
import HoloCard from '../HoloCard/HoloCard'
import './BinderPanel.css'

type Props = {
  binders: Binder[]
  collection: CollectionEntry[]
  onStartDrag: (entryId: string, imageUrl: string, el: HTMLElement) => void
  onCreateBinder: (name: string, color: string) => Promise<void>
  onDeleteBinder: (binderId: string) => Promise<void>
}

export default function BinderPanel({
  binders,
  collection,
  onStartDrag,
  onCreateBinder,
  onDeleteBinder,
}: Props) {
  const [selectedBinderId, setSelectedBinderId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [page, setPage] = useState(0)

  async function handleCreateSubmit() {
    if (!newName.trim()) return
    await onCreateBinder(newName.trim(), newColor)
    setNewName('')
    setNewColor('#6366f1')
    setShowCreateForm(false)
  }

  // ── List view ────────────────────────────────────────────────────────────
  if (selectedBinderId === null) {
    const binderCardCounts = new Map(
      binders.map(b => [b.id, collection.filter(e => e.binder_id === b.id).length])
    )
    return (
      <div className="binder-panel">
        <div className="binder-panel__header">
          <h2>Binders</h2>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => setShowCreateForm(s => !s)}
          >
            + New
          </button>
        </div>

        {showCreateForm && (
          <div className="binder-panel__create-form">
            <input
              className="binder-panel__name-input"
              placeholder="Binder name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateSubmit() }}
              autoFocus
            />
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} />
            <button
              className="btn btn--primary btn--sm"
              onClick={handleCreateSubmit}
            >
              Save
            </button>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </button>
          </div>
        )}

        <div className="binder-panel__list">
          {binders.length === 0 && !showCreateForm && (
            <p className="binder-panel__empty">No binders yet.</p>
          )}
          {binders.map(binder => (
            <div
              key={binder.id}
              className="binder-panel__row"
              onClick={() => { setSelectedBinderId(binder.id); setPage(0) }}
            >
              <span className="binder-panel__swatch" style={{ background: binder.color }} />
              <span className="binder-panel__name">{binder.name}</span>
              <span className="binder-panel__count">{binderCardCounts.get(binder.id) ?? 0}</span>
              <button
                className="btn btn--secondary binder-panel__delete"
                onClick={e => {
                  e.stopPropagation()
                  if (window.confirm(`Delete "${binder.name}"? Cards will return to bulk.`)) {
                    onDeleteBinder(binder.id)
                  }
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Binder view ──────────────────────────────────────────────────────────
  const binder = binders.find(b => b.id === selectedBinderId)
  if (!binder) {
    setSelectedBinderId(null)
    return null
  }

  const binderCards = collection.filter(e => e.binder_id === binder.id)
  const totalPages = Math.max(1, Math.ceil(binderCards.length / 9))
  const pageCards = binderCards.slice(page * 9, page * 9 + 9)

  return (
    <div
      className="binder-panel"
      data-drop-zone={`binder-${binder.id}`}
    >
      <div className="binder-panel__header">
        <button
          className="btn btn--secondary btn--sm"
          onClick={() => setSelectedBinderId(null)}
        >
          ←
        </button>
        <span className="binder-panel__swatch" style={{ background: binder.color }} />
        <span className="binder-panel__title">{binder.name}</span>
        <span className="binder-panel__count">{binderCards.length} cards</span>
      </div>

      <div className="binder-panel__grid">
        {Array.from({ length: 9 }, (_, i) => {
          const entry = pageCards[i]
          return entry ? (
            <div
              key={entry.id}
              className="binder-panel__slot"
              onPointerDown={e =>
                onStartDrag(entry.id, entry.card.image_url, e.currentTarget)
              }
            >
              <HoloCard
                card={entry.card}
                size="sm"
                interactive={false}
                holoSeed={entry.holo_seed ?? undefined}
              />
            </div>
          ) : (
            <div key={`empty-${i}`} className="binder-panel__slot binder-panel__slot--empty" />
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="binder-panel__pagination">
          <button
            className="btn btn--secondary btn--xs"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ‹
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button
            className="btn btn--secondary btn--xs"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
