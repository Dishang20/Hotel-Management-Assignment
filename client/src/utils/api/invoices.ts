import { supabase } from '@/lib/supabase'
import { billsApi } from './bills'
import { generateInvoiceHTML } from '../invoiceGenerator'
import { generatePDFFromHTMLString } from '../pdfGenerator'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export const invoicesApi = {
  /**
   * Generate and download PDF invoice client-side
   */
  generate: async (billId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) throw new Error('Not authenticated')

    // Fetch bill data
    const bill = await billsApi.getById(billId)
    
    // Generate HTML
    const html = generateInvoiceHTML(bill)
    
    // Generate filename
    const filename = `invoice-${billId.slice(0, 8)}-${Date.now()}.pdf`
    
    // Convert HTML to PDF and download
    await generatePDFFromHTMLString(html, filename, {
      format: 'a4',
      orientation: 'portrait',
      margin: 10,
    })

    // Optionally upload to storage for email sending
    try {
      // Convert HTML to blob for upload
      const htmlBlob = new Blob([html], { type: 'text/html' })
      const fileName = `invoice-${billId}-${Date.now()}.html`
      const filePath = `invoices/${fileName}`

      await supabase.storage
        .from('invoices')
        .upload(filePath, htmlBlob, {
          contentType: 'text/html',
          upsert: false,
        })
    } catch (uploadError) {
      console.error('Failed to upload invoice HTML to storage:', uploadError)
      // Don't throw - PDF download was successful
    }

    return {
      success: true,
      billId,
      fileName: filename,
    }
  },

  /**
   * Download invoice PDF (generates if needed)
   */
  download: async (billId: string) => {
    // Simply call generate which will download the PDF
    return await invoicesApi.generate(billId)
  },

  sendEmail: async (billId: string, recipientEmail: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) throw new Error('Not authenticated')

    const response = await fetch(`${SUPABASE_URL}/functions/v1/sendEmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ billId, recipientEmail }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to send email')
    }

    return await response.json()
  },
}

