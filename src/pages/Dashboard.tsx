import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  AlertTriangle,
  FileText,
  Plus,
  Wallet,
  Package,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import type { DocumentRecord, Product } from '@/types/db';

interface MonthBucket {
  month: string;
  sales: number;
  expenses: number;
}

function getLast6Months(): { key: string; label: string; year: number; month: number }[] {
  const out: { key: string; label: string; year: number; month: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({
      key,
      label: d.toLocaleString('en', { month: 'short' }),
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  return out;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [unpaidTotal, setUnpaidTotal] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const since = new Date();
      since.setMonth(since.getMonth() - 5);
      since.setDate(1);

      const [docsRes, productsRes, unpaidRes] = await Promise.all([
        supabase
          .from('documents')
          .select('*')
          .gte('date', since.toISOString().slice(0, 10))
          .order('date', { ascending: false }),
        supabase.from('products').select('*'),
        supabase
          .from('documents')
          .select('total_ttc, status, type')
          .eq('type', 'invoice')
          .in('status', ['issued', 'partially_paid']),
      ]);

      if (cancelled) return;

      const docs = (docsRes.data ?? []) as DocumentRecord[];
      const products = (productsRes.data ?? []) as Product[];
      const unpaidDocs = (unpaidRes.data ?? []) as Pick<DocumentRecord, 'total_ttc'>[];

      setDocuments(docs);
      setLowStock(
        products.filter(
          (p) => Number(p.stock_qty) <= Number(p.min_stock_alert) && Number(p.min_stock_alert) > 0,
        ),
      );
      setUnpaidTotal(unpaidDocs.reduce((s, d) => s + Number(d.total_ttc ?? 0), 0));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const monthlyData: MonthBucket[] = useMemo(() => {
    const months = getLast6Months();
    const buckets = new Map<string, MonthBucket>();
    months.forEach((m) => buckets.set(m.key, { month: m.label, sales: 0, expenses: 0 }));

    for (const d of documents) {
      const dt = new Date(d.date);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const ttc = Number(d.total_ttc ?? 0);
      if (d.type === 'invoice') bucket.sales += ttc;
      else if (d.type === 'purchase_order') bucket.expenses += ttc;
    }
    return Array.from(buckets.values());
  }, [documents]);

  const kpis = useMemo(() => {
    const totalSales = documents
      .filter((d) => d.type === 'invoice')
      .reduce((s, d) => s + Number(d.total_ttc ?? 0), 0);
    const totalExpenses = documents
      .filter((d) => d.type === 'purchase_order')
      .reduce((s, d) => s + Number(d.total_ttc ?? 0), 0);
    const invoiceCount = documents.filter((d) => d.type === 'invoice').length;
    return { totalSales, totalExpenses, invoiceCount };
  }, [documents]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of your sales, expenses and stock for the last 6 months.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/invoices/new">
            <Button>
              <Plus className="h-4 w-4" /> New invoice
            </Button>
          </Link>
          <Link to="/quotes/new">
            <Button variant="outline">
              <FileText className="h-4 w-4" /> New quote
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          loading={loading}
          label="Sales (6m)"
          value={formatMoney(kpis.totalSales, settings)}
          icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
        />
        <KpiCard
          loading={loading}
          label="Expenses (6m)"
          value={formatMoney(kpis.totalExpenses, settings)}
          icon={<ArrowUpRight className="h-4 w-4 text-rose-600" />}
        />
        <KpiCard
          loading={loading}
          label="Unpaid invoices"
          value={formatMoney(unpaidTotal, settings)}
          icon={<Wallet className="h-4 w-4 text-amber-600" />}
        />
        <KpiCard
          loading={loading}
          label="Invoices issued"
          value={String(kpis.invoiceCount)}
          icon={<FileText className="h-4 w-4 text-primary" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales vs Expenses</CardTitle>
            <CardDescription>Monthly TTC totals (TND).</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" stroke="currentColor" fontSize={12} />
                  <YAxis stroke="currentColor" fontSize={12} />
                  <Tooltip
                    formatter={(v: number) => formatMoney(v, settings)}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend />
                  <Bar dataKey="sales" name="Sales" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Low stock alerts
            </CardTitle>
            <CardDescription>Products at or below the alert threshold.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : lowStock.length === 0 ? (
              <EmptyState
                icon={Package}
                title="All good"
                description="No products below the alert threshold."
              />
            ) : (
              <ul className="divide-y">
                {lowStock.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        SKU {p.sku ?? '—'}
                      </div>
                    </div>
                    <Badge variant="warning">{Number(p.stock_qty)} left</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          {icon} {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-7 w-24" /> : <div className="text-2xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}
