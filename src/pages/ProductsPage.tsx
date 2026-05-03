import { useEffect, useMemo, useState } from 'react';
import { Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { formatMoney, formatQuantity, roundTo } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import type { Product } from '@/types/db';

interface ProductDraft {
  name: string;
  sku: string;
  purchase_price: number;
  sale_price: number;
  stock_qty: number;
  min_stock_alert: number;
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  sku: '',
  purchase_price: 0,
  sale_price: 0,
  stock_qty: 0,
  min_stock_alert: 0,
};

export default function ProductsPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await supabase.from('products').select('*').order('name');
    setProducts((res.data ?? []) as Product[]);
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q),
    );
  }, [products, search]);

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setCreating(true);
  }

  function openEdit(p: Product) {
    setCreating(false);
    setEditing(p);
    setError(null);
    setDraft({
      name: p.name,
      sku: p.sku ?? '',
      purchase_price: Number(p.purchase_price),
      sale_price: Number(p.sale_price),
      stock_qty: Number(p.stock_qty),
      min_stock_alert: Number(p.min_stock_alert),
    });
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setError(null);
  }

  async function handleSave() {
    if (!user) return;
    if (!draft.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const qtyDecimals = settings.localization.quantity_decimals;
      const priceDecimals = settings.localization.unit_price_decimals;
      const payload = {
        name: draft.name.trim(),
        sku: draft.sku.trim() || null,
        purchase_price: roundTo(Number(draft.purchase_price) || 0, priceDecimals),
        sale_price: roundTo(Number(draft.sale_price) || 0, priceDecimals),
        stock_qty: roundTo(Number(draft.stock_qty) || 0, qtyDecimals),
        min_stock_alert: roundTo(Number(draft.min_stock_alert) || 0, qtyDecimals),
      };
      if (editing) {
        const res = await supabase.from('products').update(payload).eq('id', editing.id);
        if (res.error) throw res.error;
      } else {
        const res = await supabase
          .from('products')
          .insert({ ...payload, tenant_id: user.id });
        if (res.error) throw res.error;
      }
      await load();
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Product) {
    if (!confirm(`Delete product "${p.name}"?`)) return;
    const res = await supabase.from('products').delete().eq('id', p.id);
    if (res.error) {
      alert(res.error.message);
      return;
    }
    await load();
  }

  const formOpen = creating || editing !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Catalog with stock and pricing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New product
          </Button>
        </div>
      </div>

      {formOpen && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle>{editing ? 'Edit product' : 'New product'}</CardTitle>
              <CardDescription>
                {editing
                  ? 'Update the product details below.'
                  : 'Add a product to your catalog.'}
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={closeForm} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="p-name">Name</Label>
                <Input
                  id="p-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Cement bag 25kg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-sku">SKU</Label>
                <Input
                  id="p-sku"
                  value={draft.sku}
                  onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-stock">Stock quantity</Label>
                <Input
                  id="p-stock"
                  type="number"
                  step="0.001"
                  value={draft.stock_qty}
                  onChange={(e) =>
                    setDraft({ ...draft, stock_qty: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-purchase">Purchase price</Label>
                <Input
                  id="p-purchase"
                  type="number"
                  step="0.001"
                  min={0}
                  value={draft.purchase_price}
                  onChange={(e) =>
                    setDraft({ ...draft, purchase_price: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-sale">Sale price</Label>
                <Input
                  id="p-sale"
                  type="number"
                  step="0.001"
                  min={0}
                  value={draft.sale_price}
                  onChange={(e) =>
                    setDraft({ ...draft, sale_price: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-min">Low-stock alert threshold</Label>
                <Input
                  id="p-min"
                  type="number"
                  step="0.001"
                  min={0}
                  value={draft.min_stock_alert}
                  onChange={(e) =>
                    setDraft({ ...draft, min_stock_alert: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeForm} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All products</CardTitle>
          <CardDescription>Search by name or SKU.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No products yet"
              description="Add your first product to start tracking stock and pricing."
              action={
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> New product
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Sale</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const stock = Number(p.stock_qty);
                  const min = Number(p.min_stock_alert);
                  const low = min > 0 && stock <= min;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.sku ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(Number(p.purchase_price), settings)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(Number(p.sale_price), settings)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {low ? (
                          <Badge variant="warning">
                            {formatQuantity(stock, settings)} left
                          </Badge>
                        ) : (
                          formatQuantity(stock, settings)
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(p)}
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(p)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
