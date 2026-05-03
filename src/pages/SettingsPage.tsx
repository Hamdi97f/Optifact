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

const NUMBERED_DOC_TYPES: { id: NumberedDocType; label: string }[] = [
  { id: 'invoice', label: 'Facture' },
  { id: 'quote', label: 'Devis' },
  { id: 'delivery', label: 'Bon de livraison' },
  { id: 'purchase_order', label: 'Bon de commande' },
  { id: 'credit_note', label: 'Avoir' },
  { id: 'payment', label: 'Paiement' },
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
        <CardTitle>Informations société</CardTitle>
        <CardDescription>
          Affichées sur tous les documents (factures, devis, BL, BC).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Raison sociale">
          <Input value={value.legal_name} onChange={(e) => patch('legal_name', e.target.value)} />
        </Field>
        <Field label="Nom commercial">
          <Input value={value.trade_name} onChange={(e) => patch('trade_name', e.target.value)} />
        </Field>
        <Field label="Adresse" className="sm:col-span-2">
          <Input
            value={value.address_line1}
            onChange={(e) => patch('address_line1', e.target.value)}
            placeholder="Ligne 1"
          />
        </Field>
        <Field label="Complément d’adresse" className="sm:col-span-2">
          <Input
            value={value.address_line2}
            onChange={(e) => patch('address_line2', e.target.value)}
            placeholder="Ligne 2 (optionnel)"
          />
        </Field>
        <Field label="Code postal">
          <Input value={value.postal_code} onChange={(e) => patch('postal_code', e.target.value)} />
        </Field>
        <Field label="Ville">
          <Input value={value.city} onChange={(e) => patch('city', e.target.value)} />
        </Field>
        <Field label="Pays">
          <Input value={value.country} onChange={(e) => patch('country', e.target.value)} />
        </Field>
        <Field label="Téléphone">
          <Input value={value.phone} onChange={(e) => patch('phone', e.target.value)} />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={value.email}
            onChange={(e) => patch('email', e.target.value)}
          />
        </Field>
        <Field label="Site web">
          <Input value={value.website} onChange={(e) => patch('website', e.target.value)} />
        </Field>

        <Field label="Matricule fiscal (MF / SIRET)">
          <Input value={value.tax_id} onChange={(e) => patch('tax_id', e.target.value)} />
        </Field>
        <Field label="N° TVA intracommunautaire">
          <Input value={value.vat_number} onChange={(e) => patch('vat_number', e.target.value)} />
        </Field>
        <Field label="Registre de commerce (RC)" className="sm:col-span-2">
          <Input
            value={value.trade_register}
            onChange={(e) => patch('trade_register', e.target.value)}
          />
        </Field>

        <Field label="Banque">
          <Input value={value.bank_name} onChange={(e) => patch('bank_name', e.target.value)} />
        </Field>
        <Field label="RIB">
          <Input value={value.bank_rib} onChange={(e) => patch('bank_rib', e.target.value)} />
        </Field>
        <Field label="IBAN">
          <Input value={value.bank_iban} onChange={(e) => patch('bank_iban', e.target.value)} />
        </Field>
        <Field label="BIC / SWIFT">
          <Input value={value.bank_bic} onChange={(e) => patch('bank_bic', e.target.value)} />
        </Field>

        <Field label="Texte de pied de page" className="sm:col-span-2">
          <Input value={value.footer_text} onChange={(e) => patch('footer_text', e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          <Label>Logo</Label>
          <div className="mt-1.5 flex items-center gap-3">
            {value.logo_data_url ? (
              <img
                src={value.logo_data_url}
                alt="Logo"
                className="h-16 w-16 rounded border bg-white object-contain p-1"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                Aucun
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
                <Upload className="h-4 w-4" /> Téléverser
              </span>
            </label>
            {value.logo_data_url && (
              <Button variant="ghost" size="sm" onClick={() => patch('logo_data_url', null)}>
                <Trash2 className="h-4 w-4" /> Retirer
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
  function patch<K extends keyof LocalizationSettings>(key: K, v: LocalizationSettings[K]) {
    onChange({ ...value, [key]: v });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Localisation</CardTitle>
        <CardDescription>Langue, format de date et de nombres, décimales.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Langue de l’interface">
          <Select
            value={value.language}
            onChange={(e) => patch('language', e.target.value as LocalizationSettings['language'])}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </Select>
        </Field>
        <Field label="Sens de lecture">
          <Select
            value={value.rtl ? 'rtl' : 'ltr'}
            onChange={(e) => patch('rtl', e.target.value === 'rtl')}
          >
            <option value="ltr">Gauche → Droite</option>
            <option value="rtl">Droite → Gauche (RTL)</option>
          </Select>
        </Field>
        <Field label="Format de date">
          <Select
            value={value.date_format}
            onChange={(e) =>
              patch('date_format', e.target.value as LocalizationSettings['date_format'])
            }
          >
            <option value="DD/MM/YYYY">31/12/2026 (JJ/MM/AAAA)</option>
            <option value="MM/DD/YYYY">12/31/2026 (MM/JJ/AAAA)</option>
            <option value="YYYY-MM-DD">2026-12-31 (ISO)</option>
          </Select>
        </Field>
        <Field label="Séparateur décimal">
          <Select
            value={value.decimal_separator}
            onChange={(e) =>
              patch('decimal_separator', e.target.value as LocalizationSettings['decimal_separator'])
            }
          >
            <option value=",">Virgule (1 234,567)</option>
            <option value=".">Point (1,234.567)</option>
          </Select>
        </Field>
        <Field label="Séparateur des milliers">
          <Select
            value={value.thousands_separator}
            onChange={(e) =>
              patch(
                'thousands_separator',
                e.target.value as LocalizationSettings['thousands_separator'],
              )
            }
          >
            <option value=" ">Espace</option>
            <option value=",">Virgule</option>
            <option value=".">Point</option>
            <option value="'">Apostrophe</option>
            <option value="">Aucun</option>
          </Select>
        </Field>
        <Field label="Décimales — Montants">
          <Input
            type="number"
            min={0}
            max={6}
            value={value.amount_decimals}
            onChange={(e) => patch('amount_decimals', Math.max(0, Number(e.target.value)))}
          />
        </Field>
        <Field label="Décimales — Quantités">
          <Input
            type="number"
            min={0}
            max={6}
            value={value.quantity_decimals}
            onChange={(e) => patch('quantity_decimals', Math.max(0, Number(e.target.value)))}
          />
        </Field>
        <Field label="Décimales — Prix unitaires">
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
        <CardTitle>Devise</CardTitle>
        <CardDescription>Devise de référence et taux pour devises secondaires.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Code ISO (ex. TND, EUR)">
            <Input
              value={value.code}
              onChange={(e) => patch('code', e.target.value.toUpperCase())}
              maxLength={5}
            />
          </Field>
          <Field label="Symbole">
            <Input value={value.symbol} onChange={(e) => patch('symbol', e.target.value)} />
          </Field>
          <Field label="Position du symbole">
            <Select
              value={value.symbol_position}
              onChange={(e) =>
                patch('symbol_position', e.target.value as CurrencySettings['symbol_position'])
              }
            >
              <option value="suffix">Suffixe (1 000,000 TND)</option>
              <option value="prefix">Préfixe (TND 1 000,000)</option>
            </Select>
          </Field>
        </div>

        <div>
          <Label>Devises secondaires</Label>
          <div className="mt-2 space-y-2">
            {value.secondary.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucune devise secondaire définie.</p>
            )}
            {value.secondary.map((s, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12 sm:items-end">
                <Field label="Code" className="sm:col-span-3">
                  <Input
                    value={s.code}
                    onChange={(e) => patchSecondary(i, 'code', e.target.value.toUpperCase())}
                    maxLength={5}
                  />
                </Field>
                <Field label="Symbole" className="sm:col-span-3">
                  <Input value={s.symbol} onChange={(e) => patchSecondary(i, 'symbol', e.target.value)} />
                </Field>
                <Field label={`Taux (1 ${value.code} = ? ${s.code || '—'})`} className="sm:col-span-4">
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
                    aria-label="Supprimer"
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
              + Ajouter
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
  const today = new Date();
  function patchSeq(type: NumberedDocType, patch: Partial<NumberingSequence>) {
    onChange({ ...draft.numbering, [type]: { ...draft.numbering[type], ...patch } });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Numérotation des documents</CardTitle>
        <CardDescription>
          Préfixe, suffixe, nombre de chiffres et cycle de remise à zéro pour chaque type de
          document.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {NUMBERED_DOC_TYPES.map(({ id, label }) => {
          const seq = draft.numbering[id];
          const previewSettings: AppSettings = {
            ...draft,
            numbering: { ...draft.numbering, [id]: seq },
          };
          return (
            <div key={id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12 sm:items-end">
              <div className="sm:col-span-12 -mb-1 text-sm font-medium">{label}</div>
              <Field label="Préfixe" className="sm:col-span-2">
                <Input value={seq.prefix} onChange={(e) => patchSeq(id, { prefix: e.target.value })} />
              </Field>
              <Field label="Suffixe" className="sm:col-span-2">
                <Input value={seq.suffix} onChange={(e) => patchSeq(id, { suffix: e.target.value })} />
              </Field>
              <Field label="Chiffres" className="sm:col-span-1">
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
              <Field label="Réinitialisation" className="sm:col-span-3">
                <Select
                  value={seq.reset_cycle}
                  onChange={(e) =>
                    patchSeq(id, { reset_cycle: e.target.value as NumberingSequence['reset_cycle'] })
                  }
                >
                  <option value="never">Jamais</option>
                  <option value="yearly">Annuelle</option>
                  <option value="monthly">Mensuelle</option>
                </Select>
              </Field>
              <Field label="Prochain numéro" className="sm:col-span-1">
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
                <Label className="text-xs">Aperçu</Label>
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
          name: 'Nouveau taux',
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
          <CardTitle>Taux de taxes</CardTitle>
          <CardDescription>
            Définissez vos taux de TVA et autres retenues. Choisissez les valeurs par défaut pour
            les ventes et les achats.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tax.rates.map((r, i) => (
            <div key={r.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12 sm:items-end">
              <Field label="Nom" className="sm:col-span-3">
                <Input value={r.name} onChange={(e) => patchRate(i, { name: e.target.value })} />
              </Field>
              <Field label="Taux (%)" className="sm:col-span-2">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={r.rate}
                  onChange={(e) => patchRate(i, { rate: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Type" className="sm:col-span-3">
                <Select
                  value={r.type}
                  onChange={(e) => patchRate(i, { type: e.target.value as TaxRate['type'] })}
                >
                  <option value="vat">TVA</option>
                  <option value="withholding">Retenue à la source</option>
                  <option value="stamp">Timbre</option>
                  <option value="other">Autre</option>
                </Select>
              </Field>
              <Field label="Compte comptable" className="sm:col-span-3">
                <Input
                  value={r.account_code}
                  onChange={(e) => patchRate(i, { account_code: e.target.value })}
                />
              </Field>
              <div className="flex justify-end sm:col-span-1">
                <Button variant="ghost" size="icon" onClick={() => removeRate(i)} aria-label="Supprimer">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRate}>
            + Ajouter un taux
          </Button>

          <div className="grid gap-4 sm:grid-cols-2 pt-2">
            <Field label="Taxe par défaut — Ventes">
              <Select
                value={tax.default_sales_tax_id ?? ''}
                onChange={(e) =>
                  onChange({ ...tax, default_sales_tax_id: e.target.value || null })
                }
              >
                <option value="">— Aucune —</option>
                {tax.rates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.rate}%)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Taxe par défaut — Achats">
              <Select
                value={tax.default_purchase_tax_id ?? ''}
                onChange={(e) =>
                  onChange({ ...tax, default_purchase_tax_id: e.target.value || null })
                }
              >
                <option value="">— Aucune —</option>
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
              Les prix unitaires incluent la taxe
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tax.reverse_charge}
                onChange={(e) => onChange({ ...tax, reverse_charge: e.target.checked })}
              />
              Auto-liquidation (B2B intra-communautaire)
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timbre fiscal</CardTitle>
          <CardDescription>
            Montant fixe appliqué aux documents listés (TN/MA/DZ). Mettez 0 pour le désactiver.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Montant">
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
            <Label>Appliqué sur</Label>
            <div className="flex flex-wrap gap-3 text-sm">
              {SALES_DOC_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={tax.fiscal_stamp_doc_types.includes(t)}
                    onChange={() => toggleStampType(t)}
                  />
                  {t === 'invoice' ? 'Factures' : t === 'quote' ? 'Devis' : 'Bons de livraison'}
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
  function patch<K extends keyof DocumentDefaults>(key: K, v: DocumentDefaults[K]) {
    onChange({ ...value, [key]: v });
  }
  function patchNote(type: DocumentType, note: string) {
    onChange({ ...value, notes_per_type: { ...value.notes_per_type, [type]: note } });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Valeurs par défaut des documents</CardTitle>
        <CardDescription>Conditions de paiement, échéance, notes, signature.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Conditions de paiement">
            <Input
              value={value.payment_terms}
              onChange={(e) => patch('payment_terms', e.target.value)}
            />
          </Field>
          <Field label="Échéance par défaut (jours)">
            <Input
              type="number"
              min={0}
              value={value.due_date_offset_days}
              onChange={(e) => patch('due_date_offset_days', Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
          <Field label="Bloc signature" className="sm:col-span-2">
            <Input
              value={value.signature_block}
              onChange={(e) => patch('signature_block', e.target.value)}
              placeholder="Signature et cachet"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.watermark_drafts}
              onChange={(e) => patch('watermark_drafts', e.target.checked)}
            />
            Filigrane « BROUILLON » / « ANNULÉ » sur les PDF
          </label>
        </div>

        <div>
          <Label>Notes par type de document</Label>
          <div className="mt-2 space-y-2">
            {(['invoice', 'quote', 'delivery', 'purchase_order'] as DocumentType[]).map((t) => (
              <div key={t} className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
                <span className="text-sm text-muted-foreground">
                  {t === 'invoice'
                    ? 'Facture'
                    : t === 'quote'
                      ? 'Devis'
                      : t === 'delivery'
                        ? 'Bon de livraison'
                        : 'Bon de commande'}
                </span>
                <Input
                  value={value.notes_per_type[t] ?? ''}
                  onChange={(e) => patchNote(t, e.target.value)}
                  placeholder="Note imprimée par défaut"
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Apparence</CardTitle>
        <CardDescription>Couleur principale et style de PDF.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Couleur principale">
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
        <Field label="Modèle de PDF">
          <Select
            value={value.pdf_template}
            onChange={(e) =>
              onChange({ ...value, pdf_template: e.target.value as AppSettings['branding']['pdf_template'] })
            }
          >
            <option value="classic">Classique</option>
            <option value="modern">Moderne</option>
            <option value="minimal">Minimaliste</option>
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
        <CardTitle>Utilisateurs &amp; rôles</CardTitle>
        <CardDescription>
          Gestion locale des accès. La création de compte côté serveur sera ajoutée
          ultérieurement — cette liste documente qui doit avoir accès et avec quel rôle.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun utilisateur enregistré.</p>
        )}
        {accounts.map((a, i) => (
          <div key={a.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12 sm:items-end">
            <Field label="Nom" className="sm:col-span-3">
              <Input value={a.name} onChange={(e) => patch(i, { name: e.target.value })} />
            </Field>
            <Field label="Email" className="sm:col-span-4">
              <Input
                type="email"
                value={a.email}
                onChange={(e) => patch(i, { email: e.target.value })}
              />
            </Field>
            <Field label="Rôle" className="sm:col-span-3">
              <Select
                value={a.role}
                onChange={(e) => patch(i, { role: e.target.value as UserRole })}
              >
                <option value="admin">Administrateur</option>
                <option value="sales">Commercial</option>
                <option value="accountant">Comptable</option>
                <option value="viewer">Lecture seule</option>
              </Select>
            </Field>
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={a.invited}
                  onChange={(e) => patch(i, { invited: e.target.checked })}
                />
                Invité
              </label>
              <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Supprimer">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add}>
          + Ajouter un utilisateur
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
