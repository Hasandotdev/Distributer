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
import { Plus, Edit, Trash2, Upload, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface Bill {
  id: string;
  bill_number: string;
  customer_id: string;
  customer_name: string;
  employee_id: string;
  employee_name: string;
  total_amount: number;
  paid_amount: number;
  credit_amount: number;
  payment_status: string;
  bill_date: string;
  notes: string;
}

interface Customer {
  id: string;
  name: string;
  route_id: string;
  route_name: string;
}

interface Route {
  id: string;
  name: string;
}

interface BillFormData {
  customer_id: string;
  bill_date: string;
  bill_number: string;
  total_amount: string;
  paid_amount: string;
  notes: string;
}

export default function BillsPage() {
  const { user, userRole, userEmployee } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: '',
    to: '',
  });
  const [routeFilter, setRouteFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [employees, setEmployees] = useState<{ id: string; name: string; employee_code: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Bill | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detailModal, setDetailModal] = useState<{ type: 'shop' | 'employee'; id: string; name: string } | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [formData, setFormData] = useState<BillFormData>({
    customer_id: '',
    bill_date: todayLocal(),
    bill_number: '',
    total_amount: '',
    paid_amount: '',
    notes: '',
  });

  useEffect(() => {
    fetchBills();
    fetchCustomers();
    fetchRoutes();
    fetchEmployees();
  }, [dateRange, routeFilter, employeeFilter]);

  async function fetchBills() {
    const currentRouteFilter = routeFilter;
    const currentEmployeeFilter = employeeFilter;
    const currentDateRange = dateRange;

    setLoading(true);

    let customerIds: string[] | null = null;
    if (currentRouteFilter) {
      const { data: routeCustomers } = await supabase
        .from('customers')
        .select('id')
        .eq('route_id', currentRouteFilter)
        .eq('is_active', true);
      customerIds = (routeCustomers || []).map((c) => c.id);
      if (customerIds.length === 0) {
        setBills([]);
        setLoading(false);
        return;
      }
    }

    let query = supabase
      .from('bills')
      .select(
        `
        *,
        customer:customers(name),
        employee:employees(name, employee_code)
      `
      )
      .eq('is_voided', false)
      .order('bill_date', { ascending: false });

    if (currentDateRange.from) query = query.gte('bill_date', currentDateRange.from);
    if (currentDateRange.to) query = query.lte('bill_date', currentDateRange.to);

    if (userRole === 'employee' && userEmployee) {
      query = query.eq('employee_id', userEmployee.id);
    }

    if (customerIds) {
      query = query.in('customer_id', customerIds);
    }

    if (currentEmployeeFilter) {
      query = query.eq('employee_id', currentEmployeeFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching bills:', error);
    } else {
      setBills(
        (data || []).map((b: any) => ({
          ...b,
          customer_name: b.customer?.name || 'N/A',
          employee_name: b.employee?.employee_code || b.employee?.name || 'N/A',
        }))
      );
    }
    setLoading(false);
  }

  async function fetchCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, route_id, route:routes(name)')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching customers:', error);
    } else {
      setCustomers(
        (data || []).map((c: any) => ({
          ...c,
          route_name: c.route?.name || 'N/A',
        }))
      );
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

  function calculatePaymentStatus(paid: string, total: string): string {
    const paidNum = parseFloat(paid) || 0;
    const totalNum = parseFloat(total) || 0;
    if (paidNum >= totalNum) return 'cash';
    if (paidNum === 0) return 'credit';
    return 'partial';
  }

  function generateBillNumber(): string {
    const lastBill = bills[bills.length - 1];
    if (lastBill) {
      const lastNum = parseInt(lastBill.bill_number.replace('BILL-', ''));
      return `BILL-${String(lastNum + 1).padStart(5, '0')}`;
    }
    return 'BILL-00001';
  }

  async function fetchNextBillNumber(): Promise<string> {
    const { data } = await supabase
      .from('bills')
      .select('bill_number')
      .order('bill_number', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const lastNum = parseInt(data[0].bill_number.replace('BILL-', ''));
      return `BILL-${String(lastNum + 1).padStart(5, '0')}`;
    }
    return 'BILL-00001';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const totalAmount = parseFloat(formData.total_amount) || 0;
    const paidAmount = parseFloat(formData.paid_amount) || 0;
    const creditAmount = totalAmount - paidAmount;
    const paymentStatus = calculatePaymentStatus(
      formData.paid_amount,
      formData.total_amount
    );

    const billData = {
      customer_id: formData.customer_id,
      employee_id: userEmployee?.id || null,
      bill_date: formData.bill_date,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      payment_status: paymentStatus,
      notes: formData.notes,
      bill_number: editingBill ? editingBill.bill_number : (formData.bill_number || generateBillNumber()),
    };

    let error;
    if (editingBill) {
      ({ error } = await supabase
        .from('bills')
        .update(billData)
        .eq('id', editingBill.id));
    } else {
      ({ error } = await supabase.from('bills').insert(billData));
    }

    if (error) {
      console.error('Error saving bill:', error);
      alert('Error saving bill');
    } else {
      setShowForm(false);
      setEditingBill(null);
      resetForm();
      fetchBills();
    }
    setSubmitting(false);
  }

  function resetForm() {
    setFormData({
      customer_id: '',
      bill_date: todayLocal(),
      bill_number: '',
      total_amount: '',
      paid_amount: '',
      notes: '',
    });
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  }

  function openEditForm(bill: Bill) {
    setEditingBill(bill);
    setCustomerSearch('');
    setFormData({
      customer_id: bill.customer_id,
      bill_date: bill.bill_date,
      bill_number: bill.bill_number,
      total_amount: bill.total_amount.toString(),
      paid_amount: bill.paid_amount.toString(),
      notes: bill.notes || '',
    });
    setShowForm(true);
  }

  async function handleVoidBill() {
    if (!deleteConfirm) return;
    const { error } = await supabase
      .from('bills')
      .delete()
      .eq('id', deleteConfirm.id);

    if (error) {
      console.error('Error deleting bill:', error);
    } else {
      setDeleteConfirm(null);
      fetchBills();
    }
  }

  async function handleBulkUpload(data: any[]) {
    const shopCodes = [...new Set(data.map((row) => row.shop_code || row.customer_id).filter(Boolean))];
    const { data: custData } = await supabase.from('customers').select('id, shop_code');
    const codeToId: Record<string, string> = {};
    (custData || []).forEach((c) => { if (c.shop_code) codeToId[c.shop_code] = c.id; });

    const empCodes = [...new Set(data.map((row) => row.employee_id).filter(Boolean))];
    const { data: empData } = await supabase.from('employees').select('id, employee_code');
    const empCodeToId: Record<string, string> = {};
    (empData || []).forEach((e) => { if (e.employee_code) empCodeToId[e.employee_code] = e.id; });

    const lastBillNum = bills.length > 0
      ? Math.max(...bills.map((b) => parseInt(b.bill_number.replace('BILL-', '')) || 0))
      : 0;

    const billsToInsert = data.map((row, i) => {
      const code = row.shop_code || row.customer_id;
      const resolvedId = codeToId[code] || code;
      const empCode = row.employee_id;
      const resolvedEmpId = empCodeToId[empCode] || empCode || userEmployee?.id || null;
      return {
        bill_number: row.bill_number || `BILL-${String(lastBillNum + i + 1).padStart(5, '0')}`,
        customer_id: resolvedId,
        employee_id: resolvedEmpId,
        bill_date: parseDate(row.bill_date),
        total_amount: parseAmount(row['credit amount'] || row.credit_amount || row.total_amount),
        paid_amount: 0,
        payment_status: 'credit',
        notes: row.notes || '',
      };
    });

    const { error } = await supabase.from('bills').insert(billsToInsert);
    if (error) {
      console.error('Error bulk uploading bills:', error);
      alert(`Error uploading bills: ${error.message}`);
    } else {
      setShowBulkUpload(false);
      fetchBills();
    }
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      cash: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
      credit: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
      partial: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  }

  const groupedCustomers = customers.reduce(
    (acc: Record<string, Customer[]>, customer) => {
      const route = customer.route_name;
      if (!acc[route]) acc[route] = [];
      acc[route].push(customer);
      return acc;
    },
    {}
  );

  function exportBills(format: 'pdf' | 'excel') {
    const headers = ['Bill #', 'Customer', 'Employee', 'Date', 'Total', 'Paid', 'Credit', 'Status'];
    const totalTotal = bills.reduce((s, b) => s + b.total_amount, 0);
    const totalPaid = bills.reduce((s, b) => s + b.paid_amount, 0);
    const totalCredit = bills.reduce((s, b) => s + b.credit_amount, 0);
    const rows = bills.map((b) => [
      b.bill_number,
      b.customer_name,
      b.employee_name,
      formatDate(b.bill_date),
      formatCurrency(b.total_amount),
      formatCurrency(b.paid_amount),
      formatCurrency(b.credit_amount),
      b.payment_status,
    ]);
    rows.push(['', '', '', 'TOTAL', formatCurrency(totalTotal), formatCurrency(totalPaid), formatCurrency(totalCredit), '']);

    const title = 'Bills Report';
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
      doc.save('Bills_Report.pdf');
    } else {
      const wb = XLSX.utils.book_new();
      const wsData = [[companyName], [title], [], headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Bills Report');
      XLSX.writeFile(wb, 'Bills_Report.xlsx');
    }
  }

  const columns = [
    { key: 'bill_number', header: 'Bill #' },
    {
      key: 'customer_name',
      header: 'Customer',
      render: (value: string, row: Bill) => (
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
      render: (value: string, row: Bill) => (
        <button
          onClick={() => setDetailModal({ type: 'employee', id: row.employee_id, name: value })}
          className="text-blue-600 hover:underline font-medium"
        >
          {value}
        </button>
      ),
    },
    {
      key: 'bill_date',
      header: 'Date',
      render: (value: string) => formatDate(value),
    },
    {
      key: 'total_amount',
      header: 'Total',
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'paid_amount',
      header: 'Paid',
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'credit_amount',
      header: 'Credit',
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'payment_status',
      header: 'Status',
      render: (value: string) => (
        <span
          className={cn(
            'px-2 py-1 text-xs rounded-full font-medium',
            getStatusBadge(value)
          )}
        >
          {value}
        </span>
      ),
    },
    ...(userRole === 'admin'
      ? [
          {
            key: 'actions',
            header: '',
            render: (_: any, row: Bill) => (
              <div className="flex gap-2">
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
                  <Trash2 className="h-4 w-4 text-red-600" />
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
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Bills</h1>
        <div className="flex gap-2">
          {userRole === 'admin' && (
            <button
              onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              <Upload className="h-4 w-4" />
              Bulk Upload
            </button>
          )}
          <button
            onClick={async () => {
              resetForm();
              setEditingBill(null);
              const nextBillNum = await fetchNextBillNumber();
              setFormData((prev) => ({ ...prev, bill_number: nextBillNum }));
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Bill
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
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
            onClick={() => exportBills('pdf')}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            <FileDown className="h-4 w-4" />
            PDF
          </button>
        )}
        {userRole === 'admin' && (
          <button
            onClick={() => exportBills('excel')}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            <FileDown className="h-4 w-4" />
            Excel
          </button>
        )}
      </div>

      <DataTable columns={columns} data={bills} loading={loading} emptyMessage="No bills found" />

      {bills.length > 0 && (
        <div className="flex items-center justify-end gap-6 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Total: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(bills.reduce((s, b) => s + b.total_amount, 0))}</span></span>
          <span className="text-slate-600 dark:text-slate-400">Paid: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(bills.reduce((s, b) => s + b.paid_amount, 0))}</span></span>
          <span className="text-slate-600 dark:text-slate-400">Credit: <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(bills.reduce((s, b) => s + b.credit_amount, 0))}</span></span>
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingBill(null);
        }}
        title={editingBill ? 'Edit Bill' : 'New Bill'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Customer</label>
            <input
              type="text"
              placeholder="Search by name or route..."
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
                {customers
                  .filter((c) => {
                    const q = customerSearch.toLowerCase();
                    return !q || c.name.toLowerCase().includes(q) || (c.route_name && c.route_name.toLowerCase().includes(q));
                  })
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setFormData({ ...formData, customer_id: c.id });
                        setCustomerSearch(c.name);
                        setShowCustomerDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-800 dark:text-slate-200"
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.route_name && <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">({c.route_name})</span>}
                    </button>
                  ))
                  .slice(0, 20)}
                {customers.filter((c) => {
                  const q = customerSearch.toLowerCase();
                  return !q || c.name.toLowerCase().includes(q) || (c.route_name && c.route_name.toLowerCase().includes(q));
                }).length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No customers found</div>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Bill Date</label>
              <input
                type="date"
                value={formData.bill_date}
                onChange={(e) =>
                  setFormData({ ...formData, bill_date: e.target.value })
                }
                required
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                Bill Number
              </label>
              <input
                type="text"
                value={editingBill ? editingBill.bill_number : formData.bill_number}
                onChange={(e) => setFormData({ ...formData, bill_number: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                Total Amount
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.total_amount}
                onChange={(e) =>
                  setFormData({ ...formData, total_amount: e.target.value })
                }
                required
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                Paid Amount
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.paid_amount}
                onChange={(e) =>
                  setFormData({ ...formData, paid_amount: e.target.value })
                }
                required
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-300">Payment Status: </span>
            <span
              className={cn(
                'px-2 py-1 rounded-full',
                getStatusBadge(
                  calculatePaymentStatus(formData.paid_amount, formData.total_amount)
                )
              )}
            >
              {calculatePaymentStatus(formData.paid_amount, formData.total_amount)}
            </span>
            <span className="ml-4 text-slate-500 dark:text-slate-400">
              Credit:{' '}
              {formatCurrency(
                (parseFloat(formData.total_amount) || 0) -
                  (parseFloat(formData.paid_amount) || 0)
              )}
            </span>
          </div>
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
              onClick={() => {
                setShowForm(false);
                setEditingBill(null);
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
              {submitting ? 'Saving...' : editingBill ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <BulkUpload
        title="Upload Bills"
        templateHeaders={[
          'bill_number',
          'shop_code',
          'employee_id',
          'bill_date',
          'credit amount',
          'notes',
        ]}
        columnAliases={{ 'customer_id': 'shop_code' }}
        onUpload={handleBulkUpload}
      />

      <PasswordConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleVoidBill}
        title="Delete Bill"
        message={`Are you sure you want to delete bill ${deleteConfirm?.bill_number}? This action cannot be undone.`}
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
