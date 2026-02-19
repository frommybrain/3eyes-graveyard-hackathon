'use client'

import { useState } from 'react'
import { gameConfig } from '../config/gameConfig'

export default function PrintOrderButton({ wallet, mintAddress, imageUrl, sessionId }) {
  const [loading, setLoading] = useState(false)
  const [ordered, setOrdered] = useState(false)

  if (!gameConfig.prints.enabled) return null

  const priceLabel = gameConfig.prints.priceGBP > 0
    ? `Order Physical Print (£${gameConfig.prints.priceGBP})`
    : 'Order Physical Print (Free)'

  const handleOrder = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/print-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, mintAddress, imageUrl, sessionId }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)

      // Redirect to Stripe Checkout for address collection
      window.location.href = data.checkoutUrl
    } catch (err) {
      console.error('Print order failed:', err)
      setLoading(false)
    }
  }

  if (ordered) {
    return (
      <div className="text-sm text-emerald-400 font-medium">
        Print ordered!
      </div>
    )
  }

  return (
    <button
      onClick={handleOrder}
      disabled={loading}
      className="w-full rounded-full bg-emerald-700 px-6 py-2 text-white text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
    >
      {loading ? 'Redirecting...' : priceLabel}
    </button>
  )
}
