import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { removeFromCollection, createBinder, deleteBinder, moveCard } from '../lib/queries'
import HoloCard from '../components/HoloCard/HoloCard'
import BinderPanel from '../components/BinderPanel/BinderPanel'
import { useDrag } from '../hooks/useDrag'
import type { CollectionEntry } from '../types'

export default function Collection() {
  const { state, dispatch } = useApp()
  const collection = state.collection
  const binders = state.binders

  // Remove-card state
  const [selected, setSelected] = useState<CollectionEntry | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [removing, setRemoving] = useState<CollectionEntry | null>(null)
  const [removeQty, setRemoveQty] = useState(1)

  // Binder panel state
  const [panelOpen, setPanelOpen] = useState(false)
  const [binderEditMode, setBinderEditMode] = useState(false)

  // Bulk = cards not in any binder
  const bulk = useMemo(() => collection.filter(e => !e.binder_id), [collection])

  // ── Remove card handlers ─────────────────────────────────────────────────
  function openStepper(entry: CollectionEntry) { setRemoving(entry); setRemoveQty(1) }
  function closeStepper() { setRemoving(null) }

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

  // ── Binder handlers ──────────────────────────────────────────────────────
  async function handleCreateBinder(name: string, color: string) {
    if (!state.user) return
    const snapshot = state.binders
    try {
      const binder = await createBinder(state.user.id, name, color)
      dispatch({ type: 'ADD_BINDER', binder })
    } catch {
      dispatch({ type: 'SET_BINDERS', binders: snapshot })
      alert('Failed to create binder.')
    }
  }

  async function handleDeleteBinder(binderId: string) {
    const binderSnapshot = state.binders
    const collectionSnapshot = state.collection
    dispatch({ type: 'DELETE_BINDER', binderId })
    try {
      await deleteBinder(binderId)
    } catch {
      dispatch({ type: 'SET_BINDERS', binders: binderSnapshot })
      dispatch({ type: 'SET_COLLECTION', collection: collectionSnapshot })
      alert('Failed to delete binder.')
    }
  }

  async function handleMoveCard(entryId: string, binderId: string | null, position: number | null = null) {
    const snapshot = state.collection
    // Displace any card already occupying the target slot
    let occupantId: string | undefined
    if (binderId && position != null) {
      const occupant = collection.find(
        e => e.binder_id === binderId && e.binder_position === position && e.id !== entryId
      )
      if (occupant) {
        occupantId = occupant.id
        dispatch({ type: 'MOVE_CARD', entryId: occupant.id, binderId, position: null })
      }
    }
    dispatch({ type: 'MOVE_CARD', entryId, binderId, position })
    try {
      if (occupantId) await moveCard(occupantId, binderId, null)
      await moveCard(entryId, binderId, position)
    } catch {
      dispatch({ type: 'SET_COLLECTION', collection: snapshot })
      alert('Failed to move card.')
    }
  }

  function handleDrop(entryId: string, zoneId: string) {
    if (zoneId === 'bulk') {
      const entry = collection.find(e => e.id === entryId)
      if (entry && entry.binder_id !== null) handleMoveCard(entryId, null, null)
    } else if (zoneId.startsWith('binder-slot:')) {
      const [, binderId, slotStr] = zoneId.split(':')
      handleMoveCard(entryId, binderId, parseInt(slotStr))
    } else if (zoneId.startsWith('binder:')) {
      handleMoveCard(entryId, zoneId.slice(7), null)
    }
  }

  const { draggedEntryId, startDrag } = useDrag(handleDrop)

  return (
    <div className={`collection${panelOpen ? ' collection--panel-open' : ''}`}>
      <div className="collection__toolbar">
        <span className="collection__count">{collection.length} cards</span>
        <button className="btn btn--secondary btn--sm" onClick={() => setEditMode(m => !m)}>
          {editMode ? 'Done' : 'Edit'}
        </button>
        <button className="btn btn--secondary btn--sm" onClick={() => {
          setPanelOpen(o => {
            if (!o) setBinderEditMode(false)
            return !o
          })
        }}>
          {panelOpen ? 'Close Binders' : 'Binders'}
        </button>
        {panelOpen && (
          <button
            className={`btn btn--sm ${binderEditMode ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setBinderEditMode(m => !m)}
          >
            {binderEditMode ? 'Editing Binder' : 'Edit Binder'}
          </button>
        )}
      </div>

      <div className="collection__main">
        {bulk.length === 0 ? (
          <div className="collection__empty">
            <p>No cards in bulk. Open some packs or check your binders!</p>
            <Link className="btn btn--primary" to="/shop">Go to Shop</Link>
          </div>
        ) : (
          <div
            className="collection__grid"
            data-drop-zone="bulk"
          >
            {bulk.map((entry) => (
              <div
                key={entry.id}
                className={`collection__slot${editMode ? ' collection__slot--edit' : ''}${draggedEntryId === entry.id ? ' collection__slot--dragging' : ''}${binderEditMode && !editMode ? ' collection__slot--draggable' : ''}`}
                onPointerDown={e => {
                  if (e.button !== 0) return
                  if (!editMode && binderEditMode) {
                    e.preventDefault()
                    startDrag(entry.id, entry.card.image_url, e.currentTarget)
                  }
                }}
                onClick={() => {
                  if (editMode) openStepper(entry)
                  else setSelected(entry)
                }}
              >
                <HoloCard card={entry.card} size="sm" interactive={false} holoSeed={entry.holo_seed ?? undefined} />
                {entry.count > 1 && (
                  <span className="collection__count-badge">×{entry.count}</span>
                )}
                {editMode && <span className="collection__remove-badge">×</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {panelOpen && (
        <div className={`collection__panel-wrapper${draggedEntryId ? ' collection__panel-wrapper--dragging' : ''}`}>
          <BinderPanel
            binders={binders}
            collection={collection}
            onStartDrag={startDrag}
            onCreateBinder={handleCreateBinder}
            onDeleteBinder={handleDeleteBinder}
            editMode={binderEditMode}
          />
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
