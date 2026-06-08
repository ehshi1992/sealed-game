import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import CurrencyDisplay from '../ui/CurrencyDisplay'
import './AppLayout.css'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth()
  const { claim } = useCurrency()
  const navigate = useNavigate()

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar__brand">Sealed</div>
        <CurrencyDisplay />
        <ul className="sidebar__nav">
          <li>
            <NavLink to="/shop" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
              Shop
            </NavLink>
          </li>
          <li>
            <NavLink to="/collection" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
              Collection
            </NavLink>
          </li>
        </ul>
        <div className="sidebar__bottom">
          <button className="btn btn--secondary btn--sm sidebar__claim" onClick={claim}>
            Claim Daily ✦50
          </button>
          <button className="btn btn--secondary btn--sm" onClick={signOut}>Sign Out</button>
          <button className="btn sidebar__open-pack" onClick={() => navigate('/shop')}>
            Open Pack
          </button>
        </div>
      </nav>
      <main className="app-layout__content">
        {children}
      </main>
    </div>
  )
}
