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
import { fetchProfile, fetchCollection, fetchBinders } from '../lib/queries'

const initialState: AppState = {
  user: null,
  currency: 0,
  collection: [],
  binders: [],
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
    case 'REMOVE_CARD': {
      const entry = state.collection.find(e => e.card_id === action.cardId)
      if (!entry) return state
      if (action.quantity >= entry.count) {
        return { ...state, collection: state.collection.filter(e => e.card_id !== action.cardId) }
      }
      return {
        ...state,
        collection: state.collection.map(e =>
          e.card_id === action.cardId ? { ...e, count: e.count - action.quantity } : e
        ),
      }
    }
    case 'SET_BINDERS':
      return { ...state, binders: action.binders }
    case 'ADD_BINDER':
      return { ...state, binders: [action.binder, ...state.binders] }
    case 'UPDATE_BINDER':
      return { ...state, binders: state.binders.map(b => b.id === action.binder.id ? action.binder : b) }
    case 'DELETE_BINDER':
      return {
        ...state,
        binders: state.binders.filter(b => b.id !== action.binderId),
        collection: state.collection.map(e =>
          e.binder_id === action.binderId ? { ...e, binder_id: null } : e
        ),
      }
    case 'MOVE_CARD':
      return {
        ...state,
        collection: state.collection.map(e =>
          e.id === action.entryId ? { ...e, binder_id: action.binderId } : e
        ),
      }
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
    const [profile, collection, binders] = await Promise.all([
      fetchProfile(user.id),
      fetchCollection(user.id),
      fetchBinders(user.id),
    ])
    if (profile) dispatch({ type: 'SET_CURRENCY', currency: profile.currency })
    dispatch({ type: 'SET_COLLECTION', collection })
    dispatch({ type: 'SET_BINDERS', binders })
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
