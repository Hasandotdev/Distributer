import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate, cn, parseDate, parseAmount, todayLocal } from '@/lib/utils';
import DataTable from '@/components/DataTable';
import DateRangeFilter from '@/components/DateRangeFilter';
import BulkUpload from '@/components/BulkUpload';
import Modal from '@/components/Modal';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import DetailModal from '@/components/DetailModal';
import { Plus, AlertTriangle, Trash2, FileDown, Search } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface Recovery {
  id: string;
  customer_id: string;
  employee_id: string;
  amount: number;
  recovery_date: string;
  notes: string;
  bill_no: string;
  customer_name: string;
  employee_name: string;
}

interface Customer {
  id: string;
  name: string;
  outstanding: number;
  route_id: string | null;
  route_name?: string;
}

interface RecoveryFormData {
  customer_id: string;
  amount: string;
  recovery_date: string;
  notes: string;
  employee_id: string;
  bill_no: string;
}

export default function RecoveriesPage() {
  const { user, userRole, userEmployee } = useAuth();
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; employee_code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: '',
    to: '',
  });
  const [routeFilter, setRouteFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [formRoute, setFormRoute] = useState('');
  const [routes, setRoutes] = useState<{ id: string; name: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detailModal, setDetailModal] = useState<{ type: 'shop' | 'employee'; id: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Recovery | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerBills, setCustomerBills] = useState<{ bill_number: string; credit_amount: number }[]>([]);
  const [formData, setFormData] = useState<RecoveryFormData>({
    customer_id: '',
    amount: '',
    recovery_date: todayLocal(),
    notes: '',
    employee_id: '',
    bill_no: '',
  });

  useEffect(() => {
    fetchRecoveries();
    fetchCustomers();
    fetchEmployees();
    fetchRoutes();
  }, [dateRange, routeFilter, employeeFilter]);

  async function fetchRecoveries() {
    setLoading(true);

    let customerIds: string[] | null = null;
    if (routeFilter) {
      const { data: routeCustomers } = await supabase
        .from('customers')
        .select('id')
        .eq('route_id', routeFilter)
        .eq('is_active', true);
      customerIds = (routeCustomers || []).map((c) => c.id);
      if (customerIds.length === 0) {
        setRecoveries([]);
        setLoading(false);
        return;
      }
    }

    let query = supabase
      .from('recoveries')
      .select(
        `
        *,
        customer:customers(name),
        employee:employees(name, employee_code)
      `
      )
      .order('recovery_date', { ascending: false });

    if (dateRange.from) query = query.gte('recovery_date', dateRange.from);
    if (dateRange.to) query = query.lte('recovery_date', dateRange.to);

    if (userRole === 'employee' && userEmployee) {
      query = query.eq('employee_id', userEmployee.id);
    }

    if (customerIds) {
      query = query.in('customer_id', customerIds);
    }

    if (employeeFilter) {
      query = query.eq('employee_id', employeeFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching recoveries:', error);
    } else {
      setRecoveries(
        (data || []).map((r: any) => ({
          ...r,
          customer_name: r.customer?.name || 'N/A',
          employee_name: r.employee?.employee_code || r.employee?.name || 'N/A',
        }))
      );
    }
    setLoading(false);
  }

  async function fetchCustomers() {
    const { data: bills } = await supabase
      .from('bills')
      .select('customer_id, credit_amount')
      .eq('is_voided', false);

    const { data: recoveryData } = await supabase
      .from('recoveries')
      .select('customer_id, amount');

    const { data: customerData } = await supabase
      .from('customers')
      .select('id, name, opening_balance, route_id')
      .eq('is_active', true)
      .order('name');

    if (customerData) {
      const outstandingMap: Record<string, number> = {};
      customerData.forEach((c) => {
        outstandingMap[c.id] = c.opening_balance || 0;
      });
      (bills || []).forEach((b) => {
        outstandingMap[b.customer_id] =
          (outstandingMap[b.customer_id] || 0) + b.credit_amount;
      });
      (recoveryData || []).forEach((r) => {
        outstandingMap[r.customer_id] =
          (outstandingMap[r.customer_id] || 0) - r.amount;
      });

      setCustomers(
        customerData.map((c) => ({
          ...c,
          outstanding: outstandingMap[c.id] || 0,
        }))
      );
    }
  }

  async function fetchEmployees() {
    const { data, error } = await supabase
      .from('employees')
      .select('id, name, employee_code')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching employees:', error);
    } else {
      setEmployees(data || []);
    }
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

  const routeNameById = Object.fromEntries(routes.map((r) => [r.id, r.name]));

  const customersWithRoute = customers.map((c) => ({
    ...c,
    route_name: routeNameById[c.route_id || ''] || '',
  }));

  const selectedCustomer = customersWithRoute.find(
    (c) => c.id === formData.customer_id
  );
  const exceedsBalance =
    selectedCustomer &&
    parseFloat(formData.amount) > selectedCustomer.outstanding * 1.1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const { error } = await supabase.from('recoveries').insert({
      customer_id: formData.customer_id,
      employee_id:
        userRole === 'admin' && formData.employee_id
          ? formData.employee_id
          : userEmployee?.id,
      amount: parseAmount(formData.amount),
      recovery_date: formData.recovery_date,
      notes: formData.notes,
      bill_no: formData.bill_no || null,
    });

    if (error) {
      console.error('Error saving recovery:', error);
      alert('Error saving recovery');
    } else {
      setShowForm(false);
      resetForm();
      fetchRecoveries();
    }
    setSubmitting(false);
  }

  function resetForm() {
    setFormData({
      customer_id: '',
      amount: '',
      recovery_date: todayLocal(),
      notes: '',
      employee_id: '',
      bill_no: '',
    });
    setCustomerSearch('');
    setShowCustomerDropdown(false);
    setCustomerBills([]);
    setFormRoute('');
  }

  async function handleBulkUpload(data: any[]) {
    const { data: custData } = await supabase.from('customers').select('id, shop_code');
    const codeToId: Record<string, string> = {};
    (custData || []).forEach((c) => { if (c.shop_code) codeToId[c.shop_code] = c.id; });

    const { data: empData } = await supabase.from('employees').select('id, employee_code');
    const validEmpIds = new Set((empData || []).map((e) => e.id));
    const empCodeToId: Record<string, string> = {};
    (empData || []).forEach((e) => { if (e.employee_code) empCodeToId[e.employee_code] = e.id; });
    const normalizeEmpId = (id: string) => id.replace(/^DSR-0+(\d+)$/, 'DSR-$1');

    const errors: string[] = [];
    const recoveriesToInsert = data.map((row, i) => {
      const code = row.shop_code || row.customer_id;
      const resolvedId = codeToId[code];
      if (!resolvedId) {
        errors.push(`Row ${i + 1}: shop_code "${code}" not found`);
        return null;
      }
      let empId = row.employee_id || userEmployee?.id;
      if (empId) {
        empId = normalizeEmpId(empId);
      }
      if (empId && !validEmpIds.has(empId)) {
        const mappedId = empCodeToId[empId];
        if (mappedId) {
          empId = mappedId;
        } else {
          errors.push(`Row ${i + 1}: employee_id "${row.employee_id}" not found`);
          return null;
        }
      }
      return {
        customer_id: resolvedId,
        employee_id: empId || null,
        amount: parseAmount(row.amount),
        recovery_date: parseDate(row.recovery_date),
        notes: row.notes || '',
        bill_no: row.bill_no || null,
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    if (errors.length > 0) {
      alert(`Upload errors:\n${errors.join('\n')}`);
      return;
    }

    const { error } = await supabase
      .from('recoveries')
      .insert(recoveriesToInsert);

    if (error) {
      console.error('Error bulk uploading recoveries:', error);
      alert(`Error uploading recoveries: ${error.message}`);
    } else {
      setShowBulkUpload(false);
      fetchRecoveries();
    }
  }

  async function handleDeleteRecovery() {
    if (!deleteConfirm) return;
    const { error } = await supabase
      .from('recoveries')
      .delete()
      .eq('id', deleteConfirm.id);

    if (error) {
      console.error('Error deleting recovery:', error);
    } else {
      setDeleteConfirm(null);
      fetchRecoveries();
    }
  }

  const filteredRecoveries = recoveries.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      r.customer_name.toLowerCase().includes(q) ||
      r.employee_name.toLowerCase().includes(q) ||
      (r.bill_no || '').toLowerCase().includes(q) ||
      (r.notes || '').toLowerCase().includes(q)
    );
  });

  function exportRecoveries(format: 'pdf' | 'excel') {
    const headers = ['Date', 'Customer', 'Employee', 'Bill No', 'Amount', 'Notes'];
    const exportData = filteredRecoveries;
    const totalAmount = exportData.reduce((s, r) => s + r.amount, 0);
    const rows = exportData.map((r) => [
      formatDate(r.recovery_date),
      r.customer_name,
      r.employee_name,
      r.bill_no || '',
      formatCurrency(r.amount),
      r.notes,
    ]);
    rows.push(['', '', '', 'TOTAL', formatCurrency(totalAmount), '']);

    const title = 'Recoveries Report';
    const companyName = localStorage.getItem('companyName') || 'Distribution & Credit Management System';

    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(companyName, pageWidth / 2, 15, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(title, pageWidth / 2, 22, { align: 'center' });
      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 28,
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
        margin: { left: 10, right: 10 },
      });
      doc.save('Recoveries_Report.pdf');
    } else {
      const wb = XLSX.utils.book_new();
      const wsData = [[companyName], [title], [], headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Recoveries Report');
      XLSX.writeFile(wb, 'Recoveries_Report.xlsx');
    }
  }

  const columns = [
    {
      key: 'recovery_date',
      header: 'Date',
      render: (value: string) => formatDate(value),
    },
    {
      key: 'customer_name',
      header: 'Customer',
      render: (value: string, row: Recovery) => (
        <button
          onClick={() => setDetailModal({ type: 'shop', id: row.customer_id, name: value })}
          className="text-blue-600 hover:underline font-medium"
        >
          {value}
        </button>
      ),
    },
    {
      key: 'employee_name',
      header: 'Employee',
      render: (value: string, row: Recovery) => (
        <button
          onClick={() => setDetailModal({ type: 'employee', id: row.employee_id, name: value })}
          className="text-blue-600 hover:underline font-medium"
        >
          {value}
        </button>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'bill_no',
      header: 'Bill No',
    },
    { key: 'notes', header: 'Notes' },
    {
      key: 'actions',
      header: '',
      render: (_: any, row: Recovery) => (
        <button
          onClick={() => setDeleteConfirm(row)}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
        >
          <Trash2 className="h-4 w-4 text-red-600" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Recoveries</h1>
        <div className="flex gap-2">
          {userRole === 'admin' && (
            <button
              onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Bulk Upload
            </button>
          )}
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Recovery
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search recoveries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
          />
        </div>
        <DateRangeFilter
          from={dateRange.from}
          to={dateRange.to}
          onChange={(from, to) => setDateRange({ from, to })}
        />
        {userRole === 'admin' && (
          <>
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
            >
              <option value="">All Routes</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name}
                </option>
              ))}
            </select>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
            >
              <option value="">All Employees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_code || emp.name}
                </option>
              ))}
            </select>
          </>
        )}
        {userRole === 'admin' && (
          <button
            onClick={() => exportRecoveries('pdf')}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            <FileDown className="h-4 w-4" />
            PDF
          </button>
        )}
        {userRole === 'admin' && (
          <button
            onClick={() => exportRecoveries('excel')}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            <FileDown className="h-4 w-4" />
            Excel
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filteredRecoveries}
        loading={loading}
        emptyMessage="No recoveries found"
      />

      {filteredRecoveries.length > 0 && (
        <div className="flex items-center justify-end gap-6 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Total Recovery: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(filteredRecoveries.reduce((s, r) => s + r.amount, 0))}</span></span>
          <span className="text-slate-600 dark:text-slate-400">Count: <span className="font-semibold text-slate-900 dark:text-slate-100">{filteredRecoveries.length}</span></span>
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="New Recovery"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Route</label>
            <select
              value={formRoute}
              onChange={(e) => {
                setFormRoute(e.target.value);
                setCustomerSearch('');
                setFormData({ ...formData, customer_id: '', bill_no: '' });
                setCustomerBills([]);
              }}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
            >
              <option value="">All Routes</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Customer</label>
            <input
              type="text"
              placeholder="Search by name, ID or route..."
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setShowCustomerDropdown(true);
                if (formData.customer_id) {
                  setFormData({ ...formData, customer_id: '' });
                }
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
              required={!formData.customer_id}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
            />
            {formData.customer_id && (
              <button
                type="button"
                onClick={() => {
                  setFormData({ ...formData, customer_id: '' });
                  setCustomerSearch('');
                }}
                className="absolute right-2 top-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
            {showCustomerDropdown && !formData.customer_id && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {customersWithRoute
                  .filter((c) => {
                    if (formRoute && c.route_id !== formRoute) return false;
                    const q = customerSearch.toLowerCase();
                    return (
                      !q ||
                      c.name.toLowerCase().includes(q) ||
                      c.id.toLowerCase().includes(q) ||
                      (c.route_name || '').toLowerCase().includes(q)
                    );
                  })
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={async () => {
                        setFormData({ ...formData, customer_id: c.id, bill_no: '' });
                        setCustomerSearch(c.name);
                        setShowCustomerDropdown(false);
                        const { data: bills } = await supabase
                          .from('bills')
                          .select('bill_number, credit_amount')
                          .eq('customer_id', c.id)
                          .eq('is_voided', false)
                          .gt('credit_amount', 0)
                          .order('bill_date', { ascending: false });
                        setCustomerBills(bills || []);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-800 dark:text-slate-200"
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.route_name && (
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">({c.route_name})</span>
                      )}
                      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">— {formatCurrency(c.outstanding)}</span>
                    </button>
                  ))
                  .slice(0, 20)}
                {customersWithRoute.filter((c) => {
                  if (formRoute && c.route_id !== formRoute) return false;
                  const q = customerSearch.toLowerCase();
                  return (
                    !q ||
                    c.name.toLowerCase().includes(q) ||
                    c.id.toLowerCase().includes(q) ||
                    (c.route_name || '').toLowerCase().includes(q)
                  );
                }).length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No customers found</div>
                )}
              </div>
            )}
          </div>

          {selectedCustomer && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300">
              <p>
                <span className="font-medium">Outstanding Balance: </span>
                {formatCurrency(selectedCustomer.outstanding)}
              </p>
              {selectedCustomer.route_name && (
                <p className="mt-1">
                  <span className="font-medium">Route: </span>
                  {selectedCustomer.route_name}
                </p>
              )}
            </div>
          )}

          {customerBills.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                Apply Against Bill
              </label>
              <select
                value={formData.bill_no}
                onChange={(e) => setFormData({ ...formData, bill_no: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              >
                <option value="">Select Bill (Optional)</option>
                {customerBills.map((b) => (
                  <option key={b.bill_number} value={b.bill_number}>
                    {b.bill_number} — {formatCurrency(b.credit_amount)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                required
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                Recovery Date
              </label>
              <input
                type="date"
                value={formData.recovery_date}
                onChange={(e) =>
                  setFormData({ ...formData, recovery_date: e.target.value })
                }
                required
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>
          </div>

          {exceedsBalance && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
              <AlertTriangle className="h-4 w-4" />
              Amount exceeds outstanding balance significantly
            </div>
          )}

          {userRole === 'admin' && (
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                Collecting Employee
              </label>
              <select
                value={formData.employee_id}
                onChange={(e) =>
                  setFormData({ ...formData, employee_id: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              >
                <option value="">Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employee_code || emp.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
              Notes (Optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <BulkUpload
        title="Upload Recoveries"
        templateHeaders={['shop_code', 'employee_id', 'bill_no', 'amount', 'recovery_date', 'notes']}
        columnAliases={{ 'customer_id': 'shop_code' }}
        onUpload={handleBulkUpload}
      />

      {detailModal && (
        <DetailModal
          type={detailModal.type}
          id={detailModal.id}
          name={detailModal.name}
          onClose={() => setDetailModal(null)}
        />
      )}

      <PasswordConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteRecovery}
        title="Delete Recovery"
        message={`Are you sure you want to delete this recovery of ${formatCurrency(deleteConfirm?.amount || 0)}? This action cannot be undone.`}
      />
    </div>
  );
}
