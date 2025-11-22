import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts'
import { sendEmailViaSMTP } from '../_shared/smtp.ts'
import { generateInvoicePDF } from '../_shared/pdfGenerator.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
    if (!razorpayKeySecret) {
      throw new Error('Razorpay credentials not configured')
    }

    // Get webhook signature from headers
    const webhookSignature = req.headers.get('x-razorpay-signature')
    if (!webhookSignature) {
      throw new Error('Missing webhook signature')
    }

    // Get raw body for signature verification
    const rawBody = await req.text()
    
    // Verify webhook signature
    const expectedSignature = createHmac('sha256', razorpayKeySecret)
      .update(rawBody)
      .digest('hex')

    if (webhookSignature !== expectedSignature) {
      console.error('Invalid webhook signature')
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody)
    const event = payload.event
    const payment = payload.payload?.payment?.entity || payload.payload?.payment

    if (!event || !payment) {
      throw new Error('Invalid webhook payload')
    }

    console.log('Razorpay webhook event:', event, 'Payment ID:', payment.id)

    // Handle payment.captured event
    if (event === 'payment.captured' || event === 'payment.authorized') {
      const paymentId = payment.id
      const orderId = payment.order_id
      const amount = payment.amount / 100 // Convert from paise to rupees
      const status = payment.status
      const orderNotes = payment.notes || {}

      console.log('Processing payment webhook:', { paymentId, orderId, amount, status, notes: orderNotes })

      // Try to get bill_id from order notes first (most reliable)
      let billId: string | null = orderNotes.bill_id || null

      // If not in notes, try to find by payment_id
      if (!billId) {
        const { data: existingBill } = await supabaseClient
          .from('bills')
          .select('id, paid, status')
          .eq('razorpay_payment_id', paymentId)
          .single()

        if (existingBill) {
          billId = existingBill.id
          console.log('Found bill by payment_id:', billId)
        }
      }

      // If still not found, try to find by matching amount and unpaid status
      if (!billId) {
        console.log('Searching for bill by amount match...')
        const { data: bills } = await supabaseClient
          .from('bills')
          .select('id, total_amount, paid')
          .eq('paid', false)
          .order('created_at', { ascending: false })
          .limit(50) // Increased limit for better matching

        if (bills) {
          const matchingBill = bills.find((bill: any) => {
            const subtotal = bill.total_amount || 0
            const tax = subtotal * 0.18
            const total = subtotal + tax
            // Allow small difference due to rounding (within 5 rupees)
            return Math.abs(total - amount) < 5
          })

          if (matchingBill) {
            billId = matchingBill.id
            console.log('Found bill by amount match:', billId)
          }
        }
      }

      if (!billId) {
        console.error('Bill not found for payment:', { paymentId, orderId, amount })
        // Still return success to Razorpay to avoid retries
        return new Response(
          JSON.stringify({ received: true, message: 'Bill not found' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Check if bill is already paid (idempotency)
      const { data: currentBill } = await supabaseClient
        .from('bills')
        .select('id, paid, status, razorpay_payment_id')
        .eq('id', billId)
        .single()

      if (currentBill?.paid && currentBill.razorpay_payment_id === paymentId) {
        console.log('Bill already marked as paid with this payment ID:', billId)
        return new Response(
          JSON.stringify({ received: true, message: 'Bill already paid' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Update bill as paid
      if (status === 'captured' || status === 'authorized') {
        console.log('Updating bill as paid:', billId, 'Payment ID:', paymentId)
        const { data: updatedBill, error: updateError } = await supabaseClient
          .from('bills')
          .update({
            paid: true,
            status: 'paid',
            razorpay_payment_id: paymentId,
          })
          .eq('id', billId)
          .select()
          .single()

        if (updateError) {
          console.error('Error updating bill:', updateError)
          throw updateError
        }

        if (!updatedBill) {
          throw new Error('Bill update returned no data')
        }

        console.log('Bill successfully updated as paid via webhook:', updatedBill.id)

        // Automatically send invoice email after successful payment
        try {
          // Fetch full bill data with reservation and items
          const { data: billData, error: billError } = await supabaseClient
            .from('bills')
            .select(`
              *,
              reservations (
                id,
                guest_name,
                guest_email,
                guest_phone,
                check_in,
                check_out,
                status
              ),
              bill_items (*)
            `)
            .eq('id', billId)
            .single()

          if (billError || !billData) {
            console.warn('Could not fetch bill data for email:', billError?.message)
            // Continue without sending email
          } else {
            // Handle case where reservation might be an array or object
            let reservation: any = null
            if (Array.isArray(billData.reservations)) {
              reservation = billData.reservations[0]
            } else if (billData.reservations) {
              reservation = billData.reservations
            }

            if (reservation?.guest_email) {
              console.log('Sending invoice email to:', reservation.guest_email)
              
              // Handle bill_items - might be array or object
              const billItems = Array.isArray(billData.bill_items) 
                ? billData.bill_items 
                : (billData.bill_items ? [billData.bill_items] : [])

              // Calculate totals
              const subtotal = billItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
              const tax = subtotal * 0.18
              const totalAmount = subtotal + tax

              // Generate PDF invoice
              const invoiceData = {
                billId: billData.id,
                guestName: reservation?.guest_name || 'N/A',
                guestEmail: reservation?.guest_email || 'N/A',
                guestPhone: reservation?.guest_phone || 'N/A',
                invoiceDate: new Date(billData.created_at).toLocaleDateString('en-IN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }),
                checkIn: reservation?.check_in 
                  ? new Date(reservation.check_in).toLocaleDateString('en-IN')
                  : undefined,
                checkOut: reservation?.check_out
                  ? new Date(reservation.check_out).toLocaleDateString('en-IN')
                  : undefined,
                billItems: billItems.map((item: any) => ({
                  description: item.description || 'N/A',
                  amount: Number(item.amount || 0),
                })),
                subtotal,
                tax,
                total: totalAmount,
                paid: true,
                paymentId: paymentId,
              }

              const pdfAttachment = await generateInvoicePDF(invoiceData)

              // Generate email HTML
              const emailHtml = `
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="UTF-8">
                    <style>
                      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                      .header { background: #1877F2; color: white; padding: 20px; text-align: center; }
                      .content { padding: 20px; background: #f9f9f9; }
                      .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="header">
                        <h1>Payment Confirmed - Invoice</h1>
                      </div>
                      <div class="content">
                        <p>Dear ${(reservation?.guest_name || 'Guest').replace(/</g, '&lt;').replace(/>/g, '&gt;')},</p>
                        <p>Your payment has been successfully processed. Please find your invoice attached.</p>
                        <p><strong>Invoice #:</strong> ${billData.id.slice(0, 8)}</p>
                        <p><strong>Payment ID:</strong> ${paymentId}</p>
                        <p><strong>Total Amount:</strong> ₹${totalAmount.toFixed(2)}</p>
                        <p>Thank you for your business!</p>
                      </div>
                      <div class="footer">
                        <p>This is an automated email. Please do not reply.</p>
                      </div>
                    </div>
                  </body>
                </html>
              `

              // Send email via SMTP
              const smtpFrom = Deno.env.get('SMTP_FROM') || 'Hotel Management <your-email@gmail.com>'
              await sendEmailViaSMTP({
                from: smtpFrom,
                to: reservation.guest_email,
                subject: `Payment Confirmed - Invoice #${billData.id.slice(0, 8)}`,
                html: emailHtml,
                attachments: [{
                  filename: `invoice-${billData.id.slice(0, 8)}.pdf`,
                  content: pdfAttachment,
                  contentType: 'application/pdf',
                }],
              })

              console.log('Invoice email sent successfully via webhook')
            } else {
              console.warn('Guest email not found for bill:', billId)
            }
          }
        } catch (emailError) {
          console.error('Error sending invoice email via webhook:', emailError)
          // Don't fail the webhook if email fails
        }
      }
    }

    // Return success to Razorpay
    return new Response(
      JSON.stringify({ received: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

