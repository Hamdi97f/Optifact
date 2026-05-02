import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { computeTotals, TIMBRE_FISCAL, TVA_RATE } from '@/lib/tax';
import { cn, formatTND, round3 } from '@/lib/utils';
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
import type {
  DocumentStatus,
  DocumentType,
  DraftLineItem,
  Entity,
  Product,
} from '@/types/db';

interface DocumentCreatePageProps {
  type: DocumentType;
  title: string;
  /** Path to navigate to after a successful save. */
  redirectTo: string;
}

const STEPS = [
  { id: 'header', title: 'Document & client' },
  { id: 'items', title: 'Line items' },
  { id: 'review', title: 'Review & save' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

export function DocumentCreatePage({ type, title, redirectTo }: DocumentCreatePageProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<StepId>('header');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);

  // Header form state
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientId, setClientId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<DocumentStatus>('issued');

  // Line items
  const [items, setItems] = useState<DraftLineItem[]>([
    { product_id: null, description: '', qty: 1, unit_price: 0 },
  ]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const wantedEntityType = type === 'purchase_order' ? 'supplier' : 'client';
      const [productsRes, entitiesRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('entities').select('*').eq('type', wantedEntityType).order('name'),
      ]);
      setProducts((productsRes.data ?? []) as Product[]);
      setEntities((entitiesRes.data ?? []) as Entity[]);
    })();
  }, [user, type]);

  const totals = useMemo(() => computeTotals(items, type), [items, type]);

  function updateItem(index: number, patch: Partial<DraftLineItem>) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      // If a product is picked, prefill description and unit price.
      if (patch.product_id !== undefined) {
        const product = products.find((p) => p.id === patch.product_id);
        if (product) {
          next[index].description = next[index].description || product.name;
          next[index].unit_price =
            type === 'purchase_order' ? Number(product.purchase_price) : Number(product.sale_price);
        }
      }
      return next;
    });
  }

  function addItem() {
    setItems((prev) => [...prev, { product_id: null, description: '', qty: 1, unit_price: 0 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function canGoNext(): boolean {
    if (step === 'header') {
      // Client/supplier optional but recommended; require at least a date.
      return Boolean(date);
    }
    if (step === 'items') {
      return items.length > 0 && items.every((it) => it.qty > 0 && it.unit_price >= 0);
    }
    return true;
  }

  function goNext() {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
  }
  function goBack() {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx > 0) setStep(STEPS[idx - 1].id);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const { data: doc, error: docErr } = await supabase
        .from('documents')
        .insert({
          tenant_id: user.id,
          type,
          status,
          number: number || null,
          date,
          client_id: clientId || null,
          total_ht: totals.total_ht,
          tva: totals.tva,
          timbre_fiscal: totals.timbre_fiscal,
          total_ttc: totals.total_ttc,
          notes: notes || null,
        })
        .select('*')
        .single();
      if (docErr || !doc) throw docErr ?? new Error('Failed to create document');

      const { error: itemsErr } = await supabase.from('doc_items').insert(
        items.map((it) => ({
          tenant_id: user.id,
          doc_id: (doc as { id: string }).id,
          product_id: it.product_id,
          description: it.description || null,
          qty: round3(Number(it.qty)),
          unit_price: round3(Number(it.unit_price)),
        })),
      );
      if (itemsErr) throw itemsErr;

      navigate(redirectTo);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New {title.toLowerCase()}</h1>
        <p className="text-sm text-muted-foreground">Multi-step form with real-time totals.</p>
      </div>

      <Stepper step={step} />

      <Card>
        <CardHeader>
          <CardTitle>{STEPS.find((s) => s.id === step)?.title}</CardTitle>
          <CardDescription>
            Step {STEPS.findIndex((s) => s.id === step) + 1} of {STEPS.length}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 'header' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="number">Document number</Label>
                <Input
                  id="number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="Auto if left empty"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="client">
                  {type === 'purchase_order' ? 'Supplier' : 'Client'}
                </Label>
                <Select
                  id="client"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">—</option>
                  {entities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DocumentStatus)}
                >
                  <option value="draft">Draft</option>
                  <option value="issued">Issued</option>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          )}

          {step === 'items' && (
            <div className="space-y-3">
              {items.map((it, i) => (
                <div
                  key={i}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12 sm:items-end"
                >
                  <div className="space-y-1.5 sm:col-span-4">
                    <Label>Product</Label>
                    <Select
                      value={it.product_id ?? ''}
                      onChange={(e) => updateItem(i, { product_id: e.target.value || null })}
                    >
                      <option value="">— Free text —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-4">
                    <Label>Description</Label>
                    <Input
                      value={it.description}
                      onChange={(e) => updateItem(i, { description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-1">
                    <Label>Qty</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      value={it.qty}
                      onChange={(e) => updateItem(i, { qty: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Unit price</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      value={it.unit_price}
                      onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex items-center justify-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(i)}
                      disabled={items.length === 1}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-right text-xs text-muted-foreground sm:col-span-12">
                    Line total: {formatTND((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4" /> Add line
              </Button>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="font-medium">{title}</div>
                <div className="text-muted-foreground">
                  {date} · {entities.find((e) => e.id === clientId)?.name ?? '—'}
                </div>
              </div>
              <ul className="divide-y rounded-lg border">
                {items.map((it, i) => (
                  <li key={i} className="flex items-center justify-between p-3 text-sm">
                    <div>
                      <div className="font-medium">{it.description || '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.qty} × {formatTND(Number(it.unit_price))}
                      </div>
                    </div>
                    <div className="tabular-nums">
                      {formatTND((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <TotalsBox totals={totals} />

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={goBack} disabled={step === STEPS[0].id || saving}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {step !== 'review' ? (
          <Button onClick={goNext} disabled={!canGoNext()}>
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            <Check className="h-4 w-4" /> {saving ? 'Saving…' : 'Save document'}
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: StepId }) {
  const currentIdx = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium',
              i <= currentIdx
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground',
            )}
          >
            {i + 1}
          </div>
          <span
            className={cn(
              'hidden sm:inline',
              i === currentIdx ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {s.title}
          </span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function TotalsBox({
  totals,
}: {
  totals: { total_ht: number; tva: number; timbre_fiscal: number; total_ttc: number };
}) {
  return (
    <div className="ml-auto w-full max-w-xs space-y-1 rounded-lg border p-4 text-sm">
      <Row label="Total HT" value={formatTND(totals.total_ht)} />
      <Row label={`TVA (${(TVA_RATE * 100).toFixed(0)}%)`} value={formatTND(totals.tva)} />
      {totals.timbre_fiscal > 0 && (
        <Row
          label={`Timbre fiscal (${TIMBRE_FISCAL.toFixed(3)})`}
          value={formatTND(totals.timbre_fiscal)}
        />
      )}
      <div className="mt-2 border-t pt-2">
        <Row label="Total TTC" value={formatTND(totals.total_ttc)} bold />
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn('text-muted-foreground', bold && 'font-semibold text-foreground')}>
        {label}
      </span>
      <span className={cn('tabular-nums', bold && 'text-base font-semibold')}>{value}</span>
    </div>
  );
}
