import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { AuthProvider } from '@/hooks/useAuth';
import { SettingsProvider } from '@/hooks/useSettings';
import { I18nProvider } from '@/lib/i18n';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import { DocumentListPage } from '@/pages/DocumentListPage';
import { DocumentCreatePage } from '@/pages/DocumentCreatePage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import ProductsPage from '@/pages/ProductsPage';
import EntitiesPage from '@/pages/EntitiesPage';
import PaymentsPage from '@/pages/PaymentsPage';
import SettingsPage from '@/pages/SettingsPage';

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <I18nProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />

                <Route
                  path="invoices"
                  element={<DocumentListPage type="invoice" newPath="/invoices/new" />}
                />
                <Route
                  path="invoices/new"
                  element={<DocumentCreatePage type="invoice" redirectTo="/invoices" />}
                />

                <Route
                  path="quotes"
                  element={
                    <DocumentListPage
                      type="quote"
                      newPath="/quotes/new"
                      enableQuoteConversion
                    />
                  }
                />
                <Route
                  path="quotes/new"
                  element={<DocumentCreatePage type="quote" redirectTo="/quotes" />}
                />

                <Route
                  path="deliveries"
                  element={<DocumentListPage type="delivery" newPath="/deliveries/new" />}
                />
                <Route
                  path="deliveries/new"
                  element={<DocumentCreatePage type="delivery" redirectTo="/deliveries" />}
                />

                <Route
                  path="purchase-orders"
                  element={
                    <DocumentListPage
                      type="purchase_order"
                      newPath="/purchase-orders/new"
                    />
                  }
                />
                <Route
                  path="purchase-orders/new"
                  element={
                    <DocumentCreatePage
                      type="purchase_order"
                      redirectTo="/purchase-orders"
                    />
                  }
                />

                <Route path="products" element={<ProductsPage />} />
                <Route path="clients" element={<EntitiesPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="settings" element={<SettingsPage />} />

                <Route
                  path="*"
                  element={
                    <PlaceholderPage
                      titleKey="placeholder.notfound.title"
                      descriptionKey="placeholder.notfound.desc"
                      icon={Truck}
                    />
                  }
                />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </I18nProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
