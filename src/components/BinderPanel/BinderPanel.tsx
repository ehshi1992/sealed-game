import { useState, useRef, useEffect } from 'react'
import type { Binder, CollectionEntry } from '../../types'
import HoloCard from '../HoloCard/HoloCard'
import './BinderPanel.css'

type Props = {
  binders: Binder[]
  collection: CollectionEntry[]
  onStartDrag: (entryId: string, imageUrl: string, el: HTMLElement) => void
  onCreateBinder: (name: string, color: string) => Promise<void>
  onDeleteBinder: (binderId: string) => Promise<void>
  fullWidth?: boolean
  onBinderViewChange?: (open: boolean) => void
}

export default function BinderPanel({
  binders,
  collection,
  onStartDrag,
  onCreateBinder,
  onDeleteBinder,
  fullWidth = false,
  onBinderViewChange,
}: Props) {
  const [selectedBinderId, setSelectedBinderId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [page, setPage] = useState(0)
  const [flipClass, setFlipClass] = useState('')
  const animatingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

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
              onClick={() => {
                setSelectedBinderId(binder.id)
                setPage(0)
                onBinderViewChange?.(true)
              }}
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
    onBinderViewChange?.(false)
    return null
  }

  const allBinderCards = collection.filter(e => e.binder_id === binder.id)

  const positionedMap = new Map<number, typeof allBinderCards[0]>()
  const unpositioned: typeof allBinderCards = []
  for (const e of allBinderCards) {
    if (e.binder_position != null) positionedMap.set(e.binder_position, e)
    else unpositioned.push(e)
  }

  const SLOTS_PER_VIEW = fullWidth ? 18 : 9
  const totalViews = Math.max(1, Math.ceil(allBinderCards.length / SLOTS_PER_VIEW))

  const viewSlots: (typeof allBinderCards[0] | null)[] = Array.from({ length: SLOTS_PER_VIEW }, (_, i) => {
    const globalSlot = page * SLOTS_PER_VIEW + i
    return positionedMap.get(globalSlot) ?? null
  })
  let unpIdx = 0
  for (let i = 0; i < SLOTS_PER_VIEW; i++) {
    if (!viewSlots[i] && unpIdx < unpositioned.length) {
      viewSlots[i] = unpositioned[unpIdx++]
    }
  }

  function flipToPage(next: number) {
    if (animatingRef.current) return
    animatingRef.current = true
    const direction = next > page ? 'right' : 'left'
    setFlipClass(`binder-panel__grid--flip-out-${direction}`)
    setTimeout(() => {
      if (!mountedRef.current) return
      setPage(next)
      setFlipClass(`binder-panel__grid--flip-in-${direction}`)
      setTimeout(() => {
        if (!mountedRef.current) return
        setFlipClass('')
        animatingRef.current = false
      }, 250)
    }, 250)
  }

  const binderId = binder.id

  function renderSlot(entry: typeof allBinderCards[0] | null, globalSlot: number) {
    return entry ? (
      <div
        key={entry.id}
        className="binder-panel__slot"
        data-drop-zone={`binder-slot:${binderId}:${globalSlot}`}
        onPointerDown={e => {
          e.preventDefault()
          onStartDrag(entry.id, entry.card.image_url, e.currentTarget)
        }}
      >
        <HoloCard
          card={entry.card}
          size="sm"
          interactive={false}
          holoSeed={entry.holo_seed ?? undefined}
        />
      </div>
    ) : (
      <div
        key={`empty-${globalSlot}`}
        className="binder-panel__slot binder-panel__slot--empty"
        data-drop-zone={`binder-slot:${binderId}:${globalSlot}`}
      />
    )
  }

  const paginationControls = totalViews > 1 && (
    <div className="binder-panel__pagination">
      <button
        className="btn btn--secondary btn--xs"
        onClick={() => flipToPage(Math.max(0, page - 1))}
        disabled={page === 0}
      >‹</button>
      <span>{page + 1} / {totalViews}</span>
      <button
        className="btn btn--secondary btn--xs"
        onClick={() => flipToPage(Math.min(totalViews - 1, page + 1))}
        disabled={page === totalViews - 1}
      >›</button>
    </div>
  )

  const spreadHeader = (
    <div className="binder-panel__header">
      <button
        className="btn btn--secondary btn--sm"
        onClick={() => {
          setSelectedBinderId(null)
          onBinderViewChange?.(false)
        }}
      >←</button>
      <span className="binder-panel__swatch" style={{ background: binder.color }} />
      <span className="binder-panel__title">{binder.name}</span>
      <span className="binder-panel__count">{allBinderCards.length} cards</span>
    </div>
  )

  if (fullWidth) {
    const leftSlots = viewSlots.slice(0, 9)
    const rightSlots = viewSlots.slice(9, 18)
    const baseGlobal = page * SLOTS_PER_VIEW

    return (
      <div className="binder-panel binder-panel--spread" data-drop-zone={`binder:${binder.id}`}>
        {spreadHeader}
        <div className="binder-panel__spread-wrap">
          <div className="binder-panel__page">
            <div className="binder-panel__page-wrap">
              <div className={`binder-panel__grid ${flipClass}`.trim()}>
                {leftSlots.map((entry, i) => renderSlot(entry, baseGlobal + i))}
              </div>
            </div>
          </div>
          <div className="binder-panel__spread-divider" />
          <div className="binder-panel__page">
            <div className="binder-panel__page-wrap">
              <div className={`binder-panel__grid ${flipClass}`.trim()}>
                {rightSlots.map((entry, i) => renderSlot(entry, baseGlobal + 9 + i))}
              </div>
            </div>
          </div>
        </div>
        {paginationControls}
      </div>
    )
  }

  // ── Narrow panel (existing behavior) ─────────────────────
  return (
    <div
      className="binder-panel"
      data-drop-zone={`binder:${binder.id}`}
    >
      {spreadHeader}
      <div className="binder-panel__page-wrap">
        <div className={`binder-panel__grid ${flipClass}`.trim()}>
          {Array.from({ length: 9 }, (_, i) => {
            const globalSlot = page * 9 + i
            return renderSlot(viewSlots[i] ?? null, globalSlot)
          })}
        </div>
      </div>
      {paginationControls}
    </div>
  )
}
