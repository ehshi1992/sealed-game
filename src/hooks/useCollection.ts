import { useApp } from '../context/AppContext'

export function useCollection() {
  const { state } = useApp()
  return { collection: state.collection }
}
