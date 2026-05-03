/**
 * Tiny in-house i18n. Avoids pulling in a full library for the small set of
 * translatable strings we currently need; new keys can be added freely and
 * the unknown-key fallback returns the key itself so missing translations
 * are visible (rather than silently empty).
 *
 * Wired to `useSettings().settings.localization.language`.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Language } from '@/types/settings';
import { useSettings } from '@/hooks/useSettings';

type Dict = Record<string, string>;

const fr: Dict = {
  'app.tagline': 'ERP SaaS',
  'nav.dashboard': 'Tableau de bord',
  'nav.invoices': 'Factures',
  'nav.quotes': 'Devis',
  'nav.deliveries': 'Bons de livraison',
  'nav.purchase_orders': 'Bons de commande',
  'nav.products': 'Produits',
  'nav.clients': 'Clients & Fournisseurs',
  'nav.payments': 'Paiements',
  'nav.settings': 'Paramètres',
  'auth.signout': 'Déconnexion',

  'settings.title': 'Paramètres',
  'settings.description':
    'Configurez votre société, devise, langue, numérotation, taxes et plus.',
  'settings.save': 'Enregistrer',
  'settings.saved': 'Modifications enregistrées.',
  'settings.saving': 'Enregistrement…',
  'settings.error': 'Erreur lors de l’enregistrement.',
  'settings.tab.company': 'Société',
  'settings.tab.localization': 'Localisation',
  'settings.tab.currency': 'Devise',
  'settings.tab.numbering': 'Numérotation',
  'settings.tab.tax': 'Taxes',
  'settings.tab.documents': 'Documents',
  'settings.tab.branding': 'Apparence',
  'settings.tab.users': 'Utilisateurs',
};

const en: Dict = {
  'app.tagline': 'SaaS ERP',
  'nav.dashboard': 'Dashboard',
  'nav.invoices': 'Invoices',
  'nav.quotes': 'Quotes',
  'nav.deliveries': 'Deliveries',
  'nav.purchase_orders': 'Purchase Orders',
  'nav.products': 'Products',
  'nav.clients': 'Clients & Suppliers',
  'nav.payments': 'Payments',
  'nav.settings': 'Settings',
  'auth.signout': 'Sign out',

  'settings.title': 'Settings',
  'settings.description':
    'Configure your company, currency, language, numbering, taxes and more.',
  'settings.save': 'Save',
  'settings.saved': 'Changes saved.',
  'settings.saving': 'Saving…',
  'settings.error': 'Failed to save changes.',
  'settings.tab.company': 'Company',
  'settings.tab.localization': 'Localization',
  'settings.tab.currency': 'Currency',
  'settings.tab.numbering': 'Numbering',
  'settings.tab.tax': 'Taxes',
  'settings.tab.documents': 'Documents',
  'settings.tab.branding': 'Branding',
  'settings.tab.users': 'Users',
};

const ar: Dict = {
  'app.tagline': 'نظام تخطيط موارد المؤسسات',
  'nav.dashboard': 'لوحة التحكم',
  'nav.invoices': 'الفواتير',
  'nav.quotes': 'عروض الأسعار',
  'nav.deliveries': 'سندات التسليم',
  'nav.purchase_orders': 'أوامر الشراء',
  'nav.products': 'المنتجات',
  'nav.clients': 'العملاء والموردون',
  'nav.payments': 'المدفوعات',
  'nav.settings': 'الإعدادات',
  'auth.signout': 'تسجيل الخروج',

  'settings.title': 'الإعدادات',
  'settings.description': 'قم بتكوين الشركة والعملة واللغة والترقيم والضرائب والمزيد.',
  'settings.save': 'حفظ',
  'settings.saved': 'تم حفظ التعديلات.',
  'settings.saving': 'جارٍ الحفظ…',
  'settings.error': 'فشل حفظ التعديلات.',
  'settings.tab.company': 'الشركة',
  'settings.tab.localization': 'التوطين',
  'settings.tab.currency': 'العملة',
  'settings.tab.numbering': 'الترقيم',
  'settings.tab.tax': 'الضرائب',
  'settings.tab.documents': 'المستندات',
  'settings.tab.branding': 'الهوية',
  'settings.tab.users': 'المستخدمون',
};

const DICTS: Record<Language, Dict> = { fr, en, ar };

interface I18nContextValue {
  lang: Language;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const lang = settings.localization.language;

  const value = useMemo<I18nContextValue>(() => {
    const dict = DICTS[lang] ?? en;
    return {
      lang,
      t: (key: string) => dict[key] ?? en[key] ?? key,
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an <I18nProvider>');
  return ctx;
}
