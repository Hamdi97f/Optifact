import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, Sparkles, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';

export function AppLayout() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes so navigating
  // to a page from the menu doesn't leave the drawer open behind it.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const original = document.body.style.overflow;
    document.body.style.overflow = mobileOpen ? 'hidden' : original;
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobileOpen]);

  const brandName =
    settings.company.trade_name || settings.company.legal_name || 'Optifact';

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      {/* Persistent sidebar on tablet/desktop */}
      <Sidebar className="hidden md:flex" />

      {/* Mobile off-canvas drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <Sidebar
            className="absolute inset-y-0 start-0 flex w-72 max-w-[85%] shadow-xl"
            onNavigate={() => setMobileOpen(false)}
            onClose={() => setMobileOpen(false)}
            showCloseButton
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top app bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card px-3 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label={t('nav.menu')}
          >
            <Menu className="h-5 w-5" />
          </Button>
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
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight" title={brandName}>
              {brandName}
            </div>
          </div>
          {/* Reserved for future actions; X icon imported for parity with Sidebar */}
          <span className="hidden">
            <X className="h-4 w-4" />
          </span>
        </header>

        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-7xl p-3 sm:p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
