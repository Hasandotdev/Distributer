import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Printer, Loader2, ChevronDown, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface PrintRow {
  customer_id: string;
  shop_code: string;
  shop_name: string;
  bill_no: string;
  total_credit: number;
  total_recovery: number;
  total_balance: number;
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

  useEffect(() => { fetchDropdowns(); }, []);

  async function fetchDropdowns() {
    const [routeRes, empRes] = await Promise.all([
      supabase.from('routes').select('id, name').order('name'),
      supabase.from('employees').select('id, name, employee_code').eq('is_active', true).order('name'),
    ]);
    if (routeRes.data) setRoutes(routeRes.data);
    if (empRes.data) setEmployees(empRes.data);
  }

  async function generateReport() {
    if (!selectedRoute && !selectedEmployee) { alert('Please select a route or employee'); return; }
    setLoading(true);
    let customerIds: string[] = [];

    if (selectedRoute) {
      const { data } = await supabase.from('customers').select('id').eq('route_id', selectedRoute).eq('is_active', true);
      customerIds = (data || []).map((c) => c.id);
    }
    if (selectedEmployee) {
      const { data: empRoutes } = await supabase.from('employee_routes').select('route_id').eq('employee_id', selectedEmployee);
      const routeIds = (empRoutes || []).map((er) => er.route_id);
      if (routeIds.length > 0) {
        const { data } = await supabase.from('customers').select('id').in('route_id', routeIds).eq('is_active', true);
        customerIds = (data || []).map((c) => c.id);
      }
    }
    if (customerIds.length === 0) { setRows([]); setLoading(false); return; }

    const [billRes, recoveryRes, custRes] = await Promise.all([
      supabase.from('bills').select('customer_id, bill_number, credit_amount').in('customer_id', customerIds).eq('is_voided', false),
      supabase.from('recoveries').select('customer_id, amount').in('customer_id', customerIds),
      supabase.from('customers').select('id, name, shop_code, opening_balance').in('id', customerIds).order('name'),
    ]);

    const creditMap: Record<string, number> = {};
    const billMap: Record<string, string[]> = {};
    const billCreditMap: Record<string, { bill_number: string; credit: number }[]> = {};
    (billRes.data || []).forEach((b) => {
      creditMap[b.customer_id] = (creditMap[b.customer_id] || 0) + (b.credit_amount || 0);
      if (!billMap[b.customer_id]) billMap[b.customer_id] = [];
      if (b.bill_number) billMap[b.customer_id].push(b.bill_number);
      if (!billCreditMap[b.customer_id]) billCreditMap[b.customer_id] = [];
      if (b.bill_number) billCreditMap[b.customer_id].push({ bill_number: b.bill_number, credit: b.credit_amount || 0 });
    });

    const recoveryMap: Record<string, number> = {};
    (recoveryRes.data || []).forEach((r) => {
      recoveryMap[r.customer_id] = (recoveryMap[r.customer_id] || 0) + r.amount;
    });

    const result: PrintRow[] = [];
    (custRes.data || []).forEach((c) => {
      const totalCredit = creditMap[c.id] || 0;
      const recovery = recoveryMap[c.id] || 0;
      const opening = c.opening_balance || 0;
      const customerBalance = totalCredit + opening - recovery;
      if (customerBalance <= 0) return;

      const bills = billCreditMap[c.id] || [];
      if (bills.length > 1) {
        bills.forEach((b, i) => {
          result.push({
            customer_id: c.id,
            shop_code: c.shop_code || c.id.slice(-8).toUpperCase(),
            shop_name: c.name,
            bill_no: b.bill_number,
            total_credit: b.credit,
            total_recovery: i === 0 ? recovery : 0,
            total_balance: i === 0 ? customerBalance : 0,
          });
        });
      } else {
        result.push({
          customer_id: c.id,
          shop_code: c.shop_code || c.id.slice(-8).toUpperCase(),
          shop_name: c.name,
          bill_no: (billMap[c.id] || []).join(', '),
          total_credit: totalCredit + opening,
          total_recovery: recovery,
          total_balance: customerBalance,
        });
      }
    });

    result.sort((a, b) => (a.shop_name || a.customer_id).localeCompare(b.shop_name || b.customer_id));

    setEmployeeName(selectedEmployee ? (employees.find((e) => e.id === selectedEmployee)?.employee_code || '') : '');
    setRouteName(selectedRoute ? (routes.find((r) => r.id === selectedRoute)?.name || '') : 'All Routes');
    setRows(result);
    setReportGenerated(true);
    setLoading(false);
  }

  const headers = ['SHOP ID', 'SHOP NAME', 'BILL NO', 'TOTAL CREDIT', 'TOTAL RECOVERY', 'TOTAL BALANCE', 'TODAY RECOVERY'];

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const companyName = localStorage.getItem('companyName') || 'Distribution & Credit Management System';

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName, pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Daily Recovery Record', pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(8);
    const info = [routeName && `Route: ${routeName}`, employeeName && `Employee: ${employeeName}`, reportDate && `Date: ${formatDate(reportDate)}`].filter(Boolean).join(' | ');
    doc.text(info, pageWidth / 2, 28, { align: 'center' });

    const tableRows = rows.map((r) => [
      r.shop_code,
      r.shop_name,
      r.bill_no,
      formatCurrency(r.total_credit),
      formatCurrency(r.total_recovery),
      formatCurrency(r.total_balance),
      '',
    ]);
    const totalCredit = rows.reduce((s, r) => s + r.total_credit, 0);
    const uniqueBal = new Map<string, number>();
    const uniqueRec = new Map<string, number>();
    rows.forEach((r) => {
      if (r.customer_id && !uniqueBal.has(r.customer_id) && r.total_balance > 0) uniqueBal.set(r.customer_id, r.total_balance);
      if (r.customer_id && !uniqueRec.has(r.customer_id) && r.total_recovery > 0) uniqueRec.set(r.customer_id, r.total_recovery);
    });
    const totalBalance = [...uniqueBal.values()].reduce((s, v) => s + v, 0);
    const totalRecovery = [...uniqueRec.values()].reduce((s, v) => s + v, 0);
    tableRows.push(['', '', 'TOTAL', formatCurrency(totalCredit), formatCurrency(totalRecovery), formatCurrency(totalBalance), '']);

    autoTable(doc, {
      head: [headers],
      body: tableRows,
      startY: 33,
      styles: { fontSize: 8, cellPadding: 3, lineWidth: 0.3, lineColor: [0, 0, 0] },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', lineWidth: 0.5, lineColor: [30, 80, 200] },
      bodyStyles: { textColor: [30, 30, 30], valign: 'middle', lineWidth: 0.3, lineColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [240, 243, 248] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 28 },
        1: { halign: 'left', cellWidth: 50 },
        2: { halign: 'center', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 30 },
        4: { halign: 'right', cellWidth: 30 },
        5: { halign: 'right', cellWidth: 30 },
        6: { halign: 'right', cellWidth: 30 },
      },
      margin: { left: 10, right: 10 },
    });
    doc.save('Route_Recovery_Report.pdf');
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const companyName = localStorage.getItem('companyName') || 'Distribution & Credit Management System';
    const totalCredit = rows.reduce((s, r) => s + r.total_credit, 0);
    const uniqueBal = new Map<string, number>();
    const uniqueRec = new Map<string, number>();
    rows.forEach((r) => {
      if (r.customer_id && !uniqueBal.has(r.customer_id) && r.total_balance > 0) uniqueBal.set(r.customer_id, r.total_balance);
      if (r.customer_id && !uniqueRec.has(r.customer_id) && r.total_recovery > 0) uniqueRec.set(r.customer_id, r.total_recovery);
    });
    const totalBalance = [...uniqueBal.values()].reduce((s, v) => s + v, 0);
    const totalRecovery = [...uniqueRec.values()].reduce((s, v) => s + v, 0);

    const wsData = [
      [companyName],
      ['Daily Recovery Record'],
      [[routeName && `Route: ${routeName}`, employeeName && `Employee: ${employeeName}`, reportDate && `Date: ${formatDate(reportDate)}`].filter(Boolean).join(' | ')],
      [],
      headers,
      ...rows.map((r) => [r.shop_code, r.shop_name, r.bill_no, r.total_credit, r.total_recovery, r.total_balance, '']),
      ['', '', 'TOTAL', totalCredit, totalRecovery, totalBalance, ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
    ];
    ws['!cols'] = headers.map((h, i) => {
      const maxLen = Math.max(h.length, ...rows.map((r) => String(Object.values(r)[i + 1] || '').length));
      return { wch: Math.min(Math.max(maxLen + 2, 12), 35) };
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Route Recovery Report');
    XLSX.writeFile(wb, 'Route_Recovery_Report.xlsx');
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Print Route Report</h1>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Route</label>
            <input type="text" placeholder="Search route..." value={routeSearch}
              onChange={(e) => { setRouteSearch(e.target.value); setShowRouteDropdown(true); if (selectedRoute) { setSelectedRoute(''); setRouteName(''); } }}
              onFocus={() => setShowRouteDropdown(true)}
              onBlur={() => setTimeout(() => setShowRouteDropdown(false), 200)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg w-56" />
            {selectedRoute && <button type="button" onClick={() => { setSelectedRoute(''); setRouteSearch(''); setRouteName(''); }} className="absolute right-2 top-9 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>}
            {showRouteDropdown && !selectedRoute && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {routes.filter((r) => !routeSearch || r.name.toLowerCase().includes(routeSearch.toLowerCase())).slice(0, 20).map((r) => (
                  <button key={r.id} type="button" onMouseDown={() => { setSelectedRoute(r.id); setRouteSearch(r.name); setShowRouteDropdown(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-800 dark:text-slate-200">
                    <span className="font-medium">{r.name}</span>
                  </button>
                ))}
                {routes.filter((r) => !routeSearch || r.name.toLowerCase().includes(routeSearch.toLowerCase())).length === 0 && <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No routes found</div>}
              </div>
            )}
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Employee (Optional)</label>
            <input type="text" placeholder="Search employee..." value={employeeSearch}
              onChange={(e) => { setEmployeeSearch(e.target.value); setShowEmployeeDropdown(true); if (selectedEmployee) { setSelectedEmployee(''); setEmployeeName(''); } }}
              onFocus={() => setShowEmployeeDropdown(true)}
              onBlur={() => setTimeout(() => setShowEmployeeDropdown(false), 200)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg w-56" />
            {selectedEmployee && <button type="button" onClick={() => { setSelectedEmployee(''); setEmployeeSearch(''); setEmployeeName(''); }} className="absolute right-2 top-9 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>}
            {showEmployeeDropdown && !selectedEmployee && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {employees.filter((e) => !employeeSearch || e.name.toLowerCase().includes(employeeSearch.toLowerCase()) || (e.employee_code || '').toLowerCase().includes(employeeSearch.toLowerCase())).slice(0, 20).map((e) => (
                  <button key={e.id} type="button" onMouseDown={() => { setSelectedEmployee(e.id); setEmployeeSearch(e.employee_code || e.name); setShowEmployeeDropdown(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-800 dark:text-slate-200">
                    <span className="font-medium">{e.employee_code || e.name}</span>
                    {e.employee_code && <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{e.name}</span>}
                  </button>
                ))}
                {employees.filter((e) => !employeeSearch || e.name.toLowerCase().includes(employeeSearch.toLowerCase()) || (e.employee_code || '').toLowerCase().includes(employeeSearch.toLowerCase())).length === 0 && <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No employees found</div>}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Report Date</label>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg" />
          </div>

          <button onClick={generateReport} disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
            Generate
          </button>

          {reportGenerated && rows.length > 0 && (
            <>
              <button onClick={() => window.print()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2">
                <Printer className="h-4 w-4" /> Print
              </button>
              <button onClick={exportPDF} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
                <FileDown className="h-4 w-4" /> PDF
              </button>
              <button onClick={exportExcel} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
                <FileDown className="h-4 w-4" /> Excel
              </button>
            </>
          )}
        </div>
      </div>

      {loading && <div className="flex items-center justify-center h-40"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>}

      {!loading && reportGenerated && rows.length === 0 && <div className="text-center py-12 text-slate-500 dark:text-slate-400">No data found for the selected filters</div>}

      {!loading && reportGenerated && rows.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden print:border-0 print:shadow-none">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-blue-600 text-white print:bg-blue-600">
            <h2 className="text-center text-lg font-bold">{localStorage.getItem('companyName') || 'Distribution & Credit Management System'}</h2>
            <p className="text-center text-sm text-blue-100">Daily Recovery Record</p>
            <div className="flex justify-center gap-6 mt-2 text-xs text-blue-200">
              {routeName && <span>Route: <span className="font-semibold text-white">{routeName}</span></span>}
              {employeeName && <span>Employee: <span className="font-semibold text-white">{employeeName}</span></span>}
              {reportDate && <span>Date: <span className="font-semibold text-white">{formatDate(reportDate)}</span></span>}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-600 text-white">
                  {headers.map((h) => (
                    <th key={h} className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider border border-blue-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-slate-200 dark:border-slate-700 last:border-b-2 last:border-slate-400 ${i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                    <td className="px-4 py-3 text-center text-xs font-mono text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{r.shop_code}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium border border-slate-200 dark:border-slate-700">{r.shop_name}</td>
                    <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400 text-xs border border-slate-200 dark:border-slate-700">{r.bill_no}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{formatCurrency(r.total_credit)}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{formatCurrency(r.total_recovery)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">{formatCurrency(r.total_balance)}</td>
                    <td className="px-4 py-3 text-right border border-slate-200 dark:border-slate-700"></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 dark:bg-slate-950 text-white font-bold">
                  <td colSpan={3} className="px-4 py-3 text-center text-xs uppercase tracking-wider border border-slate-600">Total</td>
                  <td className="px-4 py-3 text-right border border-slate-600">{formatCurrency(rows.reduce((s, r) => s + r.total_credit, 0))}</td>
                  <td className="px-4 py-3 text-right border border-slate-600">{formatCurrency(Array.from(new Map(rows.filter((r) => r.total_recovery > 0).map((r) => [r.customer_id, r.total_recovery])).values()).reduce((s, v) => s + v, 0))}</td>
                  <td className="px-4 py-3 text-right border border-slate-600">{formatCurrency(Array.from(new Map(rows.filter((r) => r.total_balance > 0).map((r) => [r.customer_id, r.total_balance])).values()).reduce((s, v) => s + v, 0))}</td>
                  <td className="px-4 py-3 border border-slate-600"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
