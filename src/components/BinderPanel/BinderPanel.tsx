import { useState } from 'react'
import type { Binder, CollectionEntry } from '../../types'
import HoloCard from '../HoloCard/HoloCard'
import './BinderPanel.css'

type PanelView = { view: 'list' } | { view: 'binder'; binderId: string }

type Props = {
  binders: Binder[]
  collection: CollectionEntry[]
  draggedEntryId: string | null
  onDragStart: (entryId: string) => void
  onMoveCard: (entryId: string, binderId: string | null) => void
  onCreateBinder: (name: string, color: string) => Promise<void>
  onUpdateBinder: (binderId: string, patch: { name?: string; color?: string }) => Promise<void>
  onDeleteBinder: (binderId: string) => Promise<void>
}

export default function BinderPanel({
  binders,
  collection,
  draggedEntryId,
  onDragStart,
  onMoveCard,
  onCreateBinder,
  onUpdateBinder: _onUpdateBinder,
  onDeleteBinder,
}: Props) {
  const [panelView, setPanelView] = useState<PanelView>({ view: 'list' })
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [page, setPage] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)

  async function handleCreateSubmit() {
    if (!newName.trim()) return
    await onCreateBinder(newName.trim(), newColor)
    setNewName('')
    setNewColor('#6366f1')
    setShowCreateForm(false)
  }

  // ── List view ────────────────────────────────────────────────────────────
  if (panelView.view === 'list') {
    return (
      <div className="binder-panel">
        <div className="binder-panel__header">
          <h2>Binders</h2>
          <button
            className="btn btn--primary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
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
              className="btn btn--primary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              onClick={handleCreateSubmit}
            >
              Save
            </button>
            <button
              className="btn btn--secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
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
          {binders.map(binder => {
            const cardCount = collection.filter(e => e.binder_id === binder.id).length
            return (
              <div
                key={binder.id}
                className="binder-panel__row"
                onClick={() => { setPanelView({ view: 'binder', binderId: binder.id }); setPage(0) }}
              >
                <span className="binder-panel__swatch" style={{ background: binder.color }} />
                <span className="binder-panel__name">{binder.name}</span>
                <span className="binder-panel__count">{cardCount}</span>
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
            )
          })}
        </div>
      </div>
    )
  }

  // ── Binder view ──────────────────────────────────────────────────────────
  const binder = binders.find(b => b.id === panelView.binderId)
  if (!binder) {
    setPanelView({ view: 'list' })
    return null
  }

  const binderCards = collection.filter(e => e.binder_id === binder.id)
  const totalPages = Math.max(1, Math.ceil(binderCards.length / 9))
  const pageCards = binderCards.slice(page * 9, page * 9 + 9)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    if (draggedEntryId) onMoveCard(draggedEntryId, binder!.id)
  }

  return (
    <div
      className={`binder-panel${isDragOver ? ' binder-panel--drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="binder-panel__header">
        <button
          className="btn btn--secondary"
          style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
          onClick={() => setPanelView({ view: 'list' })}
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
              draggable
              onDragStart={() => onDragStart(entry.id)}
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
            className="btn btn--secondary"
            style={{ padding: '0.25rem 0.6rem' }}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ‹
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button
            className="btn btn--secondary"
            style={{ padding: '0.25rem 0.6rem' }}
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
