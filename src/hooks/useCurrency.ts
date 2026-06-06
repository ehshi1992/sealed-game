import { useApp } from '../context/AppContext'
import { claimDailyReward } from '../lib/queries'

export function useCurrency() {
  const { state, dispatch } = useApp()

  async function claim() {
    if (!state.user) return
    const newCurrency = await claimDailyReward(state.user.id)
    if (newCurrency !== null) {
      dispatch({ type: 'SET_CURRENCY', currency: newCurrency })
    }
  }

  return { currency: state.currency, claim }
}
