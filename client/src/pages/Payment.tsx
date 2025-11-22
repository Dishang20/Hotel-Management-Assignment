import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/store/uiStore'

declare global {
  interface Window {
    Razorpay: any
  }
}

export const Payment = () => {
  const { billId } = useParams<{ billId: string }>()
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('orderId')
  const navigate = useNavigate()
  const { addNotification } = useUIStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'success' | 'failed' | null>(null)

  // Fetch bill details via public Edge Function (bypasses RLS)
  const { data: bill, isLoading, error } = useQuery({
    queryKey: ['bill', billId],
    queryFn: async () => {
      if (!billId) throw new Error('Bill ID is required')
      
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('Supabase configuration missing')
      }

      // Use Edge Function to bypass RLS (uses service role internally)
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/get-bill-for-payment?billId=${billId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch bill' }))
        throw new Error(errorData.error || 'Failed to fetch bill details')
      }

      const data = await response.json()
      return data
    },
    enabled: !!billId,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  // Set payment status to success if bill is already paid
  useEffect(() => {
    if (bill?.paid && paymentStatus !== 'success') {
      setPaymentStatus('success')
    }
  }, [bill?.paid, paymentStatus])

  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  // Don't auto-initiate - let user click the button

  const handlePayment = async () => {
    if (!bill || !orderId) {
      addNotification('Missing bill or order information', 'error')
      return
    }

    // Prevent payment if already paid
    if (bill.paid) {
      addNotification('This bill has already been paid. No payment is required.', 'info')
      setPaymentStatus('success')
      return
    }

    setIsProcessing(true)

    try {
      // Calculate total amount
      const billItems = Array.isArray(bill.bill_items) 
        ? bill.bill_items 
        : (bill.bill_items ? [bill.bill_items] : [])
      
      const subtotal = billItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
      const tax = subtotal * 0.18
      const totalAmount = subtotal + tax

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

      if (!orderId) {
        throw new Error('Order ID is required. Please use the payment link from your email.')
      }

      // Get Razorpay key ID from public endpoint
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const keyResponse = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-get-key`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY || ''}`,
        },
      })

      if (!keyResponse.ok) {
        throw new Error('Failed to get payment gateway details')
      }

      const keyData = await keyResponse.json()

      if (!keyData || !keyData.keyId) {
        throw new Error('Payment gateway not configured')
      }

      const orderData = {
        orderId: orderId,
        keyId: keyData.keyId,
        amount: Math.round(totalAmount * 100), // Convert to paise
        currency: 'INR',
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Hotel Management',
        description: `Bill Payment - ${bill.id.slice(0, 8)}`,
        order_id: orderData.orderId,
        handler: async function (response: any) {
          try {
            setIsProcessing(true)
            
            // Verify payment (public endpoint - uses service role internally)
            const verifyResponse = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-verify-payment`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                billId: bill.id,
                paymentId: response.razorpay_payment_id,
                orderId: response.razorpay_order_id,
                signature: response.razorpay_signature,
              }),
            })

            if (!verifyResponse.ok) {
              const errorData = await verifyResponse.json().catch(() => ({ error: 'Unknown error' }))
              console.error('[Payment] Verification failed:', errorData)
              throw new Error(errorData.error || 'Payment verification failed')
            }

            const result = await verifyResponse.json()

            if (result.success) {
              setPaymentStatus('success')
              addNotification('Payment successful! Your bill has been marked as paid.', 'success')
              
              // Refresh bill data to show updated status
              setTimeout(() => {
                // Invalidate query to refresh bill data
                window.location.reload() // Simple reload to show updated status
              }, 2000)
              
              // Redirect after 5 seconds
              setTimeout(() => {
                navigate('/')
              }, 5000)
            } else {
              throw new Error('Payment verification failed')
            }
          } catch (error) {
            console.error('[Payment] Payment verification error:', error)
            setPaymentStatus('failed')
            addNotification(
              error instanceof Error ? error.message : 'Payment verification failed',
              'error'
            )
          } finally {
            setIsProcessing(false)
          }
        },
        prefill: {
          email: bill.reservations?.guest_email || '',
          name: bill.reservations?.guest_name || '',
        },
        theme: {
          color: '#1877F2',
        },
        modal: {
          ondismiss: function () {
            setIsProcessing(false)
            if (paymentStatus === null) {
              setPaymentStatus('failed')
            }
          },
        },
      }

      if (!window.Razorpay) {
        throw new Error('Razorpay SDK not loaded. Please refresh the page.')
      }

      const razorpay = new window.Razorpay(options)
      razorpay.open()
    } catch (error) {
      console.error('Payment error:', error)
      setPaymentStatus('failed')
      addNotification(
        error instanceof Error ? error.message : 'Failed to initiate payment',
        'error'
      )
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading payment details...</p>
        </div>
      </div>
    )
  }

  if (error || !bill) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="max-w-md w-full">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Payment Error</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {error instanceof Error ? error.message : 'Bill not found or invalid'}
            </p>
            <Button variant="primary" onClick={() => navigate('/')}>
              Go to Home
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // Handle reservation data (could be array or object)
  const reservation = Array.isArray(bill.reservations) 
    ? bill.reservations[0] 
    : bill.reservations

  const billItems = Array.isArray(bill.bill_items) 
    ? bill.bill_items 
    : (bill.bill_items ? [bill.bill_items] : [])

  const subtotal = billItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
  const tax = subtotal * 0.18
  const total = subtotal + tax

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center border-b border-gray-200 dark:border-gray-700 pb-4">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Payment for Bill #{bill.id.slice(0, 8)}
              </h1>
              {bill.paid && (
                <div className="mt-4 p-4 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-bold text-lg">Payment Already Completed</p>
                  </div>
                  <p className="text-sm">This bill has already been paid successfully.</p>
                  {bill.razorpay_payment_id && (
                    <p className="text-xs mt-2 opacity-75">
                      Payment ID: {bill.razorpay_payment_id}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Guest Information */}
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Guest Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Guest Name</p>
                  <p className="font-medium text-gray-900 dark:text-white">{reservation?.guest_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                  <p className="font-medium text-gray-900 dark:text-white">{reservation?.guest_email || 'N/A'}</p>
                </div>
                {reservation?.check_in && reservation?.check_out && (
                  <>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Check-in</p>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {new Date(reservation.check_in).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Check-out</p>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {new Date(reservation.check_out).toLocaleDateString()}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Bill Items */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Bill Items</h2>
              <div className="space-y-2">
                {billItems.map((item: any, index: number) => (
                  <div
                    key={item.id || index}
                    className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <span className="text-gray-700 dark:text-gray-300">{item.description}</span>
                    <span className="font-medium text-gray-900 dark:text-white">₹{Number(item.amount || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
              <div className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>Subtotal:</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>Tax (18%):</span>
                <span>₹{tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-blue-600 dark:text-blue-400 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span>Total Amount:</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Status */}
            {paymentStatus === 'success' && !bill.paid && (
              <div className="p-4 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-lg text-center">
                <p className="font-semibold">✓ Payment Successful!</p>
                <p className="text-sm mt-1">Your bill has been marked as paid. Redirecting...</p>
              </div>
            )}

            {paymentStatus === 'failed' && (
              <div className="p-4 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-center">
                <p className="font-semibold">✗ Payment Failed</p>
                <p className="text-sm mt-1">Please try again or contact support.</p>
              </div>
            )}

            {/* Already Paid Message - Prominent */}
            {bill.paid && (
              <div className="p-6 bg-green-50 dark:bg-green-900/30 border-2 border-green-500 dark:border-green-600 rounded-lg text-center">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-xl font-bold text-green-800 dark:text-green-200">
                    Payment Already Completed
                  </h3>
                </div>
                <p className="text-green-700 dark:text-green-300 mb-2">
                  This bill has already been paid successfully.
                </p>
                {bill.razorpay_payment_id && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                    Payment ID: <span className="font-mono">{bill.razorpay_payment_id}</span>
                  </p>
                )}
                {bill.updated_at && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Paid on: {new Date(bill.updated_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {/* Payment Button */}
            {!bill.paid && paymentStatus !== 'success' && (
              <div className="flex gap-4">
                <Button
                  variant="primary"
                  onClick={handlePayment}
                  isLoading={isProcessing}
                  disabled={isProcessing || !orderId}
                  className="flex-1"
                >
                  {isProcessing ? 'Processing...' : 'Pay Now'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Already Paid - Show Home Button */}
            {bill.paid && (
              <div className="space-y-3">
                <Button
                  variant="primary"
                  onClick={() => navigate('/')}
                  className="w-full"
                >
                  Go to Home
                </Button>
                <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                  No further payment is required for this bill.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

