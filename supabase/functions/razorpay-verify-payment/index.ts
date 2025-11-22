import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts'
import { sendEmailViaSMTP } from '../_shared/smtp.ts'
import { generateInvoicePDF } from '../_shared/pdfGenerator.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { billId, paymentId, orderId, signature } = await req.json()

    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
    if (!razorpayKeySecret) {
      throw new Error('Razorpay credentials not configured')
    }

    // Verify payment signature
    const text = `${orderId}|${paymentId}`
    const generatedSignature = createHmac('sha256', razorpayKeySecret)
      .update(text)
      .digest('hex')

    if (generatedSignature !== signature) {
      throw new Error('Invalid payment signature')
    }

    // Verify payment with Razorpay
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')
    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
      },
    })

    if (!paymentResponse.ok) {
      throw new Error('Payment verification failed')
    }

    const paymentData = await paymentResponse.json()

    if (paymentData.status !== 'authorized' && paymentData.status !== 'captured') {
      throw new Error('Payment not successful')
    }

    // Check if bill is already paid (idempotency)
    const { data: existingBill } = await supabaseClient
      .from('bills')
      .select('id, paid, status, razorpay_payment_id')
      .eq('id', billId)
      .single()

    if (!existingBill) {
      throw new Error('Bill not found')
    }

    // If already paid with same payment ID, return success
    if (existingBill.paid && existingBill.razorpay_payment_id === paymentId) {
      console.log('Bill already marked as paid with this payment ID')
      return new Response(
        JSON.stringify({
          success: true,
          paymentId,
          orderId,
          message: 'Bill already paid',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Update bill as paid
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
      throw new Error(`Failed to update bill: ${updateError.message}`)
    }

    if (!updatedBill) {
      throw new Error('Bill update returned no data')
    }

    console.log('Bill successfully updated as paid:', updatedBill.id)

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

          console.log('Invoice email sent successfully')
        } else {
          console.warn('Guest email not found for bill:', billId)
        }
      }
    } catch (emailError) {
      console.error('Error sending invoice email:', emailError)
      // Don't fail the payment verification if email fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        paymentId,
        orderId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

