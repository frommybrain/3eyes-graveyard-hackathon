'use client'

import { useState } from 'react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getStripePromise } from '../lib/stripeClient'

const appearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#9333ea',
    colorBackground: '#18181b',
    colorText: '#fafafa',
    colorDanger: '#ef4444',
    borderRadius: '12px',
  },
  rules: {
    '.Input': {
      border: '1px solid #3f3f46',
      backgroundColor: '#27272a',
    },
    '.Input:focus': {
      border: '1px solid #9333ea',
    },
  },
}

function PaymentForm({ onSuccess, onCancel, description, amount, currency }) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setProcessing(true)
    setError(null)

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message)
      setProcessing(false)
    } else if (paymentIntent?.status === 'succeeded') {
      onSuccess(paymentIntent.id)
    }
  }

  const symbol = currency === 'gbp' ? '\u00a3' : '$'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center">
        <div className="text-lg font-bold text-white">{description}</div>
        <div className="text-sm text-zinc-400">
          {symbol}{(amount / 100).toFixed(2)} {currency.toUpperCase()}
        </div>
      </div>

      <PaymentElement />

      {error && (
        <div className="text-red-400 text-sm text-center">{error}</div>
      )}

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full rounded-full bg-amber-600 px-6 py-3 text-white font-medium hover:bg-amber-500 transition-colors disabled:opacity-50"
      >
        {processing ? 'Processing...' : 'Pay Now'}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="w-full text-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        Cancel
      </button>
    </form>
  )
}

export default function StripePaymentModal({
  clientSecret,
  onSuccess,
  onCancel,
  description,
  amount,
  currency = 'gbp',
}) {
  if (!clientSecret) return null

  const options = { clientSecret, appearance }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
      <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full mx-4">
        <Elements stripe={getStripePromise()} options={options}>
          <PaymentForm
            onSuccess={onSuccess}
            onCancel={onCancel}
            description={description}
            amount={amount}
            currency={currency}
          />
        </Elements>
      </div>
    </div>
  )
}
