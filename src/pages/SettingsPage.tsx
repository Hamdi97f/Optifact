/**
 * SettingsPage — full configuration UI for the gestion-commerciale.
 *
 * Tabs: Company, Localization, Currency, Numbering, Tax, Documents, Branding,
 * Users. Each tab edits a slice of `AppSettings`; the parent persists the
 * complete object via `useSettings().setSettings`.
 */

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Building2,
  Coins,
  FileSignature,
  Globe,
  Hash,
  Palette,
  Percent,
  Settings as SettingsIcon,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useI18n } from '@/lib/i18n';
import { previewNumber } from '@/lib/numbering';
import type {
  AppSettings,
  CompanySettings,
  CurrencySettings,
  DocumentDefaults,
  LocalizationSettings,
  NumberedDocType,
  NumberingSequence,
  TaxRate,
  UserAccount,
  UserRole,
} from '@/types/settings';
import type { DocumentType } from '@/types/db';
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
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'company', icon: Building2, key: 'settings.tab.company' },
  { id: 'localization', icon: Globe, key: 'settings.tab.localization' },
  { id: 'currency', icon: Coins, key: 'settings.tab.currency' },
  { id: 'numbering', icon: Hash, key: 'settings.tab.numbering' },
  { id: 'tax', icon: Percent, key: 'settings.tab.tax' },
  { id: 'documents', icon: FileSignature, key: 'settings.tab.documents' },
  { id: 'branding', icon: Palette, key: 'settings.tab.branding' },
  { id: 'users', icon: Users, key: 'settings.tab.users' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const NUMBERED_DOC_TYPES: NumberedDocType[] = [
  'invoice',
  'quote',
  'delivery',
  'purchase_order',
  'credit_note',
  'payment',
];

const SALES_DOC_TYPES: DocumentType[] = ['quote', 'invoice', 'delivery'];

export default function SettingsPage() {
  const { t } = useI18n();
  const { settings, setSettings, loading } = useSettings();
  const [tab, setTab] = useState<TabId>('company');
  /** Local draft so we batch-save on click rather than on every keystroke. */
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Refresh local draft when the persisted settings change (e.g. on initial load).
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await setSettings(draft);
      setSaveMsg({ kind: 'ok', text: t('settings.saved') });
    } catch {
      setSaveMsg({ kind: 'err', text: t('settings.error') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <SettingsIcon className="h-6 w-6" /> {t('settings.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('settings.description')}</p>
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span
              className={cn(
                'text-sm',
                saveMsg.kind === 'ok' ? 'text-emerald-600' : 'text-destructive',
              )}
            >
              {saveMsg.text}
            </span>
          )}
          <Button onClick={handleSave} disabled={!dirty || saving || loading}>
            {saving ? t('settings.saving') : t('settings.save')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
          {TABS.map(({ id, icon: Icon, key }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                tab === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" /> {t(key)}
            </button>
          ))}
        </nav>

        <div className="space-y-4">
          {tab === 'company' && (
            <CompanyTab
              value={draft.company}
              onChange={(company) => setDraft({ ...draft, company })}
            />
          )}
          {tab === 'localization' && (
            <LocalizationTab
              value={draft.localization}
              onChange={(localization) => setDraft({ ...draft, localization })}
            />
          )}
          {tab === 'currency' && (
            <CurrencyTab
              value={draft.currency}
              onChange={(currency) => setDraft({ ...draft, currency })}
            />
          )}
          {tab === 'numbering' && (
            <NumberingTab
              draft={draft}
              onChange={(numbering) => setDraft({ ...draft, numbering })}
            />
          )}
          {tab === 'tax' && (
            <TaxTab draft={draft} onChange={(tax) => setDraft({ ...draft, tax })} />
          )}
          {tab === 'documents' && (
            <DocumentsTab
              value={draft.documents}
              onChange={(documents) => setDraft({ ...draft, documents })}
            />
          )}
          {tab === 'branding' && (
            <BrandingTab
              value={draft.branding}
              onChange={(branding) => setDraft({ ...draft, branding })}
            />
          )}
          {tab === 'users' && (
            <UsersTab
              accounts={draft.users.accounts}
              onChange={(accounts) => setDraft({ ...draft, users: { accounts } })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================== Company ================================== */

function CompanyTab({
  value,
  onChange,
}: {
  value: CompanySettings;
  onChange: (next: CompanySettings) => void;
}) {
  const { t } = useI18n();
  function patch<K extends keyof CompanySettings>(key: K, v: CompanySettings[K]) {
    onChange({ ...value, [key]: v });
  }

  function handleLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => patch('logo_data_url', String(reader.result));
    reader.readAsDataURL(file);
    // Reset the input so re-selecting the same file fires `change` again.
    e.target.value = '';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.company.title')}</CardTitle>
        <CardDescription>{t('settings.company.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.company.legal_name')}>
          <Input value={value.legal_name} onChange={(e) => patch('legal_name', e.target.value)} />
        </Field>
        <Field label={t('settings.company.trade_name')}>
          <Input value={value.trade_name} onChange={(e) => patch('trade_name', e.target.value)} />
        </Field>
        <Field label={t('settings.company.address')} className="sm:col-span-2">
          <Input
            value={value.address_line1}
            onChange={(e) => patch('address_line1', e.target.value)}
            placeholder={t('settings.company.address_line1_ph')}
          />
        </Field>
        <Field label={t('settings.company.address_line2')} className="sm:col-span-2">
          <Input
            value={value.address_line2}
            onChange={(e) => patch('address_line2', e.target.value)}
            placeholder={t('settings.company.address_line2_ph')}
          />
        </Field>
        <Field label={t('settings.company.postal_code')}>
          <Input value={value.postal_code} onChange={(e) => patch('postal_code', e.target.value)} />
        </Field>
        <Field label={t('settings.company.city')}>
          <Input value={value.city} onChange={(e) => patch('city', e.target.value)} />
        </Field>
        <Field label={t('settings.company.country')}>
          <Input value={value.country} onChange={(e) => patch('country', e.target.value)} />
        </Field>
        <Field label={t('common.phone')}>
          <Input value={value.phone} onChange={(e) => patch('phone', e.target.value)} />
        </Field>
        <Field label={t('common.email')}>
          <Input
            type="email"
            value={value.email}
            onChange={(e) => patch('email', e.target.value)}
          />
        </Field>
        <Field label={t('settings.company.website')}>
          <Input value={value.website} onChange={(e) => patch('website', e.target.value)} />
        </Field>

        <Field label={t('settings.company.tax_id')}>
          <Input value={value.tax_id} onChange={(e) => patch('tax_id', e.target.value)} />
        </Field>
        <Field label={t('settings.company.vat_number')}>
          <Input value={value.vat_number} onChange={(e) => patch('vat_number', e.target.value)} />
        </Field>
        <Field label={t('settings.company.trade_register')} className="sm:col-span-2">
          <Input
            value={value.trade_register}
            onChange={(e) => patch('trade_register', e.target.value)}
          />
        </Field>

        <Field label={t('settings.company.bank')}>
          <Input value={value.bank_name} onChange={(e) => patch('bank_name', e.target.value)} />
        </Field>
        <Field label={t('settings.company.rib')}>
          <Input value={value.bank_rib} onChange={(e) => patch('bank_rib', e.target.value)} />
        </Field>
        <Field label={t('settings.company.iban')}>
          <Input value={value.bank_iban} onChange={(e) => patch('bank_iban', e.target.value)} />
        </Field>
        <Field label={t('settings.company.bic')}>
          <Input value={value.bank_bic} onChange={(e) => patch('bank_bic', e.target.value)} />
        </Field>

        <Field label={t('settings.company.footer')} className="sm:col-span-2">
          <Input value={value.footer_text} onChange={(e) => patch('footer_text', e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          <Label>{t('settings.company.logo')}</Label>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {value.logo_data_url ? (
              <img
                src={value.logo_data_url}
                alt=""
                className="h-16 w-16 rounded border bg-white object-contain p-1"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                {t('common.none')}
              </div>
            )}
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleLogoUpload}
              />
              <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                <Upload className="h-4 w-4" /> {t('common.upload')}
              </span>
            </label>
            {value.logo_data_url && (
              <Button variant="ghost" size="sm" onClick={() => patch('logo_data_url', null)}>
                <Trash2 className="h-4 w-4" /> {t('common.remove')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================ Localization =============================== */

function LocalizationTab({
  value,
  onChange,
}: {
  value: LocalizationSettings;
  onChange: (next: LocalizationSettings) => void;
}) {
  const { t } = useI18n();
  function patch<K extends keyof LocalizationSettings>(key: K, v: LocalizationSettings[K]) {
    onChange({ ...value, [key]: v });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.localization.title')}</CardTitle>
        <CardDescription>{t('settings.localization.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.localization.language')} className="sm:col-span-2">
          <Select
            value={value.language}
            onChange={(e) => patch('language', e.target.value as LocalizationSettings['language'])}
          >
            <option value="fr">{t('settings.localization.lang.fr')}</option>
            <option value="en">{t('settings.localization.lang.en')}</option>
            <option value="ar">{t('settings.localization.lang.ar')}</option>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('settings.localization.rtl_note')}
          </p>
        </Field>
        <Field label={t('settings.localization.date_format')}>
          <Select
            value={value.date_format}
            onChange={(e) =>
              patch('date_format', e.target.value as LocalizationSettings['date_format'])
            }
          >
            <option value="DD/MM/YYYY">31/12/2026 (DD/MM/YYYY)</option>
            <option value="MM/DD/YYYY">12/31/2026 (MM/DD/YYYY)</option>
            <option value="YYYY-MM-DD">2026-12-31 (ISO)</option>
          </Select>
        </Field>
        <Field label={t('settings.localization.dec_sep')}>
          <Select
            value={value.decimal_separator}
            onChange={(e) =>
              patch('decimal_separator', e.target.value as LocalizationSettings['decimal_separator'])
            }
          >
            <option value=",">{t('settings.localization.dec_sep.comma')}</option>
            <option value=".">{t('settings.localization.dec_sep.dot')}</option>
          </Select>
        </Field>
        <Field label={t('settings.localization.thou_sep')}>
          <Select
            value={value.thousands_separator}
            onChange={(e) =>
              patch(
                'thousands_separator',
                e.target.value as LocalizationSettings['thousands_separator'],
              )
            }
          >
            <option value=" ">{t('settings.localization.thou_sep.space')}</option>
            <option value=",">{t('settings.localization.thou_sep.comma')}</option>
            <option value=".">{t('settings.localization.thou_sep.dot')}</option>
            <option value="'">{t('settings.localization.thou_sep.apos')}</option>
            <option value="">{t('settings.localization.thou_sep.none')}</option>
          </Select>
        </Field>
        <Field label={t('settings.localization.dec.amount')}>
          <Input
            type="number"
            min={0}
            max={6}
            value={value.amount_decimals}
            onChange={(e) => patch('amount_decimals', Math.max(0, Number(e.target.value)))}
          />
        </Field>
        <Field label={t('settings.localization.dec.qty')}>
          <Input
            type="number"
            min={0}
            max={6}
            value={value.quantity_decimals}
            onChange={(e) => patch('quantity_decimals', Math.max(0, Number(e.target.value)))}
          />
        </Field>
        <Field label={t('settings.localization.dec.unit_price')}>
          <Input
            type="number"
            min={0}
            max={6}
            value={value.unit_price_decimals}
            onChange={(e) => patch('unit_price_decimals', Math.max(0, Number(e.target.value)))}
          />
        </Field>
      </CardContent>
    </Card>
  );
}

/* ============================== Currency ================================= */

function CurrencyTab({
  value,
  onChange,
}: {
  value: CurrencySettings;
  onChange: (next: CurrencySettings) => void;
}) {
  const { t } = useI18n();
  function patch<K extends keyof CurrencySettings>(key: K, v: CurrencySettings[K]) {
    onChange({ ...value, [key]: v });
  }
  function patchSecondary(idx: number, key: 'code' | 'symbol' | 'rate', v: string | number) {
    const next = value.secondary.map((s, i) =>
      i === idx ? { ...s, [key]: key === 'rate' ? Number(v) : String(v) } : s,
    );
    onChange({ ...value, secondary: next });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.currency.title')}</CardTitle>
        <CardDescription>{t('settings.currency.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('settings.currency.code')}>
            <Input
              value={value.code}
              onChange={(e) => patch('code', e.target.value.toUpperCase())}
              maxLength={5}
            />
          </Field>
          <Field label={t('settings.currency.symbol')}>
            <Input value={value.symbol} onChange={(e) => patch('symbol', e.target.value)} />
          </Field>
          <Field label={t('settings.currency.symbol_pos')}>
            <Select
              value={value.symbol_position}
              onChange={(e) =>
                patch('symbol_position', e.target.value as CurrencySettings['symbol_position'])
              }
            >
              <option value="suffix">{t('settings.currency.symbol_pos.suffix')}</option>
              <option value="prefix">{t('settings.currency.symbol_pos.prefix')}</option>
            </Select>
          </Field>
        </div>

        <div>
          <Label>{t('settings.currency.secondary')}</Label>
          <div className="mt-2 space-y-2">
            {value.secondary.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('settings.currency.secondary_empty')}
              </p>
            )}
            {value.secondary.map((s, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12 sm:items-end">
                <Field label={t('settings.currency.code')} className="sm:col-span-3">
                  <Input
                    value={s.code}
                    onChange={(e) => patchSecondary(i, 'code', e.target.value.toUpperCase())}
                    maxLength={5}
                  />
                </Field>
                <Field label={t('settings.currency.symbol')} className="sm:col-span-3">
                  <Input value={s.symbol} onChange={(e) => patchSecondary(i, 'symbol', e.target.value)} />
                </Field>
                <Field
                  label={t('settings.currency.rate_label', {
                    base: value.code,
                    code: s.code || '—',
                  })}
                  className="sm:col-span-4"
                >
                  <Input
                    type="number"
                    min={0}
                    step="0.000001"
                    value={s.rate}
                    onChange={(e) => patchSecondary(i, 'rate', e.target.value)}
                  />
                </Field>
                <div className="flex justify-end sm:col-span-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      onChange({ ...value, secondary: value.secondary.filter((_, j) => j !== i) })
                    }
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...value,
                  secondary: [...value.secondary, { code: 'EUR', symbol: '€', rate: 0.3 }],
                })
              }
            >
              + {t('common.add')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================== Numbering ================================ */

function NumberingTab({
  draft,
  onChange,
}: {
  draft: AppSettings;
  onChange: (numbering: AppSettings['numbering']) => void;
}) {
  const { t } = useI18n();
  const today = new Date();
  function patchSeq(type: NumberedDocType, patch: Partial<NumberingSequence>) {
    onChange({ ...draft.numbering, [type]: { ...draft.numbering[type], ...patch } });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.numbering.title')}</CardTitle>
        <CardDescription>{t('settings.numbering.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {NUMBERED_DOC_TYPES.map((id) => {
          const seq = draft.numbering[id];
          const previewSettings: AppSettings = {
            ...draft,
            numbering: { ...draft.numbering, [id]: seq },
          };
          return (
            <div key={id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12 sm:items-end">
              <div className="sm:col-span-12 -mb-1 text-sm font-medium">{t(`doc.${id}`)}</div>
              <Field label={t('settings.numbering.prefix')} className="sm:col-span-2">
                <Input value={seq.prefix} onChange={(e) => patchSeq(id, { prefix: e.target.value })} />
              </Field>
              <Field label={t('settings.numbering.suffix')} className="sm:col-span-2">
                <Input value={seq.suffix} onChange={(e) => patchSeq(id, { suffix: e.target.value })} />
              </Field>
              <Field label={t('settings.numbering.padding')} className="sm:col-span-1">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={seq.padding}
                  onChange={(e) =>
                    patchSeq(id, { padding: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </Field>
              <Field label={t('settings.numbering.reset')} className="sm:col-span-3">
                <Select
                  value={seq.reset_cycle}
                  onChange={(e) =>
                    patchSeq(id, { reset_cycle: e.target.value as NumberingSequence['reset_cycle'] })
                  }
                >
                  <option value="never">{t('settings.numbering.reset.never')}</option>
                  <option value="yearly">{t('settings.numbering.reset.yearly')}</option>
                  <option value="monthly">{t('settings.numbering.reset.monthly')}</option>
                </Select>
              </Field>
              <Field label={t('settings.numbering.next')} className="sm:col-span-1">
                <Input
                  type="number"
                  min={1}
                  value={seq.next_number}
                  onChange={(e) =>
                    patchSeq(id, { next_number: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </Field>
              <div className="sm:col-span-3">
                <Label className="text-xs">{t('settings.numbering.preview')}</Label>
                <div className="mt-1.5 rounded-md border bg-muted/30 px-3 py-2 text-sm tabular-nums">
                  {previewNumber(previewSettings, id, today)}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* =============================== Tax ===================================== */

function TaxTab({
  draft,
  onChange,
}: {
  draft: AppSettings;
  onChange: (tax: AppSettings['tax']) => void;
}) {
  const { t } = useI18n();
  const tax = draft.tax;
  function patchRate(idx: number, patch: Partial<TaxRate>) {
    const next = tax.rates.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange({ ...tax, rates: next });
  }
  function removeRate(idx: number) {
    const removed = tax.rates[idx];
    const nextRates = tax.rates.filter((_, i) => i !== idx);
    onChange({
      ...tax,
      rates: nextRates,
      default_sales_tax_id:
        tax.default_sales_tax_id === removed.id ? null : tax.default_sales_tax_id,
      default_purchase_tax_id:
        tax.default_purchase_tax_id === removed.id ? null : tax.default_purchase_tax_id,
    });
  }
  function addRate() {
    onChange({
      ...tax,
      rates: [
        ...tax.rates,
        {
          id: `tax-${crypto.randomUUID().slice(0, 8)}`,
          name: t('settings.tax.new_rate_name'),
          rate: 0,
          type: 'vat',
          account_code: '',
        },
      ],
    });
  }
  function toggleStampType(type: DocumentType) {
    const has = tax.fiscal_stamp_doc_types.includes(type);
    onChange({
      ...tax,
      fiscal_stamp_doc_types: has
        ? tax.fiscal_stamp_doc_types.filter((t) => t !== type)
        : [...tax.fiscal_stamp_doc_types, type],
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.tax.rates_title')}</CardTitle>
          <CardDescription>{t('settings.tax.rates_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tax.rates.map((r, i) => (
            <div key={r.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12 sm:items-end">
              <Field label={t('common.name')} className="sm:col-span-3">
                <Input value={r.name} onChange={(e) => patchRate(i, { name: e.target.value })} />
              </Field>
              <Field label={t('settings.tax.rate_pct')} className="sm:col-span-2">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={r.rate}
                  onChange={(e) => patchRate(i, { rate: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label={t('settings.tax.type')} className="sm:col-span-3">
                <Select
                  value={r.type}
                  onChange={(e) => patchRate(i, { type: e.target.value as TaxRate['type'] })}
                >
                  <option value="vat">{t('settings.tax.type.vat')}</option>
                  <option value="withholding">{t('settings.tax.type.withholding')}</option>
                  <option value="stamp">{t('settings.tax.type.stamp')}</option>
                  <option value="other">{t('settings.tax.type.other')}</option>
                </Select>
              </Field>
              <Field label={t('settings.tax.account_code')} className="sm:col-span-3">
                <Input
                  value={r.account_code}
                  onChange={(e) => patchRate(i, { account_code: e.target.value })}
                />
              </Field>
              <div className="flex justify-end sm:col-span-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRate(i)}
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRate}>
            + {t('settings.tax.add_rate')}
          </Button>

          <div className="grid gap-4 sm:grid-cols-2 pt-2">
            <Field label={t('settings.tax.default_sales')}>
              <Select
                value={tax.default_sales_tax_id ?? ''}
                onChange={(e) =>
                  onChange({ ...tax, default_sales_tax_id: e.target.value || null })
                }
              >
                <option value="">{t('settings.tax.none')}</option>
                {tax.rates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.rate}%)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('settings.tax.default_purchases')}>
              <Select
                value={tax.default_purchase_tax_id ?? ''}
                onChange={(e) =>
                  onChange({ ...tax, default_purchase_tax_id: e.target.value || null })
                }
              >
                <option value="">{t('settings.tax.none')}</option>
                {tax.rates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.rate}%)
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tax.prices_include_tax}
                onChange={(e) => onChange({ ...tax, prices_include_tax: e.target.checked })}
              />
              {t('settings.tax.prices_include')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tax.reverse_charge}
                onChange={(e) => onChange({ ...tax, reverse_charge: e.target.checked })}
              />
              {t('settings.tax.reverse_charge')}
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.tax.stamp_title')}</CardTitle>
          <CardDescription>{t('settings.tax.stamp_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label={t('settings.tax.stamp_amount')}>
            <Input
              type="number"
              min={0}
              step="0.001"
              value={tax.fiscal_stamp_amount}
              onChange={(e) =>
                onChange({ ...tax, fiscal_stamp_amount: Number(e.target.value) || 0 })
              }
            />
          </Field>
          <div className="space-y-1.5">
            <Label>{t('settings.tax.stamp_apply')}</Label>
            <div className="flex flex-wrap gap-3 text-sm">
              {SALES_DOC_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={tax.fiscal_stamp_doc_types.includes(type)}
                    onChange={() => toggleStampType(type)}
                  />
                  {t(`doc.${type}.plural`)}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================ Documents ================================== */

function DocumentsTab({
  value,
  onChange,
}: {
  value: DocumentDefaults;
  onChange: (next: DocumentDefaults) => void;
}) {
  const { t } = useI18n();
  function patch<K extends keyof DocumentDefaults>(key: K, v: DocumentDefaults[K]) {
    onChange({ ...value, [key]: v });
  }
  function patchNote(type: DocumentType, note: string) {
    onChange({ ...value, notes_per_type: { ...value.notes_per_type, [type]: note } });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.documents.title')}</CardTitle>
        <CardDescription>{t('settings.documents.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.documents.payment_terms')}>
            <Input
              value={value.payment_terms}
              onChange={(e) => patch('payment_terms', e.target.value)}
            />
          </Field>
          <Field label={t('settings.documents.due_offset')}>
            <Input
              type="number"
              min={0}
              value={value.due_date_offset_days}
              onChange={(e) => patch('due_date_offset_days', Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
          <Field label={t('settings.documents.signature')} className="sm:col-span-2">
            <Input
              value={value.signature_block}
              onChange={(e) => patch('signature_block', e.target.value)}
              placeholder={t('settings.documents.signature_ph')}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={value.watermark_drafts}
              onChange={(e) => patch('watermark_drafts', e.target.checked)}
            />
            {t('settings.documents.watermark')}
          </label>
        </div>

        <div>
          <Label>{t('settings.documents.notes_per_type')}</Label>
          <div className="mt-2 space-y-2">
            {(['invoice', 'quote', 'delivery', 'purchase_order'] as DocumentType[]).map((type) => (
              <div key={type} className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
                <span className="text-sm text-muted-foreground">{t(`doc.${type}`)}</span>
                <Input
                  value={value.notes_per_type[type] ?? ''}
                  onChange={(e) => patchNote(type, e.target.value)}
                  placeholder={t('settings.documents.note_ph')}
                />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================== Branding ================================= */

function BrandingTab({
  value,
  onChange,
}: {
  value: AppSettings['branding'];
  onChange: (next: AppSettings['branding']) => void;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.branding.title')}</CardTitle>
        <CardDescription>{t('settings.branding.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.branding.primary')}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.primary_color}
              onChange={(e) => onChange({ ...value, primary_color: e.target.value })}
              className="h-10 w-14 cursor-pointer rounded border"
            />
            <Input
              value={value.primary_color}
              onChange={(e) => onChange({ ...value, primary_color: e.target.value })}
              maxLength={9}
            />
          </div>
        </Field>
        <Field label={t('settings.branding.template')}>
          <Select
            value={value.pdf_template}
            onChange={(e) =>
              onChange({ ...value, pdf_template: e.target.value as AppSettings['branding']['pdf_template'] })
            }
          >
            <option value="classic">{t('settings.branding.template.classic')}</option>
            <option value="modern">{t('settings.branding.template.modern')}</option>
            <option value="minimal">{t('settings.branding.template.minimal')}</option>
          </Select>
        </Field>
      </CardContent>
    </Card>
  );
}

/* =============================== Users =================================== */

function UsersTab({
  accounts,
  onChange,
}: {
  accounts: UserAccount[];
  onChange: (accounts: UserAccount[]) => void;
}) {
  const { t } = useI18n();
  function patch(idx: number, p: Partial<UserAccount>) {
    onChange(accounts.map((a, i) => (i === idx ? { ...a, ...p } : a)));
  }
  function add() {
    onChange([
      ...accounts,
      {
        id: crypto.randomUUID(),
        email: '',
        name: '',
        role: 'sales',
        invited: true,
      },
    ]);
  }
  function remove(idx: number) {
    onChange(accounts.filter((_, i) => i !== idx));
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.users.title')}</CardTitle>
        <CardDescription>{t('settings.users.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('settings.users.empty')}</p>
        )}
        {accounts.map((a, i) => (
          <div key={a.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12 sm:items-end">
            <Field label={t('common.name')} className="sm:col-span-3">
              <Input value={a.name} onChange={(e) => patch(i, { name: e.target.value })} />
            </Field>
            <Field label={t('common.email')} className="sm:col-span-4">
              <Input
                type="email"
                value={a.email}
                onChange={(e) => patch(i, { email: e.target.value })}
              />
            </Field>
            <Field label={t('settings.users.role')} className="sm:col-span-3">
              <Select
                value={a.role}
                onChange={(e) => patch(i, { role: e.target.value as UserRole })}
              >
                <option value="admin">{t('settings.users.role.admin')}</option>
                <option value="sales">{t('settings.users.role.sales')}</option>
                <option value="accountant">{t('settings.users.role.accountant')}</option>
                <option value="viewer">{t('settings.users.role.viewer')}</option>
              </Select>
            </Field>
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={a.invited}
                  onChange={(e) => patch(i, { invited: e.target.checked })}
                />
                {t('settings.users.invited')}
              </label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                aria-label={t('common.delete')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add}>
          + {t('settings.users.add')}
        </Button>
      </CardContent>
    </Card>
  );
}

/* =============================== Helpers ================================= */

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
