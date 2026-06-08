import { use, Suspense, useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../hooks/useAuth'
import { useCurrency } from '../hooks/useCurrency'
import CurrencyDisplay from '../components/ui/CurrencyDisplay'
import { fetchPacks } from '../lib/queries'
import type { Pack } from '../types'
import './Shop.css'

const packsPromise = fetchPacks()

function PackList() {
  const packs = use(packsPromise)
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const carouselRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  function handleBuy(pack: Pack) {
    if (state.currency < pack.price) return
    dispatch({ type: 'DEDUCT_CURRENCY', amount: pack.price })
    navigate('/pack-opening', { state: { packId: pack.id } })
  }

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return
    const slots = carousel.querySelectorAll<HTMLElement>('.pack-card')
    if (!slots.length) return

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = Array.from(slots).indexOf(entry.target as HTMLElement)
            if (idx !== -1) setActiveIndex(idx)
          }
        })
      },
      { root: carousel, threshold: 0.6 }
    )

    slots.forEach(slot => observer.observe(slot))
    return () => observer.disconnect()
  }, [packs])

  function scrollToIndex(idx: number) {
    const carousel = carouselRef.current
    if (!carousel) return
    const cards = carousel.querySelectorAll<HTMLElement>('.pack-card')
    const card = cards[idx]
    if (!card) return
    card.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' })
  }

  return (
    <div className="shop__carousel-wrap">
      {packs.length > 1 && (
        <button
          className="shop__carousel-arrow"
          onClick={() => scrollToIndex(activeIndex - 1)}
          disabled={activeIndex === 0}
          aria-label="Previous pack"
        >
          ‹
        </button>
      )}

      <div ref={carouselRef} className="shop__carousel">
        {packs.map((pack, i) => (
          <div
            key={pack.id}
            className={`pack-card${activeIndex === i ? ' pack-card--active' : ''}`}
          >
            <div className="pack-card__img-wrap">
              <img src={pack.image_url} alt={pack.name} className="pack-card__img" />
            </div>
            <h3 className="pack-card__name">{pack.name}</h3>
            <p className="pack-card__price">✦ {pack.price}</p>
            <button
              className="btn btn--primary pack-card__buy"
              onClick={() => handleBuy(pack)}
              disabled={state.currency < pack.price}
            >
              {state.currency < pack.price ? 'Not enough ✦' : 'Open Pack'}
            </button>
          </div>
        ))}
      </div>

      {packs.length > 1 && (
        <button
          className="shop__carousel-arrow"
          onClick={() => scrollToIndex(activeIndex + 1)}
          disabled={activeIndex === packs.length - 1}
          aria-label="Next pack"
        >
          ›
        </button>
      )}
    </div>
  )
}

export default function Shop() {
  const { signOut } = useAuth()
  const { claim } = useCurrency()
  const navigate = useNavigate()

  return (
    <div className="shop">
      <header className="shop__header">
        <h1 className="shop__title">Shop</h1>
        <div className="shop__header-right">
          <CurrencyDisplay />
          <button className="btn btn--secondary shop__daily" onClick={claim}>
            Claim Daily ✦50
          </button>
          <button className="btn btn--secondary" onClick={() => navigate('/collection')}>Collection</button>
          <button className="btn btn--secondary" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      <Suspense fallback={<p className="shop__loading">Loading packs…</p>}>
        <PackList />
      </Suspense>
    </div>
  )
}
