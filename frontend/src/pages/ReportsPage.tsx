import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import DateRangeFilter from '@/components/DateRangeFilter';
import { FileDown, Loader2, FileText, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

type Tab = 'customer' | 'route' | 'employee' | 'shop-detail';

interface CustomerReportResult {
  customer_name: string;
  route_name: string;
  total_purchases: number;
  total_credit: number;
  total_recovery: number;
  closing_balance: number;
}

interface RouteReportRow {
  customer_id: string;
  shop_code: string;
  shop_name: string;
  bill_no: string;
  bill_date: string;
  credit: number;
  recovery: number;
  balance: number;
  today_recovery: number;
  route_name: string;
}

interface EmployeeReportRow {
  customer_id: string;
  shop_code: string;
  shop_name: string;
  bill_no: string;
  bill_date: string;
  credit: number;
  recovery: number;
  balance: number;
  today_recovery: number;
  route_name: string;
  employee_code: string;
}

interface ShopDetailResult {
  date: string;
  type: 'bill' | 'recovery';
  reference: string;
  amount: number;
  credit: number;
  notes: string;
  route_name: string;
  shop_code: string;
}

interface DetailModal {
  type: 'shop' | 'employee';
  id: string;
  name: string;
}

interface ShopDetailInfo {
  name: string;
  phone: string;
  route_name: string;
  total_credit: number;
  total_recovery: number;
  outstanding: number;
  bills: { bill_number: string; credit_amount: number; bill_date: string }[];
}

interface EmployeeDetailInfo {
  name: string;
  phone: string;
  routes: string[];
  total_bills: number;
  total_credit: number;
  total_recovery: number;
  shops: { name: string; credit: number; recovery: number }[];
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'customer', label: 'Customer Report' },
  { id: 'route', label: 'Route Report' },
  { id: 'employee', label: 'Employee Report' },
  { id: 'shop-detail', label: 'Shop Detail Report' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('customer');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: '',
    to: '',
  });
  const [loading, setLoading] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [routes, setRoutes] = useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; employee_code: string }[]>([]);

  const [customerReport, setCustomerReport] = useState<CustomerReportResult | null>(null);
  const [routeReport, setRouteReport] = useState<RouteReportRow[]>([]);
  const [employeeReport, setEmployeeReport] = useState<EmployeeReportRow[]>([]);
  const [shopDetailReport, setShopDetailReport] = useState<ShopDetailResult[]>([]);
  const [detailModal, setDetailModal] = useState<DetailModal | null>(null);
  const [shopDetail, setShopDetail] = useState<ShopDetailInfo | null>(null);
  const [employeeDetail, setEmployeeDetail] = useState<EmployeeDetailInfo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [routeSearch, setRouteSearch] = useState('');
  const [showRouteDropdown, setShowRouteDropdown] = useState(false);

  const fetchDropdowns = async () => {
    const [custRes, routeRes, empRes] = await Promise.all([
      supabase.from('customers').select('id, name').eq('is_active', true).order('name'),
      supabase.from('routes').select('id, name').order('name'),
      supabase.from('employees').select('id, name, employee_code').eq('is_active', true).order('name'),
    ]);
    if (custRes.data) setCustomers(custRes.data);
    if (routeRes.data) setRoutes(routeRes.data);
    if (empRes.data) setEmployees(empRes.data);
  };

  useEffect(() => {
    fetchDropdowns();
  }, []);

  async function generateCustomerReport() {
    if (!customerId) return;
    setLoading(true);

    const cust = customers.find((c) => c.id === customerId);
    let routeName = 'N/A';
    if (cust) {
    const { data: custFull } = await supabase.from('customers').select('route_id, shop_code').eq('id', customerId).single();
      if (custFull?.route_id) {
        const { data: route } = await supabase.from('routes').select('name').eq('id', custFull.route_id).single();
        routeName = route?.name || 'N/A';
      }
    }

    let billQuery = supabase
      .from('bills')
      .select('total_amount, credit_amount, bill_date')
      .eq('customer_id', customerId)
      .eq('is_voided', false);

    let recoveryQuery = supabase
      .from('recoveries')
      .select('amount, recovery_date')
      .eq('customer_id', customerId);

    if (dateRange.from) {
      billQuery = billQuery.gte('bill_date', dateRange.from);
      recoveryQuery = recoveryQuery.gte('recovery_date', dateRange.from);
    }
    if (dateRange.to) {
      billQuery = billQuery.lte('bill_date', dateRange.to);
      recoveryQuery = recoveryQuery.lte('recovery_date', dateRange.to);
    }

    const [billRes, recoveryRes] = await Promise.all([billQuery, recoveryQuery]);

    const totalPurchases = (billRes.data || []).reduce((s, b) => s + b.total_amount, 0);
    const totalCredit = (billRes.data || []).reduce((s, b) => s + b.credit_amount, 0);
    const totalRecovery = (recoveryRes.data || []).reduce((s, r) => s + r.amount, 0);

    setCustomerReport({
      customer_name: cust?.name || 'N/A',
      route_name: routeName,
      total_purchases: totalPurchases,
      total_credit: totalCredit,
      total_recovery: totalRecovery,
      closing_balance: totalCredit - totalRecovery,
    });
    setLoading(false);
  }

  async function generateRouteReport() {
    if (!routeId) return;
    setLoading(true);

    const { data: routeData } = await supabase.from('routes').select('id, name').eq('id', routeId).single();
    const routeName = routeData?.name || 'N/A';

    const { data: customerData } = await supabase
      .from('customers')
      .select('id, name, shop_code, opening_balance')
      .eq('route_id', routeId)
      .order('name');

    if (!customerData || customerData.length === 0) {
      setRouteReport([]);
      setLoading(false);
      return;
    }

    const custIds = customerData.map((c) => c.id);

    let billQuery = supabase
      .from('bills')
      .select('id, customer_id, employee_id, bill_number, credit_amount, bill_date')
      .eq('is_voided', false)
      .order('bill_date', { ascending: false });

    billQuery = billQuery.in('customer_id', custIds);

    let recoveryQuery = supabase
      .from('recoveries')
      .select('customer_id, amount, bill_no')
      .in('customer_id', custIds);

    if (dateRange.from) {
      billQuery = billQuery.gte('bill_date', dateRange.from);
      recoveryQuery = recoveryQuery.gte('recovery_date', dateRange.from);
    }
    if (dateRange.to) {
      billQuery = billQuery.lte('bill_date', dateRange.to);
      recoveryQuery = recoveryQuery.lte('recovery_date', dateRange.to);
    }

    const [billRes, recoveryRes] = await Promise.all([billQuery, recoveryQuery]);

    if (billRes.error) {
      console.error('Error fetching bills for route report:', billRes.error);
    }
    if (recoveryRes.error) {
      console.error('Error fetching recoveries for route report:', recoveryRes.error);
    }

    const billCustomerIds = [...new Set((billRes.data || []).map((b) => b.customer_id).filter(Boolean))];
    const allCustomerIds = [...new Set([...custIds, ...billCustomerIds])];

    const { data: allCustomers } = await supabase
      .from('customers')
      .select('id, name, shop_code, opening_balance')
      .in('id', allCustomerIds.length > 0 ? allCustomerIds : ['none']);

    const billRecoveryMap: Record<string, number> = {};
    (recoveryRes.data || []).forEach((r) => {
      if (r.bill_no) {
        billRecoveryMap[r.bill_no] = (billRecoveryMap[r.bill_no] || 0) + r.amount;
      }
    });

    const totalRecoveryPerCustomer: Record<string, number> = {};
    (recoveryRes.data || []).forEach((r) => {
      totalRecoveryPerCustomer[r.customer_id] = (totalRecoveryPerCustomer[r.customer_id] || 0) + r.amount;
    });

    const customerMap: Record<string, { name: string; shop_code: string; opening_balance: number }> = {};
    (allCustomers || []).forEach((c) => {
      customerMap[c.id] = { name: c.name, shop_code: c.shop_code || '', opening_balance: c.opening_balance || 0 };
    });

    const rows: RouteReportRow[] = (billRes.data || []).map((b) => {
      if (!b.customer_id) return null;
      const c = customerMap[b.customer_id];
      if (!c) return null;
      const billRecovery = billRecoveryMap[b.bill_number] || 0;
      const totalRecovery = totalRecoveryPerCustomer[b.customer_id] || 0;
      const hasBillLevelRecovery = Object.keys(billRecoveryMap).some(
        (bn) => bn && (recoveryRes.data || []).some((r) => r.bill_no === bn && r.customer_id === b.customer_id)
      );
      const recovery = billRecovery || (hasBillLevelRecovery ? 0 : totalRecovery);
      const credit = b.credit_amount || 0;
      return {
        customer_id: b.customer_id,
        shop_code: c.shop_code,
        shop_name: c.name,
        bill_no: b.bill_number || '',
        bill_date: b.bill_date || '',
        credit,
        recovery,
        balance: credit + c.opening_balance - recovery,
        route_name: routeName,
        today_recovery: 0,
      };
    }).filter(Boolean) as RouteReportRow[];

    setRouteReport(rows);
    setLoading(false);
  }

  async function generateEmployeeReport() {
    setLoading(true);

    let empQuery = supabase
      .from('employees')
      .select('id, name, employee_code')
      .eq('is_active', true);

    if (employeeId) {
      empQuery = empQuery.eq('id', employeeId);
    }

    const { data: empData } = await empQuery;
    if (!empData || empData.length === 0) {
      setEmployeeReport([]);
      setLoading(false);
      return;
    }

    const empIds = empData.map((e) => e.id);

    const { data: empRoutes } = await supabase
      .from('employee_routes')
      .select('employee_id, route_id')
      .in('employee_id', empIds);
    const empRouteMap: Record<string, string[]> = {};
    (empRoutes || []).forEach((er) => {
      if (!empRouteMap[er.employee_id]) empRouteMap[er.employee_id] = [];
      empRouteMap[er.employee_id].push(er.route_id);
    });
    const allRouteIds = [...new Set(Object.values(empRouteMap).flat())];

    const { data: custOnRoutes } = await supabase
      .from('customers')
      .select('id')
      .in('route_id', allRouteIds.length > 0 ? allRouteIds : ['none']);
    const customerIdsOnRoutes = (custOnRoutes || []).map((c) => c.id);

    let billQuery = supabase
      .from('bills')
      .select('id, customer_id, employee_id, bill_number, credit_amount, bill_date')
      .eq('is_voided', false)
      .order('bill_date', { ascending: false });

    if (customerIdsOnRoutes.length > 0) {
      billQuery = billQuery.in('customer_id', customerIdsOnRoutes);
    } else {
      billQuery = billQuery.in('employee_id', empIds);
    }

    let recoveryQuery = supabase
      .from('recoveries')
      .select('customer_id, amount, bill_no');

    if (customerIdsOnRoutes.length > 0) {
      recoveryQuery = recoveryQuery.in('customer_id', customerIdsOnRoutes);
    }

    if (dateRange.from) {
      billQuery = billQuery.gte('bill_date', dateRange.from);
      recoveryQuery = recoveryQuery.gte('recovery_date', dateRange.from);
    }
    if (dateRange.to) {
      billQuery = billQuery.lte('bill_date', dateRange.to);
      recoveryQuery = recoveryQuery.lte('recovery_date', dateRange.to);
    }

    const [billRes, recoveryRes] = await Promise.all([billQuery, recoveryQuery]);

    const { data: customersData } = await supabase
      .from('customers')
      .select('id, name, route_id, shop_code, opening_balance')
      .in('id', customerIdsOnRoutes.length > 0 ? customerIdsOnRoutes : [...new Set((billRes.data || []).map((b) => b.customer_id))]);

    const { data: routesData } = await supabase.from('routes').select('id, name');
    const routeMap: Record<string, string> = {};
    (routesData || []).forEach((r) => { routeMap[r.id] = r.name; });

    const customerMap: Record<string, { name: string; route_id: string; shop_code: string; opening_balance: number }> = {};
    (customersData || []).forEach((c) => {
      customerMap[c.id] = { name: c.name, route_id: c.route_id, shop_code: c.shop_code || '', opening_balance: c.opening_balance || 0 };
    });

    const billRecoveryMap: Record<string, number> = {};
    (recoveryRes.data || []).forEach((r) => {
      if (r.bill_no) {
        billRecoveryMap[r.bill_no] = (billRecoveryMap[r.bill_no] || 0) + r.amount;
      }
    });

    const totalRecoveryPerCustomer: Record<string, number> = {};
    (recoveryRes.data || []).forEach((r) => {
      totalRecoveryPerCustomer[r.customer_id] = (totalRecoveryPerCustomer[r.customer_id] || 0) + r.amount;
    });

    const routeToEmpCode: Record<string, string> = {};
    (empRoutes || []).forEach((er) => {
      const emp = empData.find((e) => e.id === er.employee_id);
      if (emp?.employee_code) routeToEmpCode[er.route_id] = emp.employee_code;
    });

    const rows: EmployeeReportRow[] = (billRes.data || []).map((b) => {
      const c = customerMap[b.customer_id];
      if (!c) return null;
      const billRecovery = billRecoveryMap[b.bill_number] || 0;
      const totalRecovery = totalRecoveryPerCustomer[b.customer_id] || 0;
      const hasBillLevelRecovery = Object.keys(billRecoveryMap).some(
        (bn) => bn && (recoveryRes.data || []).some((r) => r.bill_no === bn && r.customer_id === b.customer_id)
      );
      const recovery = billRecovery || (hasBillLevelRecovery ? 0 : totalRecovery);
      const credit = b.credit_amount || 0;
      return {
        customer_id: b.customer_id,
        shop_code: c.shop_code,
        shop_name: c.name,
        bill_no: b.bill_number,
        bill_date: b.bill_date,
        credit,
        recovery,
        balance: credit + c.opening_balance - recovery,
        route_name: routeMap[c.route_id] || 'N/A',
        employee_code: routeToEmpCode[c.route_id] || '',
        today_recovery: 0,
      };
    }).filter(Boolean) as EmployeeReportRow[];

    setEmployeeReport(rows);
    setLoading(false);
  }

  async function generateShopDetailReport() {
    if (!customerId) return;
    setLoading(true);

    const { data: custFull } = await supabase.from('customers').select('route_id, shop_code').eq('id', customerId).single();
    let routeName = 'N/A';
    if (custFull?.route_id) {
      const { data: route } = await supabase.from('routes').select('name').eq('id', custFull.route_id).single();
      routeName = route?.name || 'N/A';
    }

    let billQuery = supabase
      .from('bills')
      .select('bill_number, total_amount, credit_amount, bill_date, notes')
      .eq('customer_id', customerId)
      .eq('is_voided', false);

    let recoveryQuery = supabase
      .from('recoveries')
      .select('amount, recovery_date, notes')
      .eq('customer_id', customerId);

    if (dateRange.from) {
      billQuery = billQuery.gte('bill_date', dateRange.from);
      recoveryQuery = recoveryQuery.gte('recovery_date', dateRange.from);
    }
    if (dateRange.to) {
      billQuery = billQuery.lte('bill_date', dateRange.to);
      recoveryQuery = recoveryQuery.lte('recovery_date', dateRange.to);
    }

    const [billRes, recoveryRes] = await Promise.all([billQuery, recoveryQuery]);

    const shopCode = custFull?.shop_code || '';
    const transactions: ShopDetailResult[] = [
      ...(billRes.data || []).map((b) => ({
        date: b.bill_date,
        type: 'bill' as const,
        reference: b.bill_number,
        amount: b.total_amount,
        credit: b.credit_amount,
        notes: b.notes || '',
        route_name: routeName,
        shop_code: shopCode,
      })),
      ...(recoveryRes.data || []).map((r) => ({
        date: r.recovery_date,
        type: 'recovery' as const,
        reference: 'Recovery',
        amount: r.amount,
        credit: 0,
        notes: r.notes || '',
        route_name: routeName,
        shop_code: shopCode,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setShopDetailReport(transactions);
    setLoading(false);
  }

  function handleGenerate() {
    switch (activeTab) {
      case 'customer':
        if (!customerId) { alert('Please select a customer'); return; }
        generateCustomerReport();
        break;
      case 'route':
        if (!routeId) { alert('Please select a route'); return; }
        generateRouteReport();
        break;
      case 'employee':
        generateEmployeeReport();
        break;
      case 'shop-detail':
        if (!customerId) { alert('Please select a customer'); return; }
        generateShopDetailReport();
        break;
    }
  }

  async function openShopDetail(customerId: string, name: string) {
    setDetailModal({ type: 'shop', id: customerId, name });
    setDetailLoading(true);
    setShopDetail(null);

    const { data: custData } = await supabase
      .from('customers')
      .select('name, phone, route_id')
      .eq('id', customerId)
      .single();

    const { data: routeData } = custData?.route_id
      ? await supabase.from('routes').select('name').eq('id', custData.route_id).single()
      : { data: null };

    const { data: bills } = await supabase
      .from('bills')
      .select('bill_number, credit_amount, bill_date')
      .eq('customer_id', customerId)
      .eq('is_voided', false)
      .order('bill_date', { ascending: false });

    const { data: recoveries } = await supabase
      .from('recoveries')
      .select('amount')
      .eq('customer_id', customerId);

    const totalCredit = (bills || []).reduce((s, b) => s + (b.credit_amount || 0), 0);
    const totalRecovery = (recoveries || []).reduce((s, r) => s + r.amount, 0);

    setShopDetail({
      name: custData?.name || name,
      phone: custData?.phone || 'N/A',
      route_name: routeData?.name || 'N/A',
      total_credit: totalCredit,
      total_recovery: totalRecovery,
      outstanding: totalCredit - totalRecovery,
      bills: (bills || []).map((b) => ({
        bill_number: b.bill_number,
        credit_amount: b.credit_amount || 0,
        bill_date: b.bill_date,
      })),
    });
    setDetailLoading(false);
  }

  async function openEmployeeDetail(empId: string, name: string) {
    setDetailModal({ type: 'employee', id: empId, name });
    setDetailLoading(true);
    setEmployeeDetail(null);

    const { data: empData } = await supabase
      .from('employees')
      .select('name, phone')
      .eq('id', empId)
      .single();

    const { data: empRoutes } = await supabase
      .from('employee_routes')
      .select('route:routes(name)')
      .eq('employee_id', empId);

    const routeNames = (empRoutes || []).map((er: any) => er.route?.name).filter(Boolean);

    const { data: bills } = await supabase
      .from('bills')
      .select('customer_id, credit_amount')
      .eq('employee_id', empId)
      .eq('is_voided', false);

    const { data: recoveries } = await supabase
      .from('recoveries')
      .select('customer_id, amount')
      .eq('employee_id', empId);

    const customerIds = [...new Set([
      ...(bills || []).map((b) => b.customer_id),
      ...(recoveries || []).map((r) => r.customer_id),
    ])];

    const { data: customersData } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', customerIds);

    const custMap: Record<string, string> = {};
    (customersData || []).forEach((c) => { custMap[c.id] = c.name; });

    const creditMap: Record<string, number> = {};
    (bills || []).forEach((b) => {
      creditMap[b.customer_id] = (creditMap[b.customer_id] || 0) + (b.credit_amount || 0);
    });

    const recoveryMap: Record<string, number> = {};
    (recoveries || []).forEach((r) => {
      recoveryMap[r.customer_id] = (recoveryMap[r.customer_id] || 0) + r.amount;
    });

    const allCustIds = [...new Set([...Object.keys(creditMap), ...Object.keys(recoveryMap)])];
    const totalCredit = Object.values(creditMap).reduce((s, v) => s + v, 0);
    const totalRecovery = Object.values(recoveryMap).reduce((s, v) => s + v, 0);

    setEmployeeDetail({
      name: empData?.name || name,
      phone: empData?.phone || 'N/A',
      routes: routeNames,
      total_bills: (bills || []).length,
      total_credit: totalCredit,
      total_recovery: totalRecovery,
      shops: allCustIds.map((id) => ({
        name: custMap[id] || 'N/A',
        credit: creditMap[id] || 0,
        recovery: recoveryMap[id] || 0,
      })),
    });
    setDetailLoading(false);
  }

  function exportPDF(title: string, headers: string[], rows: any[][]) {
    const isLandscape = headers.length > 5;
    const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const companyName = localStorage.getItem('companyName') || 'Distribution & Credit Management System';

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName, pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(title, pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(8);
    const dateStr = dateRange.from && dateRange.to
      ? `Date Range: ${dateRange.from} to ${dateRange.to}`
      : `Generated: ${new Date().toLocaleDateString()}`;
    doc.text(dateStr, pageWidth / 2, 28, { align: 'center' });

    const usableWidth = isLandscape ? pageWidth - 20 : pageWidth - 20;

    const colWidths: Record<number, number> = {};
    if (isLandscape) {
      headers.forEach((h, i) => {
        if (h === 'SHOP NAME') colWidths[i] = 50;
        else if (h === 'SHOP ID') colWidths[i] = 28;
        else if (h === 'BILL NO') colWidths[i] = 28;
        else if (h === 'EMPLOYEE ID') colWidths[i] = 30;
        else if (h === 'TODAY RECOVERY') colWidths[i] = 32;
        else colWidths[i] = 32;
      });
    } else {
      headers.forEach((h, i) => {
        if (h === 'SHOP NAME') colWidths[i] = 45;
        else if (h === 'SHOP ID') colWidths[i] = 22;
        else if (h === 'BILL NO') colWidths[i] = 22;
        else if (h === 'NOTES') colWidths[i] = 35;
        else colWidths[i] = 25;
      });
    }

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 33,
      tableWidth: 'wrap',
      styles: {
        fontSize: 7.5,
        cellPadding: 2.5,
        overflow: 'linebreak',
        font: 'helvetica',
        lineWidth: 0.4,
        lineColor: [0, 0, 0],
        minCellHeight: 8,
      },
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
        valign: 'middle',
        lineWidth: 0.5,
        lineColor: [30, 80, 200],
        minCellHeight: 10,
      },
      bodyStyles: {
        textColor: [30, 30, 30],
        valign: 'middle',
        lineWidth: 0.4,
        lineColor: [0, 0, 0],
      },
      alternateRowStyles: {
        fillColor: [240, 243, 248],
      },
      columnStyles: (() => {
        const styles: Record<number, any> = {};
        headers.forEach((h, i) => {
          if (['TOTAL CREDIT', 'TOTAL RECOVERY', 'TOTAL BALANCE', 'TODAY RECOVERY', 'AMOUNT', 'CREDIT'].includes(h)) {
            styles[i] = { halign: 'right', cellWidth: colWidths[i] || 25 };
          } else if (h === 'SHOP NAME' || h === 'NOTES') {
            styles[i] = { halign: 'left', cellWidth: colWidths[i] || 40 };
          } else {
            styles[i] = { halign: 'center', cellWidth: colWidths[i] || 25 };
          }
        });
        return styles;
      })(),
      margin: { left: 10, right: 10, top: 10, bottom: 15 },
      didDrawPage: () => {
        const footerY = pageHeight - 8;
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth / 2, footerY, { align: 'center' });
      },
    });

    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
  }

  function exportExcel(title: string, headers: string[], rows: any[][]) {
    const wb = XLSX.utils.book_new();
    const companyName = localStorage.getItem('companyName') || 'Distribution & Credit Management System';
    const dateStr = dateRange.from && dateRange.to
      ? `Date Range: ${dateRange.from} to ${dateRange.to}`
      : `Generated: ${new Date().toLocaleDateString()}`;

    const wsData = [
      [companyName],
      [title],
      [dateStr],
      [],
      headers,
      ...rows,
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: headers.length - 1 } },
    ];

    const colWidths = headers.map((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...rows.map((r) => String(r[i] || '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 2, 12), 30) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
    XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}.xlsx`);
  }

  function getReportData(): { title: string; headers: string[]; rows: any[][] } {
    switch (activeTab) {
      case 'customer':
        if (!customerReport) return { title: 'Customer Report', headers: [], rows: [] };
        return {
          title: `Customer Report - ${customerReport.customer_name}`,
          headers: ['Metric', 'Amount'],
          rows: [
            ['Route', customerReport.route_name],
            ['Total Purchases', formatCurrency(customerReport.total_purchases)],
            ['Total Credit', formatCurrency(customerReport.total_credit)],
            ['Total Recovery', formatCurrency(customerReport.total_recovery)],
            ['Closing Balance', formatCurrency(customerReport.closing_balance)],
          ],
        };
      case 'route': {
        const filtered = routeReport.filter((r) => r.balance !== 0);
        const totalCredit = filtered.reduce((s, r) => s + r.credit, 0);
        const totalRecovery = filtered.reduce((s, r) => s + r.recovery, 0);
        const totalBalance = filtered.reduce((s, r) => s + r.balance, 0);
        return {
          title: `Route Report - ${routeReport[0]?.route_name || ''}`,
          headers: ['SHOP ID', 'SHOP NAME', 'BILL NO', 'BILL DATE', 'TOTAL CREDIT', 'TOTAL RECOVERY', 'TOTAL BALANCE', 'TODAY RECOVERY'],
          rows: [
            ...filtered.map((r) => [
              r.shop_code || r.customer_id.slice(-8).toUpperCase(),
              r.shop_name,
              r.bill_no,
              r.bill_date ? formatDate(r.bill_date) : '',
              formatCurrency(r.credit),
              formatCurrency(r.recovery),
              formatCurrency(r.balance),
              '',
            ]),
            ['', '', '', 'TOTAL', formatCurrency(totalCredit), formatCurrency(totalRecovery), formatCurrency(totalBalance), ''],
          ],
        };
      }
      case 'employee': {
        const filtered = employeeReport.filter((r) => r.balance !== 0);
        const totalCredit = filtered.reduce((s, r) => s + r.credit, 0);
        const totalRecovery = filtered.reduce((s, r) => s + r.recovery, 0);
        const totalBalance = filtered.reduce((s, r) => s + r.balance, 0);
        return {
          title: `Employee Report - ${employeeId ? (employees.find(e => e.id === employeeId)?.employee_code || 'All') : 'All Employees'}`,
          headers: ['SHOP ID', 'SHOP NAME', 'EMPLOYEE ID', 'BILL NO', 'BILL DATE', 'TOTAL CREDIT', 'TOTAL RECOVERY', 'TOTAL BALANCE', 'TODAY RECOVERY'],
          rows: [
            ...filtered.map((r) => [
              r.shop_code || r.customer_id.slice(-8).toUpperCase(),
              r.shop_name,
              r.employee_code,
              r.bill_no,
              r.bill_date ? formatDate(r.bill_date) : '',
              formatCurrency(r.credit),
              formatCurrency(r.recovery),
              formatCurrency(r.balance),
              '',
            ]),
            ['', '', '', '', 'TOTAL', formatCurrency(totalCredit), formatCurrency(totalRecovery), formatCurrency(totalBalance), ''],
          ],
        };
      }
      case 'shop-detail': {
        const totalAmount = shopDetailReport.reduce((s, r) => s + r.amount, 0);
        const totalCredit = shopDetailReport.reduce((s, r) => s + r.credit, 0);
        return {
          title: `Shop Detail Report - ${shopDetailReport[0]?.shop_code || customerId.slice(-8).toUpperCase()}`,
          headers: ['Date', 'Type', 'Reference', 'Amount', 'Credit', 'Notes'],
          rows: [
            ...shopDetailReport.map((r) => [
              formatDate(r.date),
              r.type,
              r.reference,
              formatCurrency(r.amount),
              formatCurrency(r.credit),
              r.notes,
            ]),
            ['', '', 'TOTAL', formatCurrency(totalAmount), formatCurrency(totalCredit), ''],
          ],
        };
      }
      default:
        return { title: '', headers: [], rows: [] };
    }
  }

  const reportData = getReportData();
  const hasData = reportData.rows.length > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Reports</h1>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setTableSearch(''); setCustomerSearch(''); setCustomerId(''); setEmployeeSearch(''); setEmployeeId(''); setRouteSearch(''); setRouteId(''); }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <DateRangeFilter
          from={dateRange.from}
          to={dateRange.to}
          onChange={(from, to) => setDateRange({ from, to })}
        />

        {(activeTab === 'customer' || activeTab === 'shop-detail') && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search customer..."
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setShowCustomerDropdown(true);
                if (customerId) setCustomerId('');
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg w-56"
            />
            {customerId && (
              <button
                type="button"
                onClick={() => { setCustomerId(''); setCustomerSearch(''); }}
                className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
            {showCustomerDropdown && !customerId && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {customers
                  .filter((c) => {
                    const q = customerSearch.toLowerCase();
                    return !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
                  })
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setCustomerId(c.id);
                        setCustomerSearch(c.name);
                        setShowCustomerDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-800 dark:text-slate-200"
                    >
                      <span className="font-medium">{c.name}</span>
                    </button>
                  ))
                  .slice(0, 20)}
                {customers.filter((c) => {
                  const q = customerSearch.toLowerCase();
                  return !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
                }).length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No customers found</div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'route' && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search route..."
              value={routeSearch}
              onChange={(e) => {
                setRouteSearch(e.target.value);
                setShowRouteDropdown(true);
                if (routeId) setRouteId('');
              }}
              onFocus={() => setShowRouteDropdown(true)}
              onBlur={() => setTimeout(() => setShowRouteDropdown(false), 200)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg w-56"
            />
            {routeId && (
              <button
                type="button"
                onClick={() => { setRouteId(''); setRouteSearch(''); }}
                className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
            {showRouteDropdown && !routeId && (
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
                        setRouteId(r.id);
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
        )}

        {activeTab === 'employee' && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search employee..."
              value={employeeSearch}
              onChange={(e) => {
                setEmployeeSearch(e.target.value);
                setShowEmployeeDropdown(true);
                if (employeeId) setEmployeeId('');
              }}
              onFocus={() => setShowEmployeeDropdown(true)}
              onBlur={() => setTimeout(() => setShowEmployeeDropdown(false), 200)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg w-56"
            />
            {employeeId && (
              <button
                type="button"
                onClick={() => { setEmployeeId(''); setEmployeeSearch(''); }}
                className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
            {showEmployeeDropdown && !employeeId && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onMouseDown={() => {
                    setEmployeeId('');
                    setEmployeeSearch('All Employees');
                    setShowEmployeeDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-500 dark:text-slate-400 italic"
                >
                  All Employees
                </button>
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
                        setEmployeeId(e.id);
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
        )}

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          Generate
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && hasData && (
        <div className="rounded-lg border shadow-sm bg-white">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">{reportData.title}</h2>
              {(activeTab === 'route' || activeTab === 'employee' || activeTab === 'shop-detail') && (
                <input
                  type="text"
                  placeholder="Search..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg w-48"
                />
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => exportPDF(reportData.title, reportData.headers, reportData.rows)}
                className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <FileDown className="h-4 w-4" />
                PDF
              </button>
              <button
                onClick={() => exportExcel(reportData.title, reportData.headers, reportData.rows)}
                className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <FileDown className="h-4 w-4" />
                Excel
              </button>
            </div>
          </div>

          {activeTab === 'customer' && customerReport && (
            <div>
              <div className="px-6 py-2 text-sm text-slate-600 dark:text-slate-400">
                <span className="font-medium">Route: </span>{customerReport.route_name}
              </div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-gray-600">Total Purchases</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(customerReport.total_purchases)}
                </p>
              </div>
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <p className="text-sm text-gray-600">Total Credit</p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(customerReport.total_credit)}
                </p>
              </div>
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                <p className="text-sm text-gray-600">Total Recovery</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(customerReport.total_recovery)}
                </p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-sm text-gray-600">Closing Balance</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(customerReport.closing_balance)}
                </p>
              </div>
            </div>
            </div>
          )}

          {(activeTab === 'route' || activeTab === 'employee' || activeTab === 'shop-detail') && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    {reportData.headers.map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeTab === 'route' && routeReport
                    .filter((r) => r.balance !== 0)
                    .filter((r) => {
                      const q = tableSearch.toLowerCase();
                      return !q || r.shop_name.toLowerCase().includes(q) || r.customer_id.toLowerCase().includes(q) || r.bill_no.toLowerCase().includes(q) || r.route_name.toLowerCase().includes(q);
                    })
                    .map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 text-xs text-gray-500">{r.shop_code || r.customer_id.slice(-8).toUpperCase()}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => openShopDetail(r.customer_id, r.shop_name)}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {r.shop_name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.bill_no}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.bill_date ? formatDate(r.bill_date) : ''}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatCurrency(r.credit)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatCurrency(r.recovery)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatCurrency(r.balance)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300"></td>
                    </tr>
                  ))}
                  {activeTab === 'employee' && employeeReport
                    .filter((r) => r.balance !== 0)
                    .filter((r) => {
                      const q = tableSearch.toLowerCase();
                      return !q || r.shop_name.toLowerCase().includes(q) || r.customer_id.toLowerCase().includes(q) || r.bill_no.toLowerCase().includes(q) || r.route_name.toLowerCase().includes(q);
                    })
                    .map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 text-xs text-gray-500">{r.shop_code || r.customer_id.slice(-8).toUpperCase()}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => openShopDetail(r.customer_id, r.shop_name)}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {r.shop_name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.employee_code}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.bill_no}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.bill_date ? formatDate(r.bill_date) : ''}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatCurrency(r.credit)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatCurrency(r.recovery)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatCurrency(r.balance)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300"></td>
                    </tr>
                  ))}
                  {activeTab === 'shop-detail' && shopDetailReport
                    .filter((r) => {
                      const q = tableSearch.toLowerCase();
                      return !q || r.type.toLowerCase().includes(q) || r.reference.toLowerCase().includes(q) || r.notes.toLowerCase().includes(q) || r.route_name.toLowerCase().includes(q);
                    })
                    .map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatDate(r.date)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          r.type === 'bill' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        )}>
                          {r.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.reference}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatCurrency(r.credit)}</td>
                      <td className="px-4 py-3 text-gray-500">{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && !hasData && (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          Select filters and click Generate to view the report
        </div>
      )}

      {detailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-auto shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {detailModal.type === 'shop' ? 'Shop Details' : 'Employee Details'}
              </h2>
              <button
                onClick={() => { setDetailModal(null); setShopDetail(null); setEmployeeDetail(null); }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              {detailLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}

              {!detailLoading && detailModal.type === 'shop' && shopDetail && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Name</p>
                      <p className="font-medium">{shopDetail.name}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Phone</p>
                      <p className="font-medium">{shopDetail.phone}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Route</p>
                      <p className="font-medium">{shopDetail.route_name}</p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-lg">
                      <p className="text-xs text-gray-500">Outstanding</p>
                      <p className="font-bold text-amber-700">{formatCurrency(shopDetail.outstanding)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-red-50 rounded-lg">
                      <p className="text-xs text-gray-500">Total Credit</p>
                      <p className="font-bold text-red-700">{formatCurrency(shopDetail.total_credit)}</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-gray-500">Total Recovery</p>
                      <p className="font-bold text-green-700">{formatCurrency(shopDetail.total_recovery)}</p>
                    </div>
                  </div>
                  {shopDetail.bills.length > 0 && (
                    <div>
                      <h3 className="font-medium mb-2">Bills</h3>
                      <table className="w-full text-sm border rounded-lg overflow-hidden">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Bill No</th>
                            <th className="px-3 py-2 text-left">Credit</th>
                            <th className="px-3 py-2 text-left">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shopDetail.bills.map((b, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-2">{b.bill_number}</td>
                              <td className="px-3 py-2">{formatCurrency(b.credit_amount)}</td>
                              <td className="px-3 py-2 text-gray-500">{formatDate(b.bill_date)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {!detailLoading && detailModal.type === 'employee' && employeeDetail && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Name</p>
                      <p className="font-medium">{employeeDetail.name}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Phone</p>
                      <p className="font-medium">{employeeDetail.phone}</p>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Assigned Routes</p>
                    <div className="flex flex-wrap gap-1">
                      {employeeDetail.routes.map((r, i) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Total Bills</p>
                      <p className="font-bold">{employeeDetail.total_bills}</p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg">
                      <p className="text-xs text-gray-500">Total Credit</p>
                      <p className="font-bold text-red-700">{formatCurrency(employeeDetail.total_credit)}</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-gray-500">Total Recovery</p>
                      <p className="font-bold text-green-700">{formatCurrency(employeeDetail.total_recovery)}</p>
                    </div>
                  </div>
                  {employeeDetail.shops.length > 0 && (
                    <div>
                      <h3 className="font-medium mb-2">Shops</h3>
                      <table className="w-full text-sm border rounded-lg overflow-hidden">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Shop Name</th>
                            <th className="px-3 py-2 text-left">Credit</th>
                            <th className="px-3 py-2 text-left">Recovery</th>
                          </tr>
                        </thead>
                        <tbody>
                          {employeeDetail.shops.map((s, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-2">{s.name}</td>
                              <td className="px-3 py-2">{formatCurrency(s.credit)}</td>
                              <td className="px-3 py-2">{formatCurrency(s.recovery)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
