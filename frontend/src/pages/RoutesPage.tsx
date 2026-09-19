import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Plus, Edit, Trash2, Users, Eye, EyeOff } from 'lucide-react';

interface Route {
  id: string;
  name: string;
  customer_count: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  is_active: boolean;
}

export default function RoutesPage() {
  const { userRole } = useAuth();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Route | null>(null);
  const [viewCustomers, setViewCustomers] = useState<Route | null>(null);
  const [routeCustomers, setRouteCustomers] = useState<Customer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [routeName, setRouteName] = useState('');

  useEffect(() => {
    fetchRoutes();
  }, []);

  async function fetchRoutes() {
    setLoading(true);
    const { data: routesData, error: routesError } = await supabase
      .from('routes')
      .select('id, name')
      .order('name');

    if (routesError) {
      console.error('Error fetching routes:', routesError);
    } else {
      const routesWithCounts = await Promise.all(
        (routesData || []).map(async (route) => {
          const { count } = await supabase
            .from('customers')
            .select('*', { count: 'exact', head: true })
            .eq('route_id', route.id);

          return {
            ...route,
            customer_count: count || 0,
          };
        })
      );
      setRoutes(routesWithCounts);
    }
    setLoading(false);
  }

  async function fetchRouteCustomers(routeId: string) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone, is_active')
      .eq('route_id', routeId)
      .order('name');

    if (error) {
      console.error('Error fetching customers:', error);
    } else {
      setRouteCustomers(data || []);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const routeData = { name: routeName };

    let error;
    if (editingRoute) {
      ({ error } = await supabase
        .from('routes')
        .update(routeData)
        .eq('id', editingRoute.id));
    } else {
      ({ error } = await supabase.from('routes').insert(routeData));
    }

    if (error) {
      console.error('Error saving route:', error);
      alert('Error saving route');
    } else {
      setShowForm(false);
      setEditingRoute(null);
      setRouteName('');
      fetchRoutes();
    }
    setSubmitting(false);
  }

  async function handleDeleteRoute() {
    if (!deleteConfirm) return;

    await supabase.from('customers').update({ route_id: null }).eq('route_id', deleteConfirm.id);
    await supabase.from('employee_routes').delete().eq('route_id', deleteConfirm.id);

    const { error } = await supabase
      .from('routes')
      .delete()
      .eq('id', deleteConfirm.id);

    if (error) {
      console.error('Error deleting route:', error);
      alert('Error deleting route. Make sure no customers are assigned to this route.');
    } else {
      setDeleteConfirm(null);
      fetchRoutes();
    }
  }

  function openEditForm(route: Route) {
    setEditingRoute(route);
    setRouteName(route.name);
    setShowForm(true);
  }

  async function openViewCustomers(route: Route) {
    setViewCustomers(route);
    await fetchRouteCustomers(route.id);
  }

  const columns = [
    { key: 'name', header: 'Route Name' },
    {
      key: 'customer_count',
      header: 'Customers',
      render: (value: number) => (
        <span className="flex items-center gap-1">
          <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          {value}
        </span>
      ),
    },
    ...(userRole === 'admin'
      ? [
          {
            key: 'actions',
            header: '',
            render: (_: any, row: Route) => (
              <div className="flex gap-2">
                <button
                  onClick={() => openViewCustomers(row)}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                  title="View Customers"
                >
                  <Eye className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </button>
                <button
                  onClick={() => openEditForm(row)}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                >
                  <Edit className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </button>
                <button
                  onClick={() => setDeleteConfirm(row)}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                >
                  <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Routes</h1>
        {userRole === 'admin' && (
          <button
            onClick={() => {
              setEditingRoute(null);
              setRouteName('');
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Route
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={routes}
        loading={loading}
        emptyMessage="No routes found"
      />

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingRoute(null);
        }}
        title={editingRoute ? 'Edit Route' : 'Add Route'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Route Name</label>
            <input
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              placeholder="Enter route name"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingRoute(null);
              }}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : editingRoute ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!viewCustomers}
        onClose={() => setViewCustomers(null)}
        title={`Customers in ${viewCustomers?.name || ''}`}
      >
        <div className="space-y-4">
          {routeCustomers.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-center py-4">
              No customers in this route
            </p>
          ) : (
            <div className="divide-y border rounded-lg">
              {routeCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="p-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{customer.phone}</p>
                  </div>
                  <span
                    className={cn(
                      'px-2 py-1 text-xs rounded-full font-medium',
                      customer.is_active
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                    )}
                  >
                    {customer.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteRoute}
        title="Delete Route"
        message={`Are you sure you want to delete route "${deleteConfirm?.name}"? ${deleteConfirm && deleteConfirm.customer_count > 0 ? `This will unassign ${deleteConfirm.customer_count} customer(s) from this route.` : ''} This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
