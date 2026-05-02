import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DocItem, DocumentRecord, Entity, Profile } from '@/types/db';
import { formatDate, formatTND } from './utils';

const DOC_TITLES: Record<DocumentRecord['type'], string> = {
  quote: 'DEVIS',
  invoice: 'FACTURE',
  delivery: 'BON DE LIVRAISON',
  purchase_order: 'BON DE COMMANDE',
};

interface GeneratePdfArgs {
  doc: DocumentRecord;
  items: DocItem[];
  client: Entity | null;
  profile: Profile | null;
}

/**
 * Generate a professional A4 PDF for a document and trigger a browser download.
 * Layout: company header (left) + document meta (right), client block,
 * itemised table, totals box (HT / TVA / Timbre / TTC).
 */
export function generateDocumentPdf({ doc, items, client, profile }: GeneratePdfArgs): void {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();

  // ---- Header ----
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(profile?.company_name ?? 'My Company', 14, 18);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text('Powered by Optifact', 14, 24);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(DOC_TITLES[doc.type], pageWidth - 14, 18, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`N°: ${doc.number ?? doc.id.slice(0, 8)}`, pageWidth - 14, 25, { align: 'right' });
  pdf.text(`Date: ${formatDate(doc.date)}`, pageWidth - 14, 30, { align: 'right' });
  pdf.text(`Statut: ${doc.status}`, pageWidth - 14, 35, { align: 'right' });

  // ---- Client block ----
  pdf.setDrawColor(220);
  pdf.line(14, 42, pageWidth - 14, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Client', 14, 50);
  pdf.setFont('helvetica', 'normal');
  if (client) {
    pdf.text(client.name, 14, 56);
    if (client.address) pdf.text(client.address, 14, 61);
    if (client.tax_id) pdf.text(`MF: ${client.tax_id}`, 14, 66);
    if (client.phone) pdf.text(`Tél: ${client.phone}`, 14, 71);
  } else {
    pdf.text('—', 14, 56);
  }

  // ---- Items table ----
  autoTable(pdf, {
    startY: 80,
    head: [['Description', 'Qté', 'Prix unitaire', 'Total HT']],
    body: items.map((it) => [
      it.description ?? '',
      String(it.qty),
      formatTND(Number(it.unit_price)),
      formatTND(Number(it.line_total ?? it.qty * it.unit_price)),
    ]),
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  });

  // ---- Totals box ----
  // Grab the y position after the table (jspdf-autotable mutates the doc).
  const finalY =
    (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  const tx = pageWidth - 80;
  let ty = finalY + 10;

  pdf.setFont('helvetica', 'normal');
  pdf.text('Total HT:', tx, ty);
  pdf.text(formatTND(Number(doc.total_ht)), pageWidth - 14, ty, { align: 'right' });
  ty += 6;
  pdf.text('TVA (19%):', tx, ty);
  pdf.text(formatTND(Number(doc.tva)), pageWidth - 14, ty, { align: 'right' });
  ty += 6;
  if (Number(doc.timbre_fiscal) > 0) {
    pdf.text('Timbre fiscal:', tx, ty);
    pdf.text(formatTND(Number(doc.timbre_fiscal)), pageWidth - 14, ty, { align: 'right' });
    ty += 6;
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Total TTC:', tx, ty + 2);
  pdf.text(formatTND(Number(doc.total_ttc)), pageWidth - 14, ty + 2, { align: 'right' });

  // ---- Save ----
  const filename = `${DOC_TITLES[doc.type]}_${doc.number ?? doc.id.slice(0, 8)}.pdf`;
  pdf.save(filename);
}
