import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, cn } from '@/lib/utils';
import DataTable from '@/components/DataTable';
import BulkUpload from '@/components/BulkUpload';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import DetailModal from '@/components/DetailModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Plus, Edit, Search, Upload, UserX, UserCheck, FileDown, FileSpreadsheet } from 'lucide-react';

interface Customer {
  id: string;
  shop_code: string;
  name: string;
  address: string;
  phone: string;
  route_id: string;
  route_name: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
}

interface Route {
  id: string;
  name: string;
}

interface CustomerFormData {
  shop_code: string;
  name: string;
  address: string;
  phone: string;
  route_id: string;
  opening_balance: string;
}

export default function CustomersPage() {
  const { userRole } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detailModal, setDetailModal] = useState<{ type: 'shop' | 'employee'; id: string; name: string } | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>({
    shop_code: '',
    name: '',
    address: '',
    phone: '',
    route_id: '',
    opening_balance: '0',
  });

  useEffect(() => {
    fetchCustomers();
    fetchRoutes();
  }, [routeFilter]);

  async function fetchCustomers() {
    setLoading(true);
    let query = supabase
      .from('customers')
      .select(
        `
        *,
        route:routes(name)
      `
      )
      .order('name');

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching customers:', error);
    } else {
      const customerIds = (data || []).map((c) => c.id);

      const [billsResult, recoveriesResult] = await Promise.all([
        supabase
          .from('bills')
          .select('customer_id, credit_amount')
          .in('customer_id', customerIds)
          .eq('is_voided', false),
        supabase
          .from('recoveries')
          .select('customer_id, amount')
          .in('customer_id', customerIds),
      ]);

      const creditMap: Record<string, number> = {};
      (billsResult.data || []).forEach((b) => {
        creditMap[b.customer_id] =
          (creditMap[b.customer_id] || 0) + b.credit_amount;
      });

      const recoveryMap: Record<string, number> = {};
      (recoveriesResult.data || []).forEach((r) => {
        recoveryMap[r.customer_id] =
          (recoveryMap[r.customer_id] || 0) + r.amount;
      });

      setCustomers(
        (data || []).map((c: any) => ({
          ...c,
          route_name: c.route?.name || 'N/A',
          current_balance:
            (c.opening_balance || 0) +
            (creditMap[c.id] || 0) -
            (recoveryMap[c.id] || 0),
        }))
      );
    }
    setLoading(false);
  }

  async function fetchRoutes() {
    const { data, error } = await supabase
      .from('routes')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Error fetching routes:', error);
    } else {
      setRoutes(data || []);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const customerData = {
      shop_code: formData.shop_code || null,
      name: formData.name,
      address: formData.address,
      phone: formData.phone,
      route_id: formData.route_id || null,
      opening_balance: parseFloat(formData.opening_balance) || 0,
    };

    let error;
    if (editingCustomer) {
      ({ error } = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', editingCustomer.id));
    } else {
      ({ error } = await supabase.from('customers').insert(customerData));
    }

    if (error) {
      console.error('Error saving customer:', error);
      alert('Error saving customer');
    } else {
      setShowForm(false);
      setEditingCustomer(null);
      resetForm();
      fetchCustomers();
    }
    setSubmitting(false);
  }

  function resetForm() {
    setFormData({
      shop_code: '',
      name: '',
      address: '',
      phone: '',
      route_id: '',
      opening_balance: '0',
    });
  }

  function openEditForm(customer: Customer) {
    setEditingCustomer(customer);
    setFormData({
      shop_code: customer.shop_code || '',
      name: customer.name,
      address: customer.address || '',
      phone: customer.phone || '',
      route_id: customer.route_id || '',
      opening_balance: (customer.opening_balance || 0).toString(),
    });
    setShowForm(true);
  }

  async function handleToggleStatus() {
    if (!statusConfirm) return;
    const { error } = await supabase
      .from('customers')
      .update({ is_active: !statusConfirm.is_active })
      .eq('id', statusConfirm.id);

    if (error) {
      console.error('Error toggling customer status:', error);
    } else {
      setStatusConfirm(null);
      fetchCustomers();
    }
  }

  async function handleBulkUpload(data: any[], rawHeaders?: string[]) {
    const routeMap: Record<string, string> = {};
    routes.forEach((r) => { routeMap[r.name.toLowerCase()] = r.id; });

    let detectedRouteId: string | null = null;
    for (const h of (rawHeaders || [])) {
      const match = routeMap[h.trim().toLowerCase()];
      if (match) {
        detectedRouteId = match;
        break;
      }
    }

    const customersToInsert = data.map((row) => {
      const routeName = row.route || row.route_name || '';
      return {
        shop_code: row.shop_code || null,
        name: row.name,
        address: row.address || '',
        phone: row.phone || '',
        route_id: routeMap[routeName.toLowerCase()] || detectedRouteId,
        opening_balance: parseFloat(row.opening_balance) || 0,
      };
    });

    const { error } = await supabase
      .from('customers')
      .upsert(customersToInsert, { onConflict: 'shop_code' });

    if (error) {
      console.error('Error bulk uploading customers:', error);
      alert(`Upload failed: ${error.message}\n${error.details || ''}`);
    } else {
      setShowBulkUpload(false);
      fetchCustomers();
    }
  }

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRoute = !routeFilter || c.route_id === routeFilter;
    return matchesSearch && matchesRoute;
  });

  function generatePDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const companyName = localStorage.getItem('companyName') || 'Distribution & Credit Management System';
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName, pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Customers Report', pageWidth / 2, 22, { align: 'center' });

    const headers = [['Shop Code', 'Name', 'Route', 'Phone', 'Opening Balance', 'Current Balance', 'Status']];
    const rows = filteredCustomers.map((c) => [
      c.shop_code || '-',
      c.name,
      c.route_name,
      c.phone || '-',
      formatCurrency(c.opening_balance),
      formatCurrency(c.current_balance),
      c.is_active ? 'Active' : 'Inactive',
    ]);

    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
      margin: { left: 10, right: 10 },
    });

    doc.save('Customers_Report.pdf');
  }

  function generateExcel() {
    const companyName = localStorage.getItem('companyName') || 'Distribution & Credit Management System';
    const headers = ['Shop Code', 'Name', 'Route', 'Phone', 'Opening Balance', 'Current Balance', 'Status'];
    const rows = filteredCustomers.map((c) => [
      c.shop_code || '',
      c.name,
      c.route_name,
      c.phone || '',
      c.opening_balance,
      c.current_balance,
      c.is_active ? 'Active' : 'Inactive',
    ]);

    const wb = XLSX.utils.book_new();
    const wsData = [[companyName], ['Customers Report'], [], headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Customers Report');
    XLSX.writeFile(wb, 'Customers_Report.xlsx');
  }

  const columns = [
    { key: 'shop_code', header: 'Shop Code' },
    {
      key: 'name',
      header: 'Name',
      render: (value: string, row: Customer) => (
        <button
          onClick={() => setDetailModal({ type: 'shop', id: row.id, name: value })}
          className="text-blue-600 hover:underline font-medium"
        >
          {value}
        </button>
      ),
    },
    { key: 'route_name', header: 'Route' },
    { key: 'phone', header: 'Phone' },
    {
      key: 'opening_balance',
      header: 'Opening Balance',
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'current_balance',
      header: 'Current Balance',
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (value: boolean) => (
        <span
          className={cn(
            'px-2 py-1 text-xs rounded-full font-medium',
            value
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
          )}
        >
          {value ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    ...(userRole === 'admin'
      ? [
          {
            key: 'actions',
            header: '',
            render: (_: any, row: Customer) => (
              <div className="flex gap-2">
                <button
                  onClick={() => openEditForm(row)}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                >
                  <Edit className="h-4 w-4 text-gray-600" />
                </button>
                <button
                  onClick={() => setStatusConfirm(row)}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                >
                  {row.is_active ? (
                    <UserX className="h-4 w-4 text-red-600" />
                  ) : (
                    <UserCheck className="h-4 w-4 text-green-600" />
                  )}
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
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Customers</h1>
        <div className="flex gap-2">
          {userRole === 'admin' && (
            <>
              <button
                onClick={generatePDF}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <FileDown className="h-4 w-4" />
                Export PDF
              </button>
              <button
                onClick={generateExcel}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Export Excel
              </button>
              <button
                onClick={() => setShowBulkUpload(true)}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <Upload className="h-4 w-4" />
                Bulk Upload
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setEditingCustomer(null);
                  setShowForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Add Customer
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
          />
        </div>
        <select
          value={routeFilter}
          onChange={(e) => setRouteFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
        >
          <option value="">All Routes</option>
          {routes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.name}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filteredCustomers}
        loading={loading}
        emptyMessage="No customers found"
      />

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingCustomer(null);
        }}
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Shop Code</label>
            <input
              type="text"
              value={formData.shop_code}
              onChange={(e) =>
                setFormData({ ...formData, shop_code: e.target.value })
              }
              placeholder="e.g. S-001"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Route</label>
              <select
                value={formData.route_id}
                onChange={(e) =>
                  setFormData({ ...formData, route_id: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              >
                <option value="">Select Route</option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
              Opening Balance
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.opening_balance}
              onChange={(e) =>
                setFormData({ ...formData, opening_balance: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingCustomer(null);
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
              {submitting ? 'Saving...' : editingCustomer ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <BulkUpload
        title="Upload Customers"
        templateHeaders={['shop_code', 'name', 'opening_balance']}
        displayHeaders={['CUSTOMER CODE', 'SHOP NAME', 'BALANCE', 'ROUTE', 'SALE MAN']}
        columnAliases={{
          'customer code': 'shop_code',
          'shop name': 'name',
          'balance': 'opening_balance',
          'route': 'route',
          'sale man': 'employee_name',
          'saleman': 'employee_name',
          'employee': 'employee_name',
        }}
        onUpload={handleBulkUpload}
      />

      <ConfirmDialog
        open={!!statusConfirm}
        onClose={() => setStatusConfirm(null)}
        onConfirm={handleToggleStatus}
        title={statusConfirm?.is_active ? 'Deactivate Customer' : 'Activate Customer'}
        message={`Are you sure you want to ${
          statusConfirm?.is_active ? 'deactivate' : 'activate'
        } ${statusConfirm?.name}?`}
        confirmLabel={statusConfirm?.is_active ? 'Deactivate' : 'Activate'}
        variant={statusConfirm?.is_active ? 'destructive' : 'default'}
      />

      {detailModal && (
        <DetailModal
          type={detailModal.type}
          id={detailModal.id}
          name={detailModal.name}
          onClose={() => setDetailModal(null)}
        />
      )}
    </div>
  );
}
