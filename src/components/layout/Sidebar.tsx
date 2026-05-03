import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Package,
  Users,
  Truck,
  ShoppingCart,
  Wallet,
  LogOut,
  Settings,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices', labelKey: 'nav.invoices', icon: FileText },
  { to: '/quotes', labelKey: 'nav.quotes', icon: FileText },
  { to: '/deliveries', labelKey: 'nav.deliveries', icon: Truck },
  { to: '/purchase-orders', labelKey: 'nav.purchase_orders', icon: ShoppingCart },
  { to: '/products', labelKey: 'nav.products', icon: Package },
  { to: '/clients', labelKey: 'nav.clients', icon: Users },
  { to: '/payments', labelKey: 'nav.payments', icon: Wallet },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export function Sidebar() {
  const { signOut, user } = useAuth();
  const { t } = useI18n();
  const { settings } = useSettings();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const brandName = settings.company.trade_name || settings.company.legal_name || 'Optifact';

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-primary text-primary-foreground">
          {settings.company.logo_data_url ? (
            <img
              src={settings.company.logo_data_url}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight" title={brandName}>
            {brandName}
          </div>
          <div className="text-xs text-muted-foreground">{t('app.tagline')}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map(({ to, labelKey, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-3">
        <div className="mb-2 truncate px-2 text-xs text-muted-foreground" title={user?.email ?? ''}>
          {user?.email ?? 'Guest'}
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" /> {t('auth.signout')}
        </Button>
      </div>
    </aside>
  );
}
