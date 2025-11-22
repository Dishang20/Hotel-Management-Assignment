import { supabase } from '@/lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export const paymentsApi = {
  createRazorpayOrder: async (billId: string, amount: number) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) throw new Error('Not authenticated')

    const response = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ billId, amount }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create order')
    }

    return await response.json()
  },

  verifyPayment: async (
    billId: string,
    paymentId: string,
    orderId: string,
    signature: string
  ) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) throw new Error('Not authenticated')

    const response = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ billId, paymentId, orderId, signature }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Payment verification failed')
    }

    return await response.json()
  },

  sendPaymentLinkEmail: async (billId: string, recipientEmail: string, paymentLink: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) throw new Error('Not authenticated')

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-payment-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ billId, recipientEmail, paymentLink }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to send payment link')
    }

    return await response.json()
  },
}

