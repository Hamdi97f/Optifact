import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DocItem, DocumentRecord, Entity, Profile } from '@/types/db';
import type { AppSettings } from '@/types/settings';
import { defaultSettings } from './settingsRepo';
import {
  formatDate as formatDateWith,
  formatMoney,
  formatNumber,
  formatQuantity,
} from './format';
import { computeTaxBreakdown, computeTotals } from './tax';

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
  /** Active settings — defaults are used when omitted (e.g. tests). */
  settings?: AppSettings;
}

/**
 * Generate a professional A4 PDF for a document and trigger a browser download.
 * Layout: company header (left) + document meta (right), client block,
 * itemised table, totals box (HT / TVA / Timbre / TTC).
 *
 * The header, currency formatting, date formatting, fiscal stamp label and
 * watermark are all driven by the active `AppSettings`.
 */
export function generateDocumentPdf({ doc, items, client, profile, settings }: GeneratePdfArgs): void {
  const s = settings ?? defaultSettings();
  const company = s.company;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const moneyStr = (v: number) => formatMoney(Number(v) || 0, s);
  const dateStr = (v: string | Date) => formatDateWith(v, s);
  const qtyStr = (v: number) => formatQuantity(Number(v) || 0, s);

  // ---- Header ----
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  const displayName =
    company.trade_name || company.legal_name || profile?.company_name || 'My Company';
  pdf.text(displayName, 14, 18);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  let cy = 24;
  const companyLines: string[] = [];
  if (company.address_line1) companyLines.push(company.address_line1);
  if (company.address_line2) companyLines.push(company.address_line2);
  if (company.postal_code || company.city) {
    companyLines.push(`${company.postal_code} ${company.city}`.trim());
  }
  if (company.country) companyLines.push(company.country);
  if (company.phone) companyLines.push(`Tél: ${company.phone}`);
  if (company.email) companyLines.push(company.email);
  if (company.tax_id) companyLines.push(`MF: ${company.tax_id}`);
  if (company.vat_number) companyLines.push(`TVA: ${company.vat_number}`);
  for (const line of companyLines) {
    pdf.text(line, 14, cy);
    cy += 4;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(DOC_TITLES[doc.type], pageWidth - 14, 18, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`N°: ${doc.number ?? doc.id.slice(0, 8)}`, pageWidth - 14, 25, { align: 'right' });
  pdf.text(`Date: ${dateStr(doc.date)}`, pageWidth - 14, 30, { align: 'right' });
  pdf.text(`Statut: ${doc.status}`, pageWidth - 14, 35, { align: 'right' });

  // ---- Client block ----
  const blockTop = Math.max(cy + 4, 42);
  pdf.setDrawColor(220);
  pdf.line(14, blockTop, pageWidth - 14, blockTop);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Client', 14, blockTop + 8);
  pdf.setFont('helvetica', 'normal');
  if (client) {
    pdf.text(client.name, 14, blockTop + 14);
    if (client.address) pdf.text(client.address, 14, blockTop + 19);
    if (client.tax_id) pdf.text(`MF: ${client.tax_id}`, 14, blockTop + 24);
    if (client.phone) pdf.text(`Tél: ${client.phone}`, 14, blockTop + 29);
  } else {
    pdf.text('—', 14, blockTop + 14);
  }

  // ---- Items table ----
  // Resolve a per-line tax label so the breakdown is visible row-by-row.
  // Falls back to the document-level default tax for legacy rows that
  // don't carry a `tax_id`.
  const fallbackTaxId =
    doc.type === 'purchase_order'
      ? s.tax.default_purchase_tax_id
      : s.tax.default_sales_tax_id;
  const ratesById = new Map(s.tax.rates.map((r) => [r.id, r]));
  function taxLabelFor(it: DocItem): string {
    const id = it.tax_id ?? fallbackTaxId;
    if (!id) return '—';
    const rate = ratesById.get(id);
    if (!rate) return '—';
    return `${rate.name} (${formatNumber(Number(rate.rate) || 0, s, { minDecimals: 0, maxDecimals: 2 })}%)`;
  }
  autoTable(pdf, {
    startY: blockTop + 38,
    head: [['Description', 'Qté', 'Prix unitaire', 'Taxe', 'Total HT']],
    body: items.map((it) => [
      it.description ?? '',
      qtyStr(Number(it.qty)),
      moneyStr(Number(it.unit_price)),
      taxLabelFor(it),
      moneyStr(Number(it.line_total ?? it.qty * it.unit_price)),
    ]),
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'left' },
      4: { halign: 'right' },
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
  pdf.text(moneyStr(Number(doc.total_ht)), pageWidth - 14, ty, { align: 'right' });
  ty += 6;

  // Tax breakdown — recompute from the persisted items + settings + client so
  // combined taxes, customer exemptions, and per-line tax ids (item / entity
  // scopes) all render their correct breakdown.
  const recomputed = computeTotals(
    items.map((it) => ({
      product_id: it.product_id,
      description: it.description ?? '',
      qty: Number(it.qty) || 0,
      unit_price: Number(it.unit_price) || 0,
      tax_id: it.tax_id ?? null,
    })),
    doc.type,
    { settings: s, client },
  );
  const taxLines =
    recomputed.taxes.length > 0
      ? recomputed.taxes
      : computeTaxBreakdown(Number(doc.total_ht) || 0, s, doc.type, client);
  if (taxLines.length > 0) {
    for (const line of taxLines) {
      const pct = formatNumber(line.rate, s, { minDecimals: 0, maxDecimals: 2 });
      pdf.text(`${line.name} (${pct}%):`, tx, ty);
      pdf.text(moneyStr(line.amount), pageWidth - 14, ty, { align: 'right' });
      ty += 6;
    }
  } else {
    // Fallback for legacy docs whose taxes can't be re-derived (e.g. tax row
    // was deleted from settings) — show the persisted tva column as before.
    pdf.text('TVA:', tx, ty);
    pdf.text(moneyStr(Number(doc.tva)), pageWidth - 14, ty, { align: 'right' });
    ty += 6;
  }
  if (Number(doc.timbre_fiscal) > 0) {
    pdf.text('Timbre fiscal:', tx, ty);
    pdf.text(moneyStr(Number(doc.timbre_fiscal)), pageWidth - 14, ty, { align: 'right' });
    ty += 6;
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Total TTC:', tx, ty + 2);
  pdf.text(moneyStr(Number(doc.total_ttc)), pageWidth - 14, ty + 2, { align: 'right' });

  // ---- Footer (payment terms, signature, configurable footer) ----
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  let fy = pageHeight - 28;
  if (s.documents.payment_terms) {
    pdf.text(s.documents.payment_terms, 14, fy);
    fy += 4;
  }
  if (company.bank_name || company.bank_iban || company.bank_rib) {
    const bank = [company.bank_name, company.bank_rib, company.bank_iban, company.bank_bic]
      .filter(Boolean)
      .join(' · ');
    pdf.text(bank, 14, fy);
    fy += 4;
  }
  if (company.footer_text) {
    pdf.text(company.footer_text, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }
  if (s.documents.signature_block) {
    pdf.text(s.documents.signature_block, pageWidth - 14, pageHeight - 18, { align: 'right' });
  }

  // ---- Watermark for drafts / cancelled documents ----
  if (
    s.documents.watermark_drafts &&
    (doc.status === 'draft' || doc.status === 'cancelled')
  ) {
    pdf.saveGraphicsState();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(80);
    pdf.setTextColor(220, 220, 220);
    const label = doc.status === 'draft' ? 'BROUILLON' : 'ANNULÉ';
    pdf.text(label, pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: 30,
    });
    pdf.restoreGraphicsState();
    pdf.setTextColor(0, 0, 0);
  }

  // ---- Save ----
  const filename = `${DOC_TITLES[doc.type]}_${doc.number ?? doc.id.slice(0, 8)}.pdf`;
  pdf.save(filename);
}
