import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon?: LucideIcon;
}

/**
 * Placeholder for modules that are part of the architect brief but not yet
 * implemented in this initial scaffold (Products, Entities, Payments, etc.).
 */
export function PlaceholderPage({ title, description, icon = Construction }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <EmptyState
        icon={icon}
        title="Coming soon"
        description="This module is wired into the database and routing, and will be implemented next."
      />
    </div>
  );
}
