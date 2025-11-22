import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

    const { billId, recipientEmail } = await req.json()

    if (!billId) {
      throw new Error('Bill ID is required')
    }

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      throw new Error('Valid recipient email is required')
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
          check_out,
          status
        ),
        bill_items (*)
      `)
      .eq('id', billId)
      .single()

    if (billError) {
      console.error('Bill fetch error:', billError)
      throw new Error(`Bill not found: ${billError.message}`)
    }

    if (!bill) {
      throw new Error('Bill not found: Invalid bill ID')
    }

    // Handle case where reservation might be an array or object
    let reservation: any = null
    if (Array.isArray(bill.reservations)) {
      reservation = bill.reservations[0]
    } else if (bill.reservations) {
      reservation = bill.reservations
    }

    if (!reservation) {
      throw new Error('Reservation data not found for this bill')
    }

    // Handle bill_items - might be array or object
    const billItems = Array.isArray(bill.bill_items) 
      ? bill.bill_items 
      : (bill.bill_items ? [bill.bill_items] : [])

    // Calculate totals from bill items
    const subtotal = billItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
    const tax = subtotal * 0.18
    const totalAmount = subtotal + tax

    // Generate PDF invoice for attachment - MUST succeed before sending email
    console.log('Generating PDF invoice for bill:', bill.id)
    const invoiceData = {
      billId: bill.id,
      guestName: reservation?.guest_name || 'N/A',
      guestEmail: reservation?.guest_email || 'N/A',
      guestPhone: reservation?.guest_phone || 'N/A',
      invoiceDate: new Date(bill.created_at).toLocaleDateString('en-IN', {
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
      paid: bill.paid || false,
      paymentId: bill.razorpay_payment_id || undefined,
    }

    let pdfAttachment: Uint8Array
    try {
      pdfAttachment = await generateInvoicePDF(invoiceData)
      console.log('PDF invoice generated successfully, size:', pdfAttachment.length, 'bytes')
    } catch (error) {
      console.error('Error generating PDF invoice:', error)
      throw new Error(`Failed to generate PDF invoice: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    if (!pdfAttachment || pdfAttachment.length === 0) {
      throw new Error('PDF generation returned empty result')
    }

    // Generate invoice HTML for email body (simplified version)
    const invoiceHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: Arial, sans-serif; padding: 40px; background: #ffffff; color: #333; }
              .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #1877F2; padding-bottom: 20px; }
              .header h1 { color: #1877F2; margin: 0; font-size: 32px; font-weight: bold; }
              .header p { margin-top: 10px; font-size: 16px; color: #666; }
              .bill-info { margin-bottom: 30px; background: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #e0e0e0; }
              .bill-info p { margin: 8px 0; font-size: 14px; }
              .bill-info strong { color: #333; min-width: 120px; display: inline-block; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 30px; margin-top: 20px; }
              th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
              th { background-color: #1877F2; color: white; font-weight: bold; }
              tr:hover { background-color: #f5f5f5; }
              .total-section { margin-top: 30px; padding-top: 20px; border-top: 2px solid #ddd; }
              .total-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
              .total-final { font-size: 20px; font-weight: bold; padding-top: 10px; border-top: 1px solid #ddd; color: #1877F2; }
              .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; padding-top: 20px; border-top: 1px solid #e0e0e0; }
              .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-left: 10px; }
              .status-paid { background-color: #d4edda; color: #155724; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Hotel Invoice</h1>
              <p>Invoice #${bill.id.slice(0, 8)}</p>
            </div>
            <div class="bill-info">
              <p><strong>Guest Name:</strong> ${(reservation?.guest_name || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
              <p><strong>Email:</strong> ${(reservation?.guest_email || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
              <p><strong>Phone:</strong> ${(reservation?.guest_phone || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
              <p><strong>Invoice Date:</strong> ${new Date(bill.created_at).toLocaleDateString('en-IN', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</p>
              ${reservation?.check_in && reservation?.check_out ? `
              <p><strong>Check-in:</strong> ${new Date(reservation.check_in).toLocaleDateString('en-IN')}</p>
              <p><strong>Check-out:</strong> ${new Date(reservation.check_out).toLocaleDateString('en-IN')}</p>
              ` : ''}
              ${bill.paid ? `<p><strong>Payment Status:</strong> <span class="status-badge status-paid">Paid</span></p>` : ''}
              ${bill.razorpay_payment_id ? `<p><strong>Payment ID:</strong> ${bill.razorpay_payment_id}</p>` : ''}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th style="text-align: right;">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${billItems && billItems.length > 0
                  ? billItems.map((item: any) => `
                      <tr>
                        <td>${(item.description || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                        <td style="text-align: right;">₹${Number(item.amount || 0).toFixed(2)}</td>
                      </tr>
                    `).join('')
                  : '<tr><td colspan="2" style="text-align: center; padding: 20px; color: #666;">No items</td></tr>'}
              </tbody>
            </table>
            <div class="total-section">
              <div class="total-row">
                <strong>Subtotal:</strong>
                <span>₹${subtotal.toFixed(2)}</span>
              </div>
              <div class="total-row">
                <strong>Tax (18%):</strong>
                <span>₹${tax.toFixed(2)}</span>
              </div>
              <div class="total-row total-final">
                <strong>Total Amount:</strong>
                <span>₹${totalAmount.toFixed(2)}</span>
              </div>
            </div>
            <div class="footer">
              <p>Thank you for your business!</p>
              <p>This is a computer-generated invoice.</p>
            </div>
          </body>
        </html>
      `

    // Send email using Gmail SMTP
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
            .button { display: inline-block; padding: 12px 24px; background: #1877F2; color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Hotel Invoice</h1>
            </div>
            <div class="content">
            <p>Dear ${(reservation?.guest_name || 'Guest').replace(/</g, '&lt;').replace(/>/g, '&gt;')},</p>
            <p>Thank you for staying with us. Please find your invoice details below:</p>
            <p><strong>Invoice #:</strong> ${bill.id.slice(0, 8)}</p>
            <p><strong>Subtotal:</strong> ₹${subtotal.toFixed(2)}</p>
            <p><strong>Tax (18%):</strong> ₹${tax.toFixed(2)}</p>
            <p><strong>Total Amount:</strong> ₹${totalAmount.toFixed(2)}</p>
            <p><strong>Date:</strong> ${new Date(bill.created_at).toLocaleDateString('en-IN', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</p>
            ${reservation?.check_in && reservation?.check_out ? `
            <p><strong>Check-in:</strong> ${new Date(reservation.check_in).toLocaleDateString('en-IN')}</p>
            <p><strong>Check-out:</strong> ${new Date(reservation.check_out).toLocaleDateString('en-IN')}</p>
            ` : ''}
            ${bill.paid ? `<p><strong>Payment Status:</strong> <span style="color: green; font-weight: bold;">Paid</span></p>` : ''}
            ${bill.razorpay_payment_id ? `<p><strong>Payment ID:</strong> ${bill.razorpay_payment_id}</p>` : ''}
            <p>Please find your invoice attached as a PDF.</p>
            <p>If you have any questions, please contact us.</p>
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
    
    // Prepare attachments - PDF is required
    const attachments = [{
      filename: `invoice-${bill.id.slice(0, 8)}.pdf`,
      content: pdfAttachment,
      contentType: 'application/pdf',
    }]
    
    console.log('Sending email with PDF attachment to:', recipientEmail)
    
    // Send email via SMTP with PDF attachment
    const emailResult = await sendEmailViaSMTP({
      from: smtpFrom,
      to: recipientEmail,
      subject: `Your Hotel Invoice #${bill.id.slice(0, 8)}`,
      html: emailHtml,
      attachments: attachments,
    })
    
    console.log('Email sent successfully:', emailResult.messageId)

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

