/**
 * Generate PDF from HTML using pdf-lib
 * This creates a simple PDF programmatically from invoice data
 */

interface InvoiceData {
  billId: string
  guestName: string
  guestEmail: string
  guestPhone: string
  invoiceDate: string
  checkIn?: string
  checkOut?: string
  billItems: Array<{ description: string; amount: number }>
  subtotal: number
  tax: number
  total: number
  paid: boolean
  paymentId?: string
}

export async function generateInvoicePDF(data: InvoiceData): Promise<Uint8Array> {
  // Import pdf-lib from esm.sh
  const { PDFDocument, rgb, StandardFonts } = await import('https://esm.sh/pdf-lib@1.17.1')

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4 size in points
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  
  let yPosition = 800
  const margin = 50
  const lineHeight = 20
  const sectionSpacing = 30

  // Helper function to add text (replace ₹ with Rs for PDF compatibility)
  const addText = (text: string, x: number, y: number, size: number, isBold: boolean = false) => {
    // Replace ₹ symbol with "Rs" since standard fonts don't support Unicode rupee symbol
    // Handle cases where ₹ is followed by a number (₹100 -> Rs 100) or standalone
    const pdfText = text.replace(/₹(\d)/g, 'Rs $1').replace(/₹/g, 'Rs')
    page.drawText(pdfText, {
      x,
      y,
      size,
      font: isBold ? boldFont : font,
      color: rgb(0, 0, 0),
    })
  }

  // Header
  addText('Hotel Invoice', margin, yPosition, 24, true)
  yPosition -= 30
  addText(`Invoice #${data.billId.slice(0, 8)}`, margin, yPosition, 14)
  yPosition -= sectionSpacing

  // Bill Info Section
  addText('Bill Information', margin, yPosition, 16, true)
  yPosition -= lineHeight
  addText(`Guest Name: ${data.guestName}`, margin, yPosition, 12)
  yPosition -= lineHeight
  addText(`Email: ${data.guestEmail}`, margin, yPosition, 12)
  yPosition -= lineHeight
  addText(`Phone: ${data.guestPhone}`, margin, yPosition, 12)
  yPosition -= lineHeight
  addText(`Invoice Date: ${data.invoiceDate}`, margin, yPosition, 12)
  yPosition -= lineHeight
  
  if (data.checkIn && data.checkOut) {
    addText(`Check-in: ${data.checkIn}`, margin, yPosition, 12)
    yPosition -= lineHeight
    addText(`Check-out: ${data.checkOut}`, margin, yPosition, 12)
    yPosition -= lineHeight
  }
  
  if (data.paid) {
    addText('Payment Status: Paid', margin, yPosition, 12)
    yPosition -= lineHeight
    if (data.paymentId) {
      addText(`Payment ID: ${data.paymentId}`, margin, yPosition, 12)
      yPosition -= lineHeight
    }
  }
  
  yPosition -= sectionSpacing

  // Bill Items Table
  addText('Bill Items', margin, yPosition, 16, true)
  yPosition -= lineHeight
  
  // Table header
  addText('Description', margin, yPosition, 12, true)
  addText('Amount (₹)', 400, yPosition, 12, true)
  yPosition -= lineHeight
  
  // Draw line
  page.drawLine({
    start: { x: margin, y: yPosition },
    end: { x: 545, y: yPosition },
    thickness: 1,
    color: rgb(0, 0, 0),
  })
  yPosition -= 10

  // Bill items
  for (const item of data.billItems) {
    if (yPosition < 100) {
      // Add new page if needed
      const newPage = pdfDoc.addPage([595, 842])
      yPosition = 800
    }
    
    const description = item.description.length > 50 
      ? item.description.substring(0, 47) + '...' 
      : item.description
    addText(description, margin, yPosition, 11)
    addText(`₹${item.amount.toFixed(2)}`, 400, yPosition, 11)
    yPosition -= lineHeight
  }

  yPosition -= sectionSpacing

  // Totals
  addText('Subtotal:', margin, yPosition, 12)
  addText(`₹${data.subtotal.toFixed(2)}`, 400, yPosition, 12)
  yPosition -= lineHeight
  
  addText('Tax (18%):', margin, yPosition, 12)
  addText(`₹${data.tax.toFixed(2)}`, 400, yPosition, 12)
  yPosition -= lineHeight
  
  page.drawLine({
    start: { x: margin, y: yPosition },
    end: { x: 545, y: yPosition },
    thickness: 1,
    color: rgb(0, 0, 0),
  })
  yPosition -= 10
  
  addText('Total Amount:', margin, yPosition, 16, true)
  addText(`₹${data.total.toFixed(2)}`, 400, yPosition, 16, true)
  yPosition -= sectionSpacing

  // Footer
  yPosition = 50
  addText('Thank you for your business!', margin, yPosition, 10)
  yPosition -= lineHeight
  addText('This is a computer-generated invoice.', margin, yPosition, 10)

  // Generate PDF bytes
  const pdfBytes = await pdfDoc.save()
  return new Uint8Array(pdfBytes)
}

