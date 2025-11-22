import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

/**
 * Generate PDF from HTML element
 */
export async function generatePDFFromHTML(
  element: HTMLElement,
  filename: string = 'invoice.pdf',
  options?: {
    format?: 'a4' | 'letter'
    orientation?: 'portrait' | 'landscape'
    margin?: number
  }
): Promise<void> {
  const {
    format = 'a4',
    orientation = 'portrait',
    margin = 10,
  } = options || {}

  try {
    // Convert HTML to canvas
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    })

    const imgData = canvas.toDataURL('image/png')
    
    // Calculate PDF dimensions
    const pdfWidth = format === 'a4' ? 210 : 216 // A4 or Letter width in mm
    const pdfHeight = orientation === 'portrait' 
      ? (format === 'a4' ? 297 : 279) // A4 or Letter height in mm
      : (format === 'a4' ? 210 : 216) // Landscape

    const imgWidth = pdfWidth - (margin * 2)
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    // Create PDF
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: [pdfWidth, pdfHeight],
    })

    let heightLeft = imgHeight
    let position = margin

    // Add first page
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= (pdfHeight - (margin * 2))

    // Add additional pages if needed
    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
      heightLeft -= (pdfHeight - (margin * 2))
    }

    // Save PDF
    pdf.save(filename)
  } catch (error) {
    console.error('Error generating PDF:', error)
    throw new Error('Failed to generate PDF')
  }
}

/**
 * Generate PDF from HTML string by creating a temporary element
 */
export async function generatePDFFromHTMLString(
  htmlString: string,
  filename: string = 'invoice.pdf',
  options?: {
    format?: 'a4' | 'letter'
    orientation?: 'portrait' | 'landscape'
    margin?: number
  }
): Promise<void> {
  // Create a temporary container
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.width = '210mm' // A4 width
  container.style.padding = '20mm'
  container.style.backgroundColor = '#ffffff'
  container.innerHTML = htmlString

  document.body.appendChild(container)

  try {
    await generatePDFFromHTML(container, filename, options)
  } finally {
    // Clean up
    document.body.removeChild(container)
  }
}

