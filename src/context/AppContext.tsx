import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import type { AppState, AppAction } from '../types'
import { supabase } from '../lib/supabase'
import { fetchProfile, fetchCollection } from '../lib/queries'

const initialState: AppState = {
  user: null,
  currency: 0,
  collection: [],
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.user }
    case 'SET_CURRENCY':
      return { ...state, currency: action.currency }
    case 'DEDUCT_CURRENCY':
      return { ...state, currency: Math.max(0, state.currency - action.amount) }
    case 'SET_COLLECTION':
      return { ...state, collection: action.collection }
    case 'ADD_CARDS':
      return { ...state, collection: [...action.cards, ...state.collection] }
    default:
      return state
  }
}

type AppContextValue = {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null
      dispatch({ type: 'SET_USER', user })
      if (user) loadUserData(user)
    }).catch(() => {})

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const user = session?.user ?? null
        dispatch({ type: 'SET_USER', user })
        if (user) loadUserData(user)
        else dispatch({ type: 'SET_COLLECTION', collection: [] })
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadUserData(user: User) {
    const [profile, collection] = await Promise.all([
      fetchProfile(user.id),
      fetchCollection(user.id),
    ])
    if (profile) dispatch({ type: 'SET_CURRENCY', currency: profile.currency })
    dispatch({ type: 'SET_COLLECTION', collection })
  }

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
