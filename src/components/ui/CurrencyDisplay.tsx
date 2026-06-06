import { useApp } from '../../context/AppContext'

export default function CurrencyDisplay() {
  const { state } = useApp()
  return (
    <div className="currency-display">
      <span className="currency-display__icon">✦</span>
      <span className="currency-display__amount">{state.currency}</span>
    </div>
  )
}
