import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, Plus, Search, FilePlus2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, formatTND } from '@/lib/utils';
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
  title: string;
  description: string;
  /** Path used for the "New" button (e.g. '/invoices/new'). */
  newPath: string;
  /**
   * If true, shows a "Convert to invoice" action for issued quotes
   * (only meaningful for the Quotes page).
   */
  enableQuoteConversion?: boolean;
}

const STATUS_VARIANTS: Record<DocumentStatus, 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  issued: 'default',
  paid: 'success',
  partially_paid: 'warning',
  cancelled: 'destructive',
  converted: 'outline',
};

export function DocumentListPage({
  type,
  title,
  description,
  newPath,
  enableQuoteConversion = false,
}: DocumentListPageProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [clients, setClients] = useState<Record<string, Entity>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

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
    const header = ['Number', 'Date', 'Client', 'Status', 'Total HT', 'TVA', 'Timbre', 'Total TTC'];
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
          // Timbre fiscal applies to invoices.
          timbre_fiscal: 1.0,
          total_ttc: Number(doc.total_ht) + Number(doc.tva) + 1.0,
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
      alert('Failed to convert quote. Check the console for details.');
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
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Link to={newPath}>
            <Button>
              <Plus className="h-4 w-4" /> New
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All {title.toLowerCase()}</CardTitle>
          <CardDescription>Search by number or client, filter by status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | 'all')}
              className="sm:w-48"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="paid">Paid</option>
              <option value="partially_paid">Partially paid</option>
              <option value="cancelled">Cancelled</option>
              <option value="converted">Converted</option>
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
              title={`No ${title.toLowerCase()} yet`}
              description="Create your first document to get started."
              action={
                <Link to={newPath}>
                  <Button>
                    <Plus className="h-4 w-4" /> New
                  </Button>
                </Link>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total TTC</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.number ?? d.id.slice(0, 8)}</TableCell>
                    <TableCell>{formatDate(d.date)}</TableCell>
                    <TableCell>
                      {d.client_id ? clients[d.client_id]?.name ?? '—' : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[d.status]}>{d.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTND(Number(d.total_ttc))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {enableQuoteConversion && d.status === 'issued' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => convertToInvoice(d)}
                            disabled={busyId === d.id}
                          >
                            <FilePlus2 className="h-4 w-4" /> To invoice
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
