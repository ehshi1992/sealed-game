import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Home from './routes/Home'
import Shop from './routes/Shop'
import PackOpening from './routes/PackOpening'
import Collection from './routes/Collection'
import HoloTest from './routes/HoloTest'
import PolygonTest from './routes/PolygonTest'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { state } = useApp()
  if (!state.user) return <Navigate to="/" replace />
  return <>{children}</>
}

function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<AuthGuard><Shop /></AuthGuard>} />
        <Route path="/pack-opening" element={<AuthGuard><PackOpening /></AuthGuard>} />
        <Route path="/collection" element={<AuthGuard><Collection /></AuthGuard>} />
        <Route path="/holo-test" element={<HoloTest />} />
        <Route path="/polygon-test" element={<PolygonTest />} />
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  )
}
