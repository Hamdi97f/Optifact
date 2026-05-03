import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { useI18n } from '@/lib/i18n';
import { computeTotals, effectiveFiscalStamp, effectiveTaxRate } from '@/lib/tax';
import { allocateNumber, previewNumber } from '@/lib/numbering';
import { formatMoney, formatNumber, roundTo } from '@/lib/format';
import { cn } from '@/lib/utils';
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
  /** Path to navigate to after a successful save. */
  redirectTo: string;
}

const STEP_IDS = ['header', 'items', 'review'] as const;
type StepId = (typeof STEP_IDS)[number];

export function DocumentCreatePage({ type, redirectTo }: DocumentCreatePageProps) {
  const { user } = useAuth();
  const { settings, setSettings } = useSettings();
  const { t } = useI18n();
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
  const [notes, setNotes] = useState(() => settings.documents.notes_per_type[type] ?? '');
  const [status, setStatus] = useState<DocumentStatus>('issued');

  // When the type or default note changes (e.g. after reading settings), refresh the field
  // so users see the configured default rather than an empty field.
  useEffect(() => {
    setNotes((current) => (current ? current : settings.documents.notes_per_type[type] ?? ''));
  }, [type, settings.documents.notes_per_type]);

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

  const totals = useMemo(
    () => computeTotals(items, type, { settings }),
    [items, type, settings],
  );
  const numberPreview = useMemo(
    () => previewNumber(settings, type, new Date(date || Date.now())),
    [settings, type, date],
  );

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
      return Boolean(date);
    }
    if (step === 'items') {
      return items.length > 0 && items.every((it) => it.qty > 0 && it.unit_price >= 0);
    }
    return true;
  }

  function goNext() {
    const idx = STEP_IDS.indexOf(step);
    if (idx < STEP_IDS.length - 1) setStep(STEP_IDS[idx + 1]);
  }
  function goBack() {
    const idx = STEP_IDS.indexOf(step);
    if (idx > 0) setStep(STEP_IDS[idx - 1]);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      let allocatedNumber = number.trim();
      let advancedSettings = settings;
      if (!allocatedNumber) {
        const allocation = allocateNumber(settings, type, new Date(date || Date.now()));
        allocatedNumber = allocation.number;
        advancedSettings = allocation.settings;
      }

      const { data: doc, error: docErr } = await supabase
        .from('documents')
        .insert({
          tenant_id: user.id,
          type,
          status,
          number: allocatedNumber || null,
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

      const qtyDecimals = settings.localization.quantity_decimals;
      const priceDecimals = settings.localization.unit_price_decimals;
      const { error: itemsErr } = await supabase.from('doc_items').insert(
        items.map((it) => ({
          tenant_id: user.id,
          doc_id: (doc as { id: string }).id,
          product_id: it.product_id,
          description: it.description || null,
          qty: roundTo(Number(it.qty), qtyDecimals),
          unit_price: roundTo(Number(it.unit_price), priceDecimals),
        })),
      );
      if (itemsErr) throw itemsErr;

      if (advancedSettings !== settings) {
        try {
          await setSettings(advancedSettings);
        } catch {
          /* non-fatal: document saved with right number; counter catches up later */
        }
      }

      navigate(redirectTo);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('common.unknown_error');
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const stepIdx = STEP_IDS.indexOf(step);
  const docTypeLabel = t(`doc.${type}`);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t('doccreate.new', { type: docTypeLabel })}
        </h1>
        <p className="text-sm text-muted-foreground">{t('doccreate.subtitle')}</p>
      </div>

      <Stepper step={step} />

      <Card>
        <CardHeader>
          <CardTitle>{t(`doccreate.step.${step}`)}</CardTitle>
          <CardDescription>
            {t('doccreate.step_label', {
              current: stepIdx + 1,
              total: STEP_IDS.length,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 'header' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="number">{t('doccreate.field.number')}</Label>
                <Input
                  id="number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder={t('doccreate.field.number_auto', { preview: numberPreview })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">{t('common.date')}</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="client">
                  {type === 'purchase_order'
                    ? t('doccreate.field.supplier')
                    : t('doccreate.field.client')}
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
                <Label htmlFor="status">{t('common.status')}</Label>
                <Select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DocumentStatus)}
                >
                  <option value="draft">{t('status.draft')}</option>
                  <option value="issued">{t('status.issued')}</option>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">{t('common.notes')}</Label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('common.optional')}
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
                    <Label>{t('doccreate.field.product')}</Label>
                    <Select
                      value={it.product_id ?? ''}
                      onChange={(e) => updateItem(i, { product_id: e.target.value || null })}
                    >
                      <option value="">{t('doccreate.field.product_freetext')}</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-4">
                    <Label>{t('doccreate.field.description')}</Label>
                    <Input
                      value={it.description}
                      onChange={(e) => updateItem(i, { description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-1">
                    <Label>{t('doccreate.field.qty')}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      value={it.qty}
                      onChange={(e) => updateItem(i, { qty: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t('doccreate.field.unit_price')}</Label>
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
                      aria-label={t('doccreate.remove_line')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-end text-xs text-muted-foreground sm:col-span-12">
                    {t('doccreate.line_total')}:{' '}
                    {formatMoney((Number(it.qty) || 0) * (Number(it.unit_price) || 0), settings)}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4" /> {t('doccreate.add_line')}
              </Button>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="font-medium">{docTypeLabel}</div>
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
                        {it.qty} × {formatMoney(Number(it.unit_price), settings)}
                      </div>
                    </div>
                    <div className="tabular-nums">
                      {formatMoney((Number(it.qty) || 0) * (Number(it.unit_price) || 0), settings)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <TotalsBox totals={totals} type={type} />

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={goBack} disabled={step === STEP_IDS[0] || saving}>
          <ArrowLeft className="h-4 w-4" /> {t('common.back')}
        </Button>
        {step !== 'review' ? (
          <Button onClick={goNext} disabled={!canGoNext()}>
            {t('common.next')} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            <Check className="h-4 w-4" /> {saving ? t('common.saving') : t('doccreate.save')}
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: StepId }) {
  const { t } = useI18n();
  const currentIdx = STEP_IDS.indexOf(step);
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEP_IDS.map((id, i) => (
        <li key={id} className="flex items-center gap-2">
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
            {t(`doccreate.step.${id}`)}
          </span>
          {i < STEP_IDS.length - 1 && <span className="mx-1 h-px w-8 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function TotalsBox({
  totals,
  type,
}: {
  totals: { total_ht: number; tva: number; timbre_fiscal: number; total_ttc: number };
  type: DocumentType;
}) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const tvaPctRaw = effectiveTaxRate(settings, type) * 100;
  const tvaPctLabel = formatNumber(tvaPctRaw, settings, { minDecimals: 0, maxDecimals: 2 });
  const stamp = effectiveFiscalStamp(settings, type);
  return (
    <div className="ms-auto w-full max-w-xs space-y-1 rounded-lg border p-4 text-sm">
      <Row label={t('doccreate.totals.ht')} value={formatMoney(totals.total_ht, settings)} />
      <Row
        label={`${t('doccreate.totals.tva')} (${tvaPctLabel}%)`}
        value={formatMoney(totals.tva, settings)}
      />
      {totals.timbre_fiscal > 0 && (
        <Row
          label={`${t('doccreate.totals.stamp')} (${formatNumber(stamp, settings)})`}
          value={formatMoney(totals.timbre_fiscal, settings)}
        />
      )}
      <div className="mt-2 border-t pt-2">
        <Row
          label={t('doccreate.totals.ttc')}
          value={formatMoney(totals.total_ttc, settings)}
          bold
        />
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
