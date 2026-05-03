import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, Plus, Search, FilePlus2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { useI18n } from '@/lib/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { effectiveFiscalStamp } from '@/lib/tax';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { generateDocumentPdf } from '@/lib/pdf';
import type {
  DocItem,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  Entity,
  Profile,
} from '@/types/db';

interface DocumentListPageProps {
  /** The document type this page lists. */
  type: DocumentType;
  /** Path used for the "New" button (e.g. '/invoices/new'). */
  newPath: string;
  /**
   * If true, shows a "Convert to invoice" action for issued quotes
   * (only meaningful for the Quotes page).
   */
  enableQuoteConversion?: boolean;
}

const STATUS_VARIANTS: Record<
  DocumentStatus,
  'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'
> = {
  draft: 'secondary',
  issued: 'default',
  paid: 'success',
  partially_paid: 'warning',
  cancelled: 'destructive',
  converted: 'outline',
};

export function DocumentListPage({
  type,
  newPath,
  enableQuoteConversion = false,
}: DocumentListPageProps) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [clients, setClients] = useState<Record<string, Entity>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const title = t(`doclist.${type}.title`);
  const description = t(`doclist.${type}.desc`);

  async function load() {
    setLoading(true);
    const [docsRes, clientsRes] = await Promise.all([
      supabase
        .from('documents')
        .select('*')
        .eq('type', type)
        .order('date', { ascending: false }),
      supabase.from('entities').select('*'),
    ]);
    setDocs((docsRes.data ?? []) as DocumentRecord[]);
    const map: Record<string, Entity> = {};
    for (const c of (clientsRes.data ?? []) as Entity[]) map[c.id] = c;
    setClients(map);
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, type]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!q) return true;
      const client = d.client_id ? clients[d.client_id]?.name ?? '' : '';
      return (
        (d.number ?? '').toLowerCase().includes(q) ||
        client.toLowerCase().includes(q)
      );
    });
  }, [docs, clients, search, statusFilter]);

  function exportCsv() {
    // CSV header uses the active translations so the exported file matches
    // what the user sees on screen.
    const header = [
      t('doclist.col.number'),
      t('common.date'),
      t('doclist.col.client'),
      t('common.status'),
      t('doccreate.totals.ht'),
      t('doccreate.totals.tva'),
      t('doccreate.totals.stamp'),
      t('doclist.col.total_ttc'),
    ];
    const rows = filtered.map((d) => [
      d.number ?? d.id.slice(0, 8),
      d.date,
      d.client_id ? clients[d.client_id]?.name ?? '' : '',
      d.status,
      String(d.total_ht),
      String(d.tva),
      String(d.timbre_fiscal),
      String(d.total_ttc),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handlePdf(doc: DocumentRecord) {
    setBusyId(doc.id);
    const [itemsRes, profileRes] = await Promise.all([
      supabase.from('doc_items').select('*').eq('doc_id', doc.id),
      user
        ? supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const items = (itemsRes.data ?? []) as DocItem[];
    const client = doc.client_id ? clients[doc.client_id] ?? null : null;
    generateDocumentPdf({
      doc,
      items,
      client,
      profile: (profileRes.data ?? null) as Profile | null,
      settings,
    });
    setBusyId(null);
  }

  /**
   * Convert a Quote → Invoice in a single click. Implemented as a transactional
   * flow on the client: insert the new invoice (status: issued), copy its line
   * items, then mark the source quote as "converted". Inventory is auto-updated
   * by the Postgres trigger when the invoice is inserted as "issued".
   */
  async function convertToInvoice(doc: DocumentRecord) {
    if (!user) return;
    setBusyId(doc.id);
    try {
      const itemsRes = await supabase.from('doc_items').select('*').eq('doc_id', doc.id);
      const items = (itemsRes.data ?? []) as DocItem[];

      const stamp = effectiveFiscalStamp(settings, 'invoice');
      const { data: invoice, error: invErr } = await supabase
        .from('documents')
        .insert({
          tenant_id: user.id,
          type: 'invoice',
          status: 'issued',
          date: new Date().toISOString().slice(0, 10),
          client_id: doc.client_id,
          total_ht: doc.total_ht,
          tva: doc.tva,
          // Fiscal stamp: read from settings (configurable per document type).
          timbre_fiscal: stamp,
          total_ttc: Number(doc.total_ht) + Number(doc.tva) + stamp,
          notes: doc.notes,
          source_doc_id: doc.id,
        })
        .select('*')
        .single();
      if (invErr || !invoice) throw invErr ?? new Error('Failed to create invoice');

      if (items.length > 0) {
        const { error: itemsErr } = await supabase.from('doc_items').insert(
          items.map((it) => ({
            tenant_id: user.id,
            doc_id: (invoice as DocumentRecord).id,
            product_id: it.product_id,
            description: it.description,
            qty: it.qty,
            unit_price: it.unit_price,
          })),
        );
        if (itemsErr) throw itemsErr;
      }

      await supabase.from('documents').update({ status: 'converted' }).eq('id', doc.id);
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('convertToInvoice failed', e);
      alert(t('doclist.convert_failed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> {t('common.export_csv')}
          </Button>
          <Link to={newPath}>
            <Button>
              <Plus className="h-4 w-4" /> {t('common.new')}
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{t('doclist.search_help')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common.search_placeholder')}
                className="ps-9"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | 'all')}
              className="sm:w-48"
            >
              <option value="all">{t('doclist.all_statuses')}</option>
              <option value="draft">{t('status.draft')}</option>
              <option value="issued">{t('status.issued')}</option>
              <option value="paid">{t('status.paid')}</option>
              <option value="partially_paid">{t('status.partially_paid')}</option>
              <option value="cancelled">{t('status.cancelled')}</option>
              <option value="converted">{t('status.converted')}</option>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t(`doclist.empty.${type}`)}
              description={t('doclist.empty.desc')}
              action={
                <Link to={newPath}>
                  <Button>
                    <Plus className="h-4 w-4" /> {t('common.new')}
                  </Button>
                </Link>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('doclist.col.number')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('doclist.col.client')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="text-end">{t('doclist.col.total_ttc')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.number ?? d.id.slice(0, 8)}</TableCell>
                    <TableCell>{formatDate(d.date, settings)}</TableCell>
                    <TableCell>
                      {d.client_id ? clients[d.client_id]?.name ?? '—' : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[d.status]}>{t(`status.${d.status}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatMoney(Number(d.total_ttc), settings)}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-2">
                        {enableQuoteConversion && d.status === 'issued' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => convertToInvoice(d)}
                            disabled={busyId === d.id}
                          >
                            <FilePlus2 className="h-4 w-4" /> {t('doclist.to_invoice')}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handlePdf(d)}
                          disabled={busyId === d.id}
                        >
                          <Download className="h-4 w-4" /> PDF
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
