import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmailViaSMTP } from '../_shared/smtp.ts'

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

    const { billId, recipientEmail, paymentLink } = await req.json()

    if (!billId) {
      throw new Error('Bill ID is required')
    }

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      throw new Error('Valid recipient email is required')
    }

    if (!paymentLink) {
      throw new Error('Payment link is required')
    }

    // Fetch bill data
    const { data: bill, error: billError } = await supabaseClient
      .from('bills')
      .select(`
        *,
        reservations (
          id,
          guest_name,
          guest_email,
          guest_phone,
          check_in,
          check_out
        ),
        bill_items (*)
      `)
      .eq('id', billId)
      .single()

    if (billError || !bill) {
      throw new Error(`Bill not found: ${billError?.message || 'Invalid bill ID'}`)
    }

    const reservation = Array.isArray(bill.reservations) 
      ? bill.reservations[0] 
      : bill.reservations

    if (!reservation) {
      throw new Error('Reservation data not found for this bill')
    }

    const billItems = Array.isArray(bill.bill_items) 
      ? bill.bill_items 
      : (bill.bill_items ? [bill.bill_items] : [])

    const subtotal = billItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
    const tax = subtotal * 0.18
    const total = subtotal + tax

    // Send email using Gmail SMTP
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1877F2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { display: inline-block; padding: 12px 24px; background: #1877F2; color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; }
            .bill-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .bill-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            .total { font-size: 18px; font-weight: bold; margin-top: 10px; padding-top: 10px; border-top: 2px solid #1877F2; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Hotel Payment Request</h1>
            </div>
            <div class="content">
              <p>Dear ${(reservation?.guest_name || 'Guest').replace(/</g, '&lt;').replace(/>/g, '&gt;')},</p>
              <p>Thank you for staying with us. Please complete your payment using the link below:</p>
              
              <div class="bill-details">
                <h3>Bill Summary</h3>
                <p><strong>Bill ID:</strong> ${bill.id.slice(0, 8)}</p>
                <p><strong>Check-in:</strong> ${reservation?.check_in ? new Date(reservation.check_in).toLocaleDateString('en-IN') : 'N/A'}</p>
                <p><strong>Check-out:</strong> ${reservation?.check_out ? new Date(reservation.check_out).toLocaleDateString('en-IN') : 'N/A'}</p>
                
                <div style="margin-top: 15px;">
                  ${billItems.map((item: any) => `
                    <div class="bill-item">
                      <span>${(item.description || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                      <span>₹${Number(item.amount || 0).toFixed(2)}</span>
                    </div>
                  `).join('')}
                </div>
                
                <div style="margin-top: 15px;">
                  <div class="bill-item">
                    <span>Subtotal:</span>
                    <span>₹${subtotal.toFixed(2)}</span>
                  </div>
                  <div class="bill-item">
                    <span>Tax (18%):</span>
                    <span>₹${tax.toFixed(2)}</span>
                  </div>
                  <div class="total">
                    <span>Total Amount:</span>
                    <span>₹${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${paymentLink}" class="button">Pay Now</a>
              </div>

              <p style="margin-top: 20px;">Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; color: #1877F2;">${paymentLink}</p>

              <p style="margin-top: 20px;">If you have any questions, please contact us.</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `

    // Get SMTP configuration
    const smtpFrom = Deno.env.get('SMTP_FROM') || 'Hotel Management <your-email@gmail.com>'
    
    // Send email via SMTP
    const emailResult = await sendEmailViaSMTP({
      from: smtpFrom,
      to: recipientEmail,
      subject: `Payment Request - Bill #${bill.id.slice(0, 8)}`,
      html: emailHtml,
    })

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult.messageId }),
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

