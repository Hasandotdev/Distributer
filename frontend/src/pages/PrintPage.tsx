import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Printer, Loader2, ChevronDown } from 'lucide-react';

interface PrintRow {
  customer_id: string;
  shop_code: string;
  shop_name: string;
  bill_no: string;
  total_credit: number;
  total_recovery: number;
  total_balance: number;
  today_recovery: number;
}

export default function PrintPage() {
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; employee_code: string }[]>([]);
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [routeSearch, setRouteSearch] = useState('');
  const [showRouteDropdown, setShowRouteDropdown] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [rows, setRows] = useState<PrintRow[]>([]);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [employeeName, setEmployeeName] = useState('');
  const [routeName, setRouteName] = useState('');
  const [todayRecoveries, setTodayRecoveries] = useState<Record<string, number>>({});
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDropdowns();
  }, []);

  async function fetchDropdowns() {
    const [routeRes, empRes] = await Promise.all([
      supabase.from('routes').select('id, name').order('name'),
      supabase.from('employees').select('id, name, employee_code').eq('is_active', true).order('name'),
    ]);
    if (routeRes.data) setRoutes(routeRes.data);
    if (empRes.data) setEmployees(empRes.data);
  }

  async function generateReport() {
    if (!selectedRoute && !selectedEmployee) {
      alert('Please select a route or employee');
      return;
    }
    setLoading(true);
    setTodayRecoveries({});

    let customerIds: string[] = [];

    if (selectedRoute) {
      const { data: custData } = await supabase
        .from('customers')
        .select('id')
        .eq('route_id', selectedRoute)
        .eq('is_active', true);
      customerIds = (custData || []).map((c) => c.id);
    }

    if (selectedEmployee) {
      const { data: empRoutes } = await supabase
        .from('employee_routes')
        .select('route_id')
        .eq('employee_id', selectedEmployee);
      const routeIds = (empRoutes || []).map((er) => er.route_id);

      if (routeIds.length > 0) {
        const { data: custData } = await supabase
          .from('customers')
          .select('id')
          .in('route_id', routeIds)
          .eq('is_active', true);
        customerIds = (custData || []).map((c) => c.id);
      }
    }

    if (customerIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: billData } = await supabase
      .from('bills')
      .select('customer_id, bill_number, credit_amount')
      .in('customer_id', customerIds)
      .eq('is_voided', false);

    const { data: recoveryData } = await supabase
      .from('recoveries')
      .select('customer_id, amount')
      .in('customer_id', customerIds);

    const { data: custInfo } = await supabase
      .from('customers')
      .select('id, name, shop_code, opening_balance')
      .in('id', customerIds)
      .order('name');

    const creditPerCustomer: Record<string, number> = {};
    const billCountPerCustomer: Record<string, number> = {};
    (billData || []).forEach((b) => {
      creditPerCustomer[b.customer_id] = (creditPerCustomer[b.customer_id] || 0) + (b.credit_amount || 0);
      billCountPerCustomer[b.customer_id] = (billCountPerCustomer[b.customer_id] || 0) + 1;
    });

    const recoveryPerCustomer: Record<string, number> = {};
    (recoveryData || []).forEach((r) => {
      recoveryPerCustomer[r.customer_id] = (recoveryPerCustomer[r.customer_id] || 0) + r.amount;
    });

    const result: PrintRow[] = (custInfo || []).map((c) => {
      const totalCredit = creditPerCustomer[c.id] || 0;
      const totalRecovery = recoveryPerCustomer[c.id] || 0;
      const openingBalance = c.opening_balance || 0;
      return {
        customer_id: c.id,
        shop_code: c.shop_code || c.id.slice(-8).toUpperCase(),
        shop_name: c.name,
        bill_no: billCountPerCustomer[c.id] ? `${billCountPerCustomer[c.id]} bills` : '',
        total_credit: totalCredit + openingBalance,
        total_recovery: totalRecovery,
        total_balance: totalCredit + openingBalance - totalRecovery,
        today_recovery: 0,
      };
    }).filter((r) => r.total_balance > 0);

    if (selectedEmployee) {
      const emp = employees.find((e) => e.id === selectedEmployee);
      setEmployeeName(emp ? (emp.employee_code || emp.name) : '');
    } else {
      setEmployeeName('');
    }

    if (selectedRoute) {
      const route = routes.find((r) => r.id === selectedRoute);
      setRouteName(route?.name || '');
    } else {
      setRouteName('All Routes');
    }

    setRows(result);
    setReportGenerated(true);
    setLoading(false);
  }

  function handleTodayRecoveryChange(customerId: string, value: string) {
    const num = parseFloat(value.replace(/[^\d.]/g, '')) || 0;
    setTodayRecoveries((prev) => ({ ...prev, [customerId]: num }));
  }

  function handlePrint() {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const companyName = localStorage.getItem('companyName') || 'Distribution & Credit Management System';
    const totalCredit = rows.reduce((s, r) => s + r.total_credit, 0);
    const totalRecovery = rows.reduce((s, r) => s + r.total_recovery, 0);
    const totalBalance = rows.reduce((s, r) => s + r.total_balance, 0);
    const totalTodayRecovery = rows.reduce((s, r) => s + (todayRecoveries[r.customer_id] || 0), 0);

    const rowsHtml = rows.map((r, i) => {
      const bgColor = i % 2 === 0 ? '#f8fafc' : '#ffffff';
      const todayRec = todayRecoveries[r.customer_id] || 0;
      return `
        <tr style="background:${bgColor};">
          <td style="padding:8px 12px;border:1px solid #cbd5e1;font-size:12px;text-align:center;">${r.shop_code}</td>
          <td style="padding:8px 12px;border:1px solid #cbd5e1;font-size:12px;">${r.shop_name}</td>
          <td style="padding:8px 12px;border:1px solid #cbd5e1;font-size:12px;text-align:center;">${r.bill_no}</td>
          <td style="padding:8px 12px;border:1px solid #cbd5e1;font-size:12px;text-align:right;">${formatCurrency(r.total_credit)}</td>
          <td style="padding:8px 12px;border:1px solid #cbd5e1;font-size:12px;text-align:right;">${formatCurrency(r.total_recovery)}</td>
          <td style="padding:8px 12px;border:1px solid #cbd5e1;font-size:12px;text-align:right;">${formatCurrency(r.total_balance)}</td>
          <td style="padding:8px 12px;border:1px solid #cbd5e1;font-size:12px;text-align:right;">${todayRec > 0 ? formatCurrency(todayRec) : ''}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Route Recovery Report</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 15px; }
          .company-name { font-size: 18px; font-weight: bold; color: #1e293b; }
          .report-title { font-size: 14px; color: #475569; margin-top: 5px; }
          .report-info { font-size: 11px; color: #64748b; margin-top: 8px; }
          .info-row { display: flex; justify-content: space-between; margin-top: 5px; font-size: 11px; color: #475569; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #2563eb; color: white; padding: 10px 12px; font-size: 12px; font-weight: bold; text-align: center; border: 1px solid #1d4ed8; }
          td { border: 1px solid #cbd5e1; }
          .total-row { background: #1e293b !important; color: white; font-weight: bold; }
          .total-row td { border-color: #334155; color: white; font-weight: bold; }
          .footer { margin-top: 20px; font-size: 10px; color: #94a3b8; text-align: center; }
          .signature-area { margin-top: 40px; display: flex; justify-content: space-between; }
          .signature-box { width: 200px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 11px; color: #64748b; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${companyName}</div>
          <div class="report-title">Daily Recovery Record</div>
          <div class="report-info">
            ${routeName ? `Route: ${routeName}` : ''}
            ${employeeName ? ` | Employee: ${employeeName}` : ''}
            ${reportDate ? ` | Date: ${formatDate(reportDate)}` : ''}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:80px;">SHOP ID</th>
              <th>SHOP NAME</th>
              <th style="width:100px;">BILL NO</th>
              <th style="width:110px;">TOTAL CREDIT</th>
              <th style="width:110px;">TOTAL RECOVERY</th>
              <th style="width:110px;">TOTAL BALANCE</th>
              <th style="width:110px;">TODAY RECOVERY</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="3" style="padding:8px 12px;text-align:center;font-weight:bold;">TOTAL</td>
              <td style="padding:8px 12px;text-align:right;">${formatCurrency(totalCredit)}</td>
              <td style="padding:8px 12px;text-align:right;">${formatCurrency(totalRecovery)}</td>
              <td style="padding:8px 12px;text-align:right;">${formatCurrency(totalBalance)}</td>
              <td style="padding:8px 12px;text-align:right;">${totalTodayRecovery > 0 ? formatCurrency(totalTodayRecovery) : ''}</td>
            </tr>
          </tbody>
        </table>
        <div class="signature-area">
          <div class="signature-box">Employee Signature</div>
          <div class="signature-box">Supervisor Signature</div>
        </div>
        <div class="footer">Generated on ${new Date().toLocaleString()}</div>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Print Route Report</h1>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Route</label>
            <input
              type="text"
              placeholder="Search route..."
              value={routeSearch}
              onChange={(e) => {
                setRouteSearch(e.target.value);
                setShowRouteDropdown(true);
                if (selectedRoute) {
                  setSelectedRoute('');
                  setRouteName('');
                }
              }}
              onFocus={() => setShowRouteDropdown(true)}
              onBlur={() => setTimeout(() => setShowRouteDropdown(false), 200)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg w-56"
            />
            {selectedRoute && (
              <button
                type="button"
                onClick={() => { setSelectedRoute(''); setRouteSearch(''); setRouteName(''); }}
                className="absolute right-2 top-9 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
            {showRouteDropdown && !selectedRoute && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {routes
                  .filter((r) => {
                    const q = routeSearch.toLowerCase();
                    return !q || r.name.toLowerCase().includes(q);
                  })
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onMouseDown={() => {
                        setSelectedRoute(r.id);
                        setRouteSearch(r.name);
                        setShowRouteDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-800 dark:text-slate-200"
                    >
                      <span className="font-medium">{r.name}</span>
                    </button>
                  ))
                  .slice(0, 20)}
                {routes.filter((r) => {
                  const q = routeSearch.toLowerCase();
                  return !q || r.name.toLowerCase().includes(q);
                }).length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No routes found</div>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Employee (Optional)</label>
            <input
              type="text"
              placeholder="Search employee..."
              value={employeeSearch}
              onChange={(e) => {
                setEmployeeSearch(e.target.value);
                setShowEmployeeDropdown(true);
                if (selectedEmployee) {
                  setSelectedEmployee('');
                  setEmployeeName('');
                }
              }}
              onFocus={() => setShowEmployeeDropdown(true)}
              onBlur={() => setTimeout(() => setShowEmployeeDropdown(false), 200)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg w-56"
            />
            {selectedEmployee && (
              <button
                type="button"
                onClick={() => { setSelectedEmployee(''); setEmployeeSearch(''); setEmployeeName(''); }}
                className="absolute right-2 top-9 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
            {showEmployeeDropdown && !selectedEmployee && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {employees
                  .filter((e) => {
                    const q = employeeSearch.toLowerCase();
                    return !q || e.name.toLowerCase().includes(q) || (e.employee_code || '').toLowerCase().includes(q);
                  })
                  .map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onMouseDown={() => {
                        setSelectedEmployee(e.id);
                        setEmployeeSearch(e.employee_code || e.name);
                        setShowEmployeeDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-800 dark:text-slate-200"
                    >
                      <span className="font-medium">{e.employee_code || e.name}</span>
                      {e.employee_code && <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{e.name}</span>}
                    </button>
                  ))
                  .slice(0, 20)}
                {employees.filter((e) => {
                  const q = employeeSearch.toLowerCase();
                  return !q || e.name.toLowerCase().includes(q) || (e.employee_code || '').toLowerCase().includes(q);
                }).length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No employees found</div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Report Date</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
            />
          </div>

          <button
            onClick={generateReport}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            Generate
          </button>

          {reportGenerated && rows.length > 0 && (
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      )}

      {!loading && reportGenerated && rows.length === 0 && (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          No data found for the selected filters
        </div>
      )}

      {!loading && reportGenerated && rows.length > 0 && (
        <div ref={printRef} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-blue-600 text-white">
            <h2 className="text-center text-lg font-bold">{localStorage.getItem('companyName') || 'Distribution & Credit Management System'}</h2>
            <p className="text-center text-sm text-blue-100">Daily Recovery Record</p>
            <div className="flex justify-center gap-6 mt-2 text-xs text-blue-200">
              {routeName && <span>Route: <span className="font-semibold text-white">{routeName}</span></span>}
              {employeeName && <span>Employee: <span className="font-semibold text-white">{employeeName}</span></span>}
              {reportDate && <span>Date: <span className="font-semibold text-white">{formatDate(reportDate)}</span></span>}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Shop ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Shop Name</th>
                  <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Bill No</th>
                  <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Total Credit</th>
                  <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Total Recovery</th>
                  <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Total Balance</th>
                  <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Today Recovery</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.customer_id}
                    className={`border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${i % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}
                  >
                    <td className="px-4 py-3 text-center text-xs font-mono text-slate-600 dark:text-slate-400">{r.shop_code}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium">{r.shop_name}</td>
                    <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400 text-xs">{r.bill_no}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatCurrency(r.total_credit)}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatCurrency(r.total_recovery)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(r.total_balance)}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="text"
                        placeholder="0"
                        value={todayRecoveries[r.customer_id] ? formatCurrency(todayRecoveries[r.customer_id]) : ''}
                        onChange={(e) => handleTodayRecoveryChange(r.customer_id, e.target.value)}
                        className="w-28 text-right px-2 py-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 dark:bg-slate-950 text-white font-bold">
                  <td colSpan={3} className="px-4 py-3 text-center text-xs uppercase tracking-wider">Total</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(rows.reduce((s, r) => s + r.total_credit, 0))}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(rows.reduce((s, r) => s + r.total_recovery, 0))}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(rows.reduce((s, r) => s + r.total_balance, 0))}</td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(rows.reduce((s, r) => s + (todayRecoveries[r.customer_id] || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
