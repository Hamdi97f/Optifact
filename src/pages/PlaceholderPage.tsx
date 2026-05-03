import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/i18n';

interface PlaceholderPageProps {
  /** Optional translation key for the title; falls back to `title`. */
  titleKey?: string;
  /** Optional translation key for the description; falls back to `description`. */
  descriptionKey?: string;
  title?: string;
  description?: string;
  icon?: LucideIcon;
}

/**
 * Placeholder for modules that are part of the architect brief but not yet
 * implemented in this initial scaffold (Products, Entities, Payments, etc.).
 */
export function PlaceholderPage({
  title,
  description,
  titleKey,
  descriptionKey,
  icon = Construction,
}: PlaceholderPageProps) {
  const { t } = useI18n();
  const resolvedTitle = titleKey ? t(titleKey) : (title ?? '');
  const resolvedDescription = descriptionKey ? t(descriptionKey) : (description ?? '');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{resolvedTitle}</h1>
        <p className="text-sm text-muted-foreground">{resolvedDescription}</p>
      </div>
      <EmptyState
        icon={icon}
        title={t('placeholder.coming_soon')}
        description={t('placeholder.coming_soon_desc')}
      />
    </div>
  );
}
