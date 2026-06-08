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

  const [featured, ...rest] = packs

  return (
    <>
      {featured && (
        <div className="shop__hero">
          <img src={featured.image_url} alt="" className="shop__hero-bg" aria-hidden="true" />
          <div className="shop__hero-content">
            <div className="shop__hero-info">
              <h2 className="shop__hero-name">{featured.name}</h2>
              <p className="shop__hero-price">✦ {featured.price}</p>
            </div>
            <button
              className="btn btn--primary"
              onClick={() => handleBuy(featured)}
              disabled={state.currency < featured.price}
            >
              {state.currency < featured.price ? 'Not enough ✦' : 'Open Pack'}
            </button>
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <section>
          <h3 className="shop__section-title">All Packs</h3>
          <div className="shop__grid">
            {rest.map(pack => (
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
      )}
    </>
  )
}

export default function Shop() {
  return (
    <div className="shop">
      <Suspense fallback={<p className="shop__loading">Loading packs…</p>}>
        <PackList />
      </Suspense>
    </div>
  )
}
