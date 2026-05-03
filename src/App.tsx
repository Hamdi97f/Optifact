import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Package, Truck, Users, Wallet } from 'lucide-react';
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
              element={
                <DocumentListPage
                  type="invoice"
                  title="Invoices"
                  description="Manage and track your invoices."
                  newPath="/invoices/new"
                />
              }
            />
            <Route
              path="invoices/new"
              element={
                <DocumentCreatePage type="invoice" title="Invoice" redirectTo="/invoices" />
              }
            />

            <Route
              path="quotes"
              element={
                <DocumentListPage
                  type="quote"
                  title="Quotes"
                  description="Quotes can be converted to invoices in one click."
                  newPath="/quotes/new"
                  enableQuoteConversion
                />
              }
            />
            <Route
              path="quotes/new"
              element={<DocumentCreatePage type="quote" title="Quote" redirectTo="/quotes" />}
            />

            <Route
              path="deliveries"
              element={
                <DocumentListPage
                  type="delivery"
                  title="Deliveries"
                  description="Delivery notes — issuing one deducts product stock."
                  newPath="/deliveries/new"
                />
              }
            />
            <Route
              path="deliveries/new"
              element={
                <DocumentCreatePage
                  type="delivery"
                  title="Delivery note"
                  redirectTo="/deliveries"
                />
              }
            />

            <Route
              path="purchase-orders"
              element={
                <DocumentListPage
                  type="purchase_order"
                  title="Purchase Orders"
                  description="Issuing a purchase order increases stock automatically."
                  newPath="/purchase-orders/new"
                />
              }
            />
            <Route
              path="purchase-orders/new"
              element={
                <DocumentCreatePage
                  type="purchase_order"
                  title="Purchase order"
                  redirectTo="/purchase-orders"
                />
              }
            />

            <Route
              path="products"
              element={
                <PlaceholderPage
                  title="Products"
                  description="Catalog with stock and pricing."
                  icon={Package}
                />
              }
            />
            <Route
              path="clients"
              element={
                <PlaceholderPage
                  title="Clients & Suppliers"
                  description="Manage business contacts."
                  icon={Users}
                />
              }
            />
            <Route
              path="payments"
              element={
                <PlaceholderPage
                  title="Payments"
                  description="Track invoice payments and outstanding balances."
                  icon={Wallet}
                />
              }
            />
            <Route
              path="settings"
              element={<SettingsPage />}
            />

            <Route
              path="*"
              element={
                <PlaceholderPage
                  title="Not found"
                  description="That page doesn't exist."
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
