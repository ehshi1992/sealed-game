import { useState, useEffect, useRef, useOptimistic, startTransition } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import PackRip from '../components/PackRip/PackRip'
import { supabase } from '../lib/supabase'
import { fetchCollection } from '../lib/queries'
import type { Card, PackOpenResult } from '../types'

type PageState = 'loading' | 'ready' | 'error'

export default function PackOpening() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state, dispatch } = useApp()
  const packId = (location.state as { packId: string } | null)?.packId

  const [cards, setCards] = useState<Card[]>([])
  const [packImageUrl] = useState('https://images.pokemontcg.io/base1/logo.png')
  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  const [optimisticCards, addOptimisticCards] = useOptimistic(
    cards,
    (_state: Card[], newCards: Card[]) => newCards
  )

  const calledRef = useRef(false)
  useEffect(() => {
    if (!packId) { navigate('/shop'); return }
    if (calledRef.current) return
    calledRef.current = true
    openPack()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openPack() {
    try {
      const { data, error } = await supabase.functions.invoke<PackOpenResult>('open-pack', {
        body: { packId },
      })
      if (error || !data) throw error ?? new Error('No data returned')

      startTransition(() => {
        addOptimisticCards(data.cards)
        setCards(data.cards)
        dispatch({ type: 'SET_CURRENCY', currency: data.newCurrency })
      })
      setPageState('ready')
    } catch (err) {
      setErrorMsg(String(err))
      setPageState('error')
    }
  }

  async function handleComplete() {
    if (!state.user) return
    const collection = await fetchCollection(state.user.id)
    dispatch({ type: 'SET_COLLECTION', collection })
    navigate('/collection')
  }

  if (pageState === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
        <div className="spinner" />
        <p style={{ color: 'var(--text-muted)' }}>Preparing your pack…</p>
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
        <p style={{ color: '#ef4444' }}>{errorMsg}</p>
        <button className="btn btn--secondary" onClick={() => navigate('/shop')}>Back to Shop</button>
      </div>
    )
  }

  return (
    <PackRip
      packImageUrl={packImageUrl}
      cards={optimisticCards}
      onComplete={handleComplete}
    />
  )
}
