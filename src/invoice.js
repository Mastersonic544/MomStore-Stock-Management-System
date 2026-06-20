// PDF invoice generation via jsPDF + autotable.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmtTND, fmtDate } from './format.js'

const SHOP_NAME = 'Mom Store'

export function downloadInvoice(sale) {
  const d = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = d.internal.pageSize.getWidth()
  const M = 40

  // Header
  d.setFontSize(20); d.setFont('helvetica', 'bold')
  d.text(SHOP_NAME, M, 56)
  d.setFontSize(22); d.setTextColor(120)
  d.text('FACTURE', pageW - M, 56, { align: 'right' })
  d.setTextColor(0)

  // Meta block
  d.setFontSize(10); d.setFont('helvetica', 'normal')
  const metaRight = [
    `N° ${sale.number}`,
    `Date : ${fmtDate(sale.createdAt)}`,
  ]
  if (sale.createdBy) metaRight.push(`Vendeur : ${sale.createdBy}`)
  metaRight.forEach((line, i) => d.text(line, pageW - M, 80 + i * 14, { align: 'right' }))

  d.setFont('helvetica', 'bold'); d.text('Client', M, 84)
  d.setFont('helvetica', 'normal')
  d.text(sale.customer || 'Comptoir', M, 98)
  if (sale.note) d.text(d.splitTextToSize(sale.note, pageW / 2), M, 112)

  // Items table
  autoTable(d, {
    startY: 140,
    head: [['Produit', 'P.U.', 'Qté', 'Total']],
    body: sale.items.map(it => [
      it.sku ? `${it.name}\n${it.sku}` : it.name,
      fmtTND(it.price),
      String(it.qty),
      fmtTND(it.lineTotal),
    ]),
    styles: { fontSize: 9, cellPadding: 6, valign: 'middle' },
    headStyles: { fillColor: [37, 99, 235], halign: 'left' },
    columnStyles: {
      1: { halign: 'right', cellWidth: 90 },
      2: { halign: 'center', cellWidth: 50 },
      3: { halign: 'right', cellWidth: 90 },
    },
    margin: { left: M, right: M },
  })

  // Total
  const y = d.lastAutoTable.finalY + 24
  d.setFontSize(12); d.setFont('helvetica', 'bold')
  d.text('TOTAL', pageW - M - 130, y)
  d.text(fmtTND(sale.total), pageW - M, y, { align: 'right' })
  d.setFont('helvetica', 'normal'); d.setFontSize(9); d.setTextColor(120)
  d.text(`${sale.itemCount} article(s)`, M, y)

  d.setTextColor(150); d.setFontSize(8)
  d.text('Merci pour votre confiance.', M, d.internal.pageSize.getHeight() - 30)

  d.save(`${sale.number}.pdf`)
}
