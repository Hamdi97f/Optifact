import { useEffect, useMemo, useState } from 'react';
import { Search, Trash2, Wallet, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { useI18n } from '@/lib/i18n';
import { formatDate, formatMoney, roundTo } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import type {
  DocumentRecord,
  DocumentStatus,
  Entity,
  Payment,
  PaymentMethod,
} from '@/types/db';

interface PaymentDraft {
  amount: number;
  method: PaymentMethod;
  date: string;
  notes: string;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'bank_transfer',
  'check',
  'card',
  'other',
];

/**
 * Compute the next document status given the new total of payments.
 */
function nextStatusFor(
  current: DocumentStatus,
  totalPaid: number,
  totalTtc: number,
): DocumentStatus {
  if (current === 'cancelled' || current === 'converted' || current === 'draft') {
    return current;
  }
  if (totalPaid <= 0) return 'issued';
  if (totalPaid + 1e-6 >= totalTtc) return 'paid';
  return 'partially_paid';
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<DocumentRecord[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Record<string, Entity>>({});
  const [search, setSearch] = useState('');
  const [showOnlyOpen, setShowOnlyOpen] = useState(true);

  const [recordingFor, setRecordingFor] = useState<DocumentRecord | null>(null);
  const [draft, setDraft] = useState<PaymentDraft>({
    amount: 0,
    method: 'cash',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [invRes, payRes, entRes] = await Promise.all([
      supabase
        .from('documents')
        .select('*')
        .eq('type', 'invoice')
        .order('date', { ascending: false }),
      supabase.from('payments').select('*').order('date', { ascending: false }),
      supabase.from('entities').select('*'),
    ]);
    setInvoices((invRes.data ?? []) as DocumentRecord[]);
    setPayments((payRes.data ?? []) as Payment[]);
    const map: Record<string, Entity> = {};
    for (const e of (entRes.data ?? []) as Entity[]) map[e.id] = e;
    setClients(map);
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  const paidByDoc = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      map.set(p.doc_id, (map.get(p.doc_id) ?? 0) + Number(p.amount));
    }
    return map;
  }, [payments]);

  const enrichedInvoices = useMemo(() => {
    return invoices.map((inv) => {
      const paid = paidByDoc.get(inv.id) ?? 0;
      const total = Number(inv.total_ttc);
      const remaining = Math.max(roundTo(total - paid, 3), 0);
      return { invoice: inv, paid, remaining };
    });
  }, [invoices, paidByDoc]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedInvoices.filter(({ invoice, remaining }) => {
      if (showOnlyOpen) {
        if (
          invoice.status === 'cancelled' ||
          invoice.status === 'converted' ||
          invoice.status === 'draft' ||
          remaining <= 0
        )
          return false;
      }
      if (!q) return true;
      const client = invoice.client_id ? clients[invoice.client_id]?.name ?? '' : '';
      return (
        (invoice.number ?? '').toLowerCase().includes(q) ||
        client.toLowerCase().includes(q)
      );
    });
  }, [enrichedInvoices, clients, search, showOnlyOpen]);

  const totals = useMemo(() => {
    const totalDue = enrichedInvoices.reduce((s, x) => {
      if (
        x.invoice.status === 'cancelled' ||
        x.invoice.status === 'converted' ||
        x.invoice.status === 'draft'
      )
        return s;
      return s + x.remaining;
    }, 0);
    const totalReceived = payments.reduce((s, p) => s + Number(p.amount), 0);
    return { totalDue, totalReceived };
  }, [enrichedInvoices, payments]);

  function openRecord(inv: DocumentRecord) {
    const enriched = enrichedInvoices.find((x) => x.invoice.id === inv.id);
    setError(null);
    setRecordingFor(inv);
    setDraft({
      amount: enriched ? roundTo(enriched.remaining, 3) : 0,
      method: 'cash',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
    });
  }

  function closeRecord() {
    setRecordingFor(null);
    setError(null);
  }

  async function handleSavePayment() {
    if (!user || !recordingFor) return;
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t('payments.err.amount'));
      return;
    }
    if (!draft.date) {
      setError(t('payments.err.date'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const insertRes = await supabase.from('payments').insert({
        tenant_id: user.id,
        doc_id: recordingFor.id,
        amount: roundTo(amount, 3),
        method: draft.method,
        date: draft.date,
        notes: draft.notes.trim() || null,
      });
      if (insertRes.error) throw insertRes.error;

      const previousPaid = paidByDoc.get(recordingFor.id) ?? 0;
      const newTotalPaid = previousPaid + amount;
      const next = nextStatusFor(
        recordingFor.status,
        newTotalPaid,
        Number(recordingFor.total_ttc),
      );
      if (next !== recordingFor.status) {
        const updRes = await supabase
          .from('documents')
          .update({ status: next })
          .eq('id', recordingFor.id);
        if (updRes.error) throw updRes.error;
      }

      await load();
      closeRecord();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('payments.err.save'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePayment(p: Payment) {
    if (!confirm(t('payments.confirm_delete'))) return;
    const delRes = await supabase.from('payments').delete().eq('id', p.id);
    if (delRes.error) {
      alert(delRes.error.message);
      return;
    }
    const inv = invoices.find((i) => i.id === p.doc_id);
    if (inv) {
      const remainingPaid = (paidByDoc.get(p.doc_id) ?? 0) - Number(p.amount);
      const next = nextStatusFor(inv.status, remainingPaid, Number(inv.total_ttc));
      if (next !== inv.status) {
        await supabase.from('documents').update({ status: next }).eq('id', inv.id);
      }
    }
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('payments.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('payments.subtitle')}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-600" /> {t('payments.kpi.outstanding')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-32" />
            ) : (
              <div className="text-2xl font-bold">
                {formatMoney(totals.totalDue, settings)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-600" /> {t('payments.kpi.received')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-32" />
            ) : (
              <div className="text-2xl font-bold">
                {formatMoney(totals.totalReceived, settings)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {recordingFor && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle>{t('payments.record')}</CardTitle>
              <CardDescription>
                {t('doc.invoice')} {recordingFor.number ?? recordingFor.id.slice(0, 8)} ·{' '}
                {formatMoney(Number(recordingFor.total_ttc), settings)}
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={closeRecord} aria-label={t('common.close')}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">{t('common.amount')}</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  step="0.001"
                  min={0}
                  value={draft.amount}
                  onChange={(e) =>
                    setDraft({ ...draft, amount: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-date">{t('common.date')}</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-method">{t('payments.col.method')}</Label>
                <Select
                  id="pay-method"
                  value={draft.method}
                  onChange={(e) =>
                    setDraft({ ...draft, method: e.target.value as PaymentMethod })
                  }
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`payments.method.${m}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pay-notes">{t('common.notes')}</Label>
                <Input
                  id="pay-notes"
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder={t('common.optional')}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeRecord} disabled={saving}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSavePayment} disabled={saving}>
                {saving ? t('common.saving') : t('payments.record')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('payments.invoices_title')}</CardTitle>
          <CardDescription>{t('payments.invoices_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('payments.search_placeholder')}
                className="ps-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showOnlyOpen}
                onChange={(e) => setShowOnlyOpen(e.target.checked)}
              />
              {t('payments.only_outstanding')}
            </label>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={
                showOnlyOpen ? t('payments.empty.outstanding') : t('payments.empty.none')
              }
              description={
                showOnlyOpen
                  ? t('payments.empty.outstanding_desc')
                  : t('payments.empty.none_desc')
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
                  <TableHead className="text-end">{t('common.total')}</TableHead>
                  <TableHead className="text-end">{t('payments.col.paid')}</TableHead>
                  <TableHead className="text-end">{t('payments.col.remaining')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map(({ invoice: d, paid, remaining }) => {
                  const canPay =
                    d.status !== 'cancelled' &&
                    d.status !== 'converted' &&
                    d.status !== 'draft' &&
                    remaining > 0;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.number ?? d.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{formatDate(d.date, settings)}</TableCell>
                      <TableCell>
                        {d.client_id ? clients[d.client_id]?.name ?? '—' : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            d.status === 'paid'
                              ? 'success'
                              : d.status === 'partially_paid'
                                ? 'warning'
                                : d.status === 'cancelled'
                                  ? 'destructive'
                                  : 'secondary'
                          }
                        >
                          {t(`status.${d.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatMoney(Number(d.total_ttc), settings)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatMoney(paid, settings)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatMoney(remaining, settings)}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRecord(d)}
                          disabled={!canPay}
                        >
                          {t('payments.record')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('payments.recent')}</CardTitle>
          <CardDescription>{t('payments.recent_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : payments.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={t('payments.empty.norec')}
              description={t('payments.empty.norec_desc')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('payments.col.invoice')}</TableHead>
                  <TableHead>{t('payments.col.method')}</TableHead>
                  <TableHead>{t('common.notes')}</TableHead>
                  <TableHead className="text-end">{t('common.amount')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => {
                  const inv = invoices.find((i) => i.id === p.doc_id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.date, settings)}</TableCell>
                      <TableCell className="font-medium">
                        {inv?.number ?? p.doc_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t(`payments.method.${p.method}`)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.notes ?? '—'}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatMoney(Number(p.amount), settings)}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeletePayment(p)}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
