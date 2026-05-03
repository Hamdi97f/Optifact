import { useEffect, useMemo, useState } from 'react';
import { Search, Trash2, Wallet, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
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

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'check', label: 'Check' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

/**
 * Compute the next document status given the new total of payments. We never
 * downgrade a document out of a terminal state (`paid`, `cancelled`,
 * `converted`) and we never resurrect a draft.
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

  /** Sum of payments per invoice id. */
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
      setError('Amount must be greater than 0.');
      return;
    }
    if (!draft.date) {
      setError('Date is required.');
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

      // Recompute status from the now-current set of payments.
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
      setError(e instanceof Error ? e.message : 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePayment(p: Payment) {
    if (!confirm('Delete this payment?')) return;
    const delRes = await supabase.from('payments').delete().eq('id', p.id);
    if (delRes.error) {
      alert(delRes.error.message);
      return;
    }
    // Refresh status of the related invoice based on remaining payments.
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
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Track invoice payments and outstanding balances.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-600" /> Outstanding balance
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
              <Wallet className="h-4 w-4 text-emerald-600" /> Total received
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
              <CardTitle>Record payment</CardTitle>
              <CardDescription>
                Invoice {recordingFor.number ?? recordingFor.id.slice(0, 8)} ·{' '}
                {formatMoney(Number(recordingFor.total_ttc), settings)}
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={closeRecord} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Amount</Label>
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
                <Label htmlFor="pay-date">Date</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-method">Method</Label>
                <Select
                  id="pay-method"
                  value={draft.method}
                  onChange={(e) =>
                    setDraft({ ...draft, method: e.target.value as PaymentMethod })
                  }
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pay-notes">Notes</Label>
                <Input
                  id="pay-notes"
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Optional"
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
                Cancel
              </Button>
              <Button onClick={handleSavePayment} disabled={saving}>
                {saving ? 'Saving…' : 'Record payment'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>
            Record payments against invoices. Paid amount and status are kept in
            sync automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by number or client…"
                className="pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showOnlyOpen}
                onChange={(e) => setShowOnlyOpen(e.target.checked)}
              />
              Only outstanding
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
              title={showOnlyOpen ? 'No outstanding invoices' : 'No invoices'}
              description={
                showOnlyOpen
                  ? 'Every issued invoice is fully paid. Nice!'
                  : 'Create an invoice from the Invoices section to track payments.'
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
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(Number(d.total_ttc), settings)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(paid, settings)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(remaining, settings)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRecord(d)}
                          disabled={!canPay}
                        >
                          Record payment
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
          <CardTitle>Recent payments</CardTitle>
          <CardDescription>All recorded payments, newest first.</CardDescription>
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
              title="No payments recorded yet"
              description="Record a payment from the invoices table above."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                        {PAYMENT_METHODS.find((m) => m.value === p.method)?.label ??
                          p.method}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.notes ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(Number(p.amount), settings)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeletePayment(p)}
                          aria-label="Delete payment"
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
