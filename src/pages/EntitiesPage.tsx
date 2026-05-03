import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
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
import type { Entity, EntityType } from '@/types/db';

interface EntityDraft {
  type: EntityType;
  name: string;
  phone: string;
  email: string;
  address: string;
  tax_id: string;
}

const EMPTY_DRAFT: EntityDraft = {
  type: 'client',
  name: '',
  phone: '',
  email: '',
  address: '',
  tax_id: '',
};

export default function EntitiesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<EntityType | 'all'>('all');
  const [editing, setEditing] = useState<Entity | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<EntityDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await supabase.from('entities').select('*').order('name');
    setEntities((res.data ?? []) as Entity[]);
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entities.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.email ?? '').toLowerCase().includes(q) ||
        (e.phone ?? '').toLowerCase().includes(q) ||
        (e.tax_id ?? '').toLowerCase().includes(q)
      );
    });
  }, [entities, search, typeFilter]);

  function openCreate() {
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT, type: typeFilter === 'supplier' ? 'supplier' : 'client' });
    setError(null);
    setCreating(true);
  }

  function openEdit(e: Entity) {
    setCreating(false);
    setEditing(e);
    setError(null);
    setDraft({
      type: e.type,
      name: e.name,
      phone: e.phone ?? '',
      email: e.email ?? '',
      address: e.address ?? '',
      tax_id: e.tax_id ?? '',
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
      const payload = {
        type: draft.type,
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        address: draft.address.trim() || null,
        tax_id: draft.tax_id.trim() || null,
      };
      if (editing) {
        const res = await supabase.from('entities').update(payload).eq('id', editing.id);
        if (res.error) throw res.error;
      } else {
        const res = await supabase
          .from('entities')
          .insert({ ...payload, tenant_id: user.id });
        if (res.error) throw res.error;
      }
      await load();
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save contact.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(e: Entity) {
    if (!confirm(`Delete ${e.type} "${e.name}"?`)) return;
    const res = await supabase.from('entities').delete().eq('id', e.id);
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
          <h1 className="text-2xl font-bold tracking-tight">Clients & Suppliers</h1>
          <p className="text-sm text-muted-foreground">Manage business contacts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New contact
          </Button>
        </div>
      </div>

      {formOpen && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle>{editing ? 'Edit contact' : 'New contact'}</CardTitle>
              <CardDescription>
                {editing
                  ? 'Update the contact details below.'
                  : 'Add a client or supplier.'}
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={closeForm} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="e-type">Type</Label>
                <Select
                  id="e-type"
                  value={draft.type}
                  onChange={(ev) =>
                    setDraft({ ...draft, type: ev.target.value as EntityType })
                  }
                >
                  <option value="client">Client</option>
                  <option value="supplier">Supplier</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-name">Name</Label>
                <Input
                  id="e-name"
                  value={draft.name}
                  onChange={(ev) => setDraft({ ...draft, name: ev.target.value })}
                  placeholder="Company or person name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-email">Email</Label>
                <Input
                  id="e-email"
                  type="email"
                  value={draft.email}
                  onChange={(ev) => setDraft({ ...draft, email: ev.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-phone">Phone</Label>
                <Input
                  id="e-phone"
                  value={draft.phone}
                  onChange={(ev) => setDraft({ ...draft, phone: ev.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="e-address">Address</Label>
                <Input
                  id="e-address"
                  value={draft.address}
                  onChange={(ev) => setDraft({ ...draft, address: ev.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="e-tax">Tax ID</Label>
                <Input
                  id="e-tax"
                  value={draft.tax_id}
                  onChange={(ev) => setDraft({ ...draft, tax_id: ev.target.value })}
                  placeholder="Optional"
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
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create contact'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All contacts</CardTitle>
          <CardDescription>Search by name, email, phone or tax ID.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-9"
              />
            </div>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as EntityType | 'all')}
              className="sm:w-48"
            >
              <option value="all">All types</option>
              <option value="client">Clients</option>
              <option value="supplier">Suppliers</option>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No contacts yet"
              description="Add your first client or supplier to get started."
              action={
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> New contact
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Tax ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell>
                      <Badge variant={e.type === 'client' ? 'default' : 'secondary'}>
                        {e.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.email ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.phone ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.tax_id ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(e)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(e)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
