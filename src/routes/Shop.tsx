import { use, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { fetchPacks } from '../lib/queries'
import type { Pack } from '../types'
import './Shop.css'

const packsPromise = fetchPacks()

function PackList() {
  const packs = use(packsPromise)
  const { state, dispatch } = useApp()
  const navigate = useNavigate()

  function handleBuy(pack: Pack) {
    if (state.currency < pack.price) return
    dispatch({ type: 'DEDUCT_CURRENCY', amount: pack.price })
    navigate('/pack-opening', { state: { packId: pack.id } })
  }

  return (
    <section>
      <h3 className="shop__section-title">All Packs</h3>
      <div className="shop__grid">
        {packs.map(pack => (
          <div key={pack.id} className="pack-card">
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
    </section>
  )
}

export default function Shop() {
  return (
    <div className="shop">
      <div className="shop__banner">
        <video
          className="shop__banner-bg"
          autoPlay
          muted
          loop
          playsInline
          poster="/cards/hero-poster.jpg"
          aria-hidden="true"
        >
          <source src="/cards/hero-montage.mp4" type="video/mp4" />
        </video>
        <h1 className="shop__banner-title">Good luck degenerate</h1>
      </div>
      <Suspense fallback={<p className="shop__loading">Loading packs…</p>}>
        <PackList />
      </Suspense>
    </div>
  )
}
