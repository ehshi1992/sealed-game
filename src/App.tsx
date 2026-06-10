import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import AppLayout from './components/AppLayout/AppLayout'
import Home from './routes/Home'
import Shop from './routes/Shop'
import PackOpening from './routes/PackOpening'
import Collection from './routes/Collection'
import HoloTest from './routes/HoloTest'
import PolygonTest from './routes/PolygonTest'
import PackTearTest from './routes/PackTearTest'

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
        <Route path="/shop" element={<AuthGuard><AppLayout><Shop /></AppLayout></AuthGuard>} />
        <Route path="/pack-opening" element={<AuthGuard><PackOpening /></AuthGuard>} />
        <Route path="/collection" element={<AuthGuard><AppLayout><Collection /></AppLayout></AuthGuard>} />
        <Route path="/holo-test" element={<HoloTest />} />
        <Route path="/polygon-test" element={<PolygonTest />} />
        <Route path="/pack-tear-test" element={<PackTearTest />} />
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
