import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate, todayLocal } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CreditCard,
  CircleDollarSign,
  ArrowDownRight,
  Pencil,
  Check,
  X,
  Loader2,
  MapPin,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface DashboardStats {
  totalCredit: number;
  totalRecovery: number;
  totalOutstanding: number;
  totalOpeningBalance: number;
  todayCredit: number;
  todayRecovery: number;
  todayOutstanding: number;
}

interface DrillRow {
  name: string;
  amount: number;
  sub?: string;
}

export default function Dashboard() {
  const { user, userRole, userEmployee } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalCredit: 0,
    totalRecovery: 0,
    totalOutstanding: 0,
    totalOpeningBalance: 0,
    todayCredit: 0,
    todayRecovery: 0,
    todayOutstanding: 0,
  });
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('ABWA TRADERS');
  const [isEditingName, setIsEditingName] = useState(false);
  const [activeTile, setActiveTile] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<DrillRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillTitle, setDrillTitle] = useState('');
  const [recoveryView, setRecoveryView] = useState<'employee' | 'customer'>('employee');
  const [routeDrillData, setRouteDrillData] = useState<DrillRow[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeDrillLoading, setRouteDrillLoading] = useState(false);
  const [drillPage, setDrillPage] = useState(1);
  const [routeDrillPage, setRouteDrillPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    const saved = localStorage.getItem('companyName');
    if (saved) setCompanyName(saved);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [user, userRole, userEmployee]);

  useEffect(() => {
    const handleFocus = () => fetchDashboardData();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, userRole, userEmployee]);

  function saveCompanyName() {
    localStorage.setItem('companyName', companyName);
    setIsEditingName(false);
  }

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const today = todayLocal();

      let billQuery = supabase
        .from('bills')
        .select('total_amount, credit_amount, bill_date, customer_id')
        .eq('is_voided', false);

      let recoveryQuery = supabase
        .from('recoveries')
        .select('amount, recovery_date, customer_id');

      if (userRole === 'employee' && userEmployee) {
        billQuery = billQuery.eq('employee_id', userEmployee.id);
        recoveryQuery = recoveryQuery.eq('employee_id', userEmployee.id);
      }

      const [billsResult, recoveriesResult] = await Promise.all([
        billQuery,
        recoveryQuery,
      ]);

      const { data: customersData } = await supabase
        .from('customers')
        .select('opening_balance, is_active')
        .eq('is_active', true);

      const bills = billsResult.data || [];
      const recoveries = recoveriesResult.data || [];

      const totalOpeningBalance = (customersData || []).reduce((sum, c) => sum + (c.opening_balance || 0), 0);
      const totalCredit = bills.reduce((sum, b) => sum + (b.credit_amount || 0), 0);
      const totalRecovery = recoveries.reduce((sum, r) => sum + (r.amount || 0), 0);
      const totalOutstanding = totalOpeningBalance + totalCredit - totalRecovery;

      const todayCredit = bills
        .filter((b) => b.bill_date === today)
        .reduce((sum, b) => sum + (b.credit_amount || 0), 0);

      const todayRecovery = recoveries
        .filter((r) => r.recovery_date === today)
        .reduce((sum, r) => sum + (r.amount || 0), 0);

      const todayCustomerIds = new Set<string>();
      bills.filter((b) => b.bill_date === today).forEach((b) => { if (b.customer_id) todayCustomerIds.add(b.customer_id); });
      recoveries.filter((r) => r.recovery_date === today).forEach((r) => { if (r.customer_id) todayCustomerIds.add(r.customer_id); });

      const custBalanceMap: Record<string, number> = {};
      (customersData || []).forEach((c: any) => { custBalanceMap[c.id] = c.opening_balance || 0; });

      const todayOutstanding = [...todayCustomerIds].reduce((sum, cid) => {
        const custCredit = bills.filter((b) => b.customer_id === cid).reduce((s, b) => s + (b.credit_amount || 0), 0);
        const custRecovery = recoveries.filter((r) => r.customer_id === cid).reduce((s, r) => s + (r.amount || 0), 0);
        return sum + Math.max(0, (custBalanceMap[cid] || 0) + custCredit - custRecovery);
      }, 0);

      setStats({
        totalCredit,
        totalRecovery,
        totalOutstanding,
        totalOpeningBalance,
        todayCredit,
        todayRecovery,
        todayOutstanding,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTodayRecoveryDrill(view: 'employee' | 'customer') {
    setDrillLoading(true);
    const today = todayLocal();
    const { data } = await supabase
      .from('recoveries')
      .select('amount, employee_id, customer_id')
      .eq('recovery_date', today);

    if (view === 'employee') {
      setDrillTitle("Today's Recovery - Employee Wise");
      const { data: emps } = await supabase.from('employees').select('id, name, employee_code');
      const empMap: Record<string, string> = {};
      (emps || []).forEach((e) => { empMap[e.id] = e.employee_code || e.name; });

      const grouped: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        const empName = empMap[r.employee_id] || 'Unknown';
        grouped[empName] = (grouped[empName] || 0) + r.amount;
      });

      setDrillData(
        Object.entries(grouped).map(([name, amount]) => ({ name, amount }))
      );
    } else {
      setDrillTitle("Today's Recovery - Customer Wise");
      const { data: custs } = await supabase.from('customers').select('id, name');
      const custMap: Record<string, string> = {};
      (custs || []).forEach((c) => { custMap[c.id] = c.name; });

      const grouped: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        const custName = custMap[r.customer_id] || 'Unknown';
        grouped[custName] = (grouped[custName] || 0) + r.amount;
      });

      setDrillData(
        Object.entries(grouped)
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount)
      );
    }
    setDrillLoading(false);
  }

  async function loadRoutesSummary() {
    setDrillLoading(true);
    try {
      const routesRes = await supabase.from('routes').select('id, name');
      const customersRes = await supabase.from('customers').select('id, name, route_id, opening_balance');
      const billsRes = await supabase.from('bills').select('customer_id, credit_amount').eq('is_voided', false);
      const recoveriesRes = await supabase.from('recoveries').select('customer_id, amount');

      const routes = routesRes.data || [];
      const customers = customersRes.data || [];
      const bills = billsRes.data || [];
      const recoveries = recoveriesRes.data || [];

      const creditMap: Record<string, number> = {};
      bills.forEach((b) => { creditMap[b.customer_id] = (creditMap[b.customer_id] || 0) + (b.credit_amount || 0); });
      const recoveryMap: Record<string, number> = {};
      recoveries.forEach((r) => { recoveryMap[r.customer_id] = (recoveryMap[r.customer_id] || 0) + r.amount; });

      const result: DrillRow[] = routes.map((r) => {
        const routeCustomers = customers.filter((c) => c.route_id === r.id);
        let total = 0;
        routeCustomers.forEach((c) => {
          const opening = c.opening_balance || 0;
          const credit = creditMap[c.id] || 0;
          const recovery = recoveryMap[c.id] || 0;
          total += opening + credit - recovery;
        });
        return { name: r.name, amount: total, sub: r.id };
      });

      setDrillData(result.sort((a, b) => b.amount - a.amount));
    } catch (e) {
      console.error('loadRoutesSummary error:', e);
      setDrillData([]);
    }
    setDrillLoading(false);
  }

  async function loadRouteCustomers(routeId: string) {
    setRouteDrillLoading(true);
    setSelectedRouteId(routeId);
    setRouteDrillPage(1);

    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, opening_balance')
      .eq('route_id', routeId)
      .eq('is_active', true);

    const { data: bills } = await supabase
      .from('bills')
      .select('customer_id, credit_amount')
      .eq('is_voided', false);

    const { data: recoveries } = await supabase
      .from('recoveries')
      .select('customer_id, amount');

    const creditMap: Record<string, number> = {};
    (bills || []).forEach((b) => {
      creditMap[b.customer_id] = (creditMap[b.customer_id] || 0) + (b.credit_amount || 0);
    });
    const recoveryMap: Record<string, number> = {};
    (recoveries || []).forEach((r) => {
      recoveryMap[r.customer_id] = (recoveryMap[r.customer_id] || 0) + r.amount;
    });

    setRouteDrillData(
      (customers || [])
        .map((c) => {
          const opening = c.opening_balance || 0;
          const credit = creditMap[c.id] || 0;
          const recovery = recoveryMap[c.id] || 0;
          return { name: c.name, amount: opening + credit - recovery };
        })
        .filter((r) => r.amount > 0)
        .sort((a, b) => b.amount - a.amount)
    );
    setRouteDrillLoading(false);
  }

  async function handleTileClick(tileKey: string) {
    setActiveTile(tileKey);
    setDrillLoading(true);
    setDrillData([]);
    setDrillPage(1);

    const today = todayLocal();

    if (tileKey === 'today-recovery') {
      setRecoveryView('employee');
      await loadTodayRecoveryDrill('employee');
      return;
    } else if (tileKey === 'today-credit') {
      setDrillTitle("Today's Credit - Customer Wise");
      const { data } = await supabase
        .from('bills')
        .select('credit_amount, customer_id')
        .eq('bill_date', today)
        .eq('is_voided', false);

      const { data: custs } = await supabase.from('customers').select('id, name');
      const custMap: Record<string, string> = {};
      (custs || []).forEach((c) => { custMap[c.id] = c.name; });

      const grouped: Record<string, number> = {};
      (data || []).forEach((b: any) => {
        const custName = custMap[b.customer_id] || 'Unknown';
        grouped[custName] = (grouped[custName] || 0) + (b.credit_amount || 0);
      });

      setDrillData(
        Object.entries(grouped)
          .filter(([, v]) => v > 0)
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount)
      );
    } else if (tileKey === 'total-credit') {
      setDrillTitle('Total Credit - Customer Wise');
      const { data } = await supabase
        .from('bills')
        .select('credit_amount, customer_id')
        .eq('is_voided', false);

      const { data: custs } = await supabase.from('customers').select('id, name');
      const custMap: Record<string, string> = {};
      (custs || []).forEach((c) => { custMap[c.id] = c.name; });

      const grouped: Record<string, number> = {};
      (data || []).forEach((b: any) => {
        const custName = custMap[b.customer_id] || 'Unknown';
        grouped[custName] = (grouped[custName] || 0) + (b.credit_amount || 0);
      });

      setDrillData(
        Object.entries(grouped)
          .filter(([, v]) => v > 0)
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount)
      );
    } else if (tileKey === 'total-recovery') {
      setDrillTitle('Total Recovery - Employee Wise');
      const { data } = await supabase
        .from('recoveries')
        .select('amount, employee_id');

      const { data: emps } = await supabase.from('employees').select('id, name, employee_code');
      const empMap: Record<string, string> = {};
      (emps || []).forEach((e) => { empMap[e.id] = e.employee_code || e.name; });

      const grouped: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        const empName = empMap[r.employee_id] || 'Unknown';
        grouped[empName] = (grouped[empName] || 0) + r.amount;
      });

      setDrillData(
        Object.entries(grouped).map(([name, amount]) => ({ name, amount }))
      );
    } else if (tileKey === 'outstanding') {
      setDrillTitle('Outstanding - Customer Wise');
      const { data: bills } = await supabase
        .from('bills')
        .select('customer_id, credit_amount')
        .eq('is_voided', false);
      const { data: recoveries } = await supabase
        .from('recoveries')
        .select('customer_id, amount');

      const creditMap: Record<string, number> = {};
      (bills || []).forEach((b) => {
        creditMap[b.customer_id] = (creditMap[b.customer_id] || 0) + (b.credit_amount || 0);
      });
      const recoveryMap: Record<string, number> = {};
      (recoveries || []).forEach((r) => {
        recoveryMap[r.customer_id] = (recoveryMap[r.customer_id] || 0) + r.amount;
      });

      const { data: customers } = await supabase.from('customers').select('id, name, opening_balance');
      const custMap: Record<string, { name: string; opening_balance: number }> = {};
      (customers || []).forEach((c) => { custMap[c.id] = { name: c.name, opening_balance: c.opening_balance || 0 }; });

      const allIds = [...new Set([...Object.keys(creditMap), ...Object.keys(recoveryMap), ...Object.keys(custMap)])];
      setDrillData(
        allIds
          .map((id) => ({
            name: custMap[id]?.name || 'Unknown',
            amount: Math.max(0, (custMap[id]?.opening_balance || 0) + (creditMap[id] || 0) - (recoveryMap[id] || 0)),
          }))
          .filter((r) => r.amount > 0)
          .sort((a, b) => b.amount - a.amount)
      );
    } else if (tileKey === 'today-outstanding') {
      setDrillTitle("Today's Outstanding - Customer Wise");

      const { data: todayBills } = await supabase
        .from('bills')
        .select('customer_id')
        .eq('bill_date', today)
        .eq('is_voided', false);
      const { data: todayRecoveries } = await supabase
        .from('recoveries')
        .select('customer_id')
        .eq('recovery_date', today);

      const activeIds = [...new Set([
        ...(todayBills || []).map((b: any) => b.customer_id),
        ...(todayRecoveries || []).map((r: any) => r.customer_id),
      ])].filter(Boolean);

      if (activeIds.length === 0) {
        setDrillData([]);
      } else {
        const { data: allBills } = await supabase
          .from('bills')
          .select('customer_id, credit_amount')
          .eq('is_voided', false)
          .in('customer_id', activeIds);
        const { data: allRecoveries } = await supabase
          .from('recoveries')
          .select('customer_id, amount')
          .in('customer_id', activeIds);

        const creditMap: Record<string, number> = {};
        (allBills || []).forEach((b: any) => {
          creditMap[b.customer_id] = (creditMap[b.customer_id] || 0) + (b.credit_amount || 0);
        });
        const recoveryMap: Record<string, number> = {};
        (allRecoveries || []).forEach((r: any) => {
          recoveryMap[r.customer_id] = (recoveryMap[r.customer_id] || 0) + r.amount;
        });

        const { data: customers } = await supabase.from('customers').select('id, name, opening_balance').in('id', activeIds);
        const custMap: Record<string, { name: string; opening_balance: number }> = {};
        (customers || []).forEach((c) => { custMap[c.id] = { name: c.name, opening_balance: c.opening_balance || 0 }; });

        setDrillData(
          activeIds
            .map((id) => ({
              name: custMap[id]?.name || 'Unknown',
              amount: Math.max(0, (custMap[id]?.opening_balance || 0) + (creditMap[id] || 0) - (recoveryMap[id] || 0)),
            }))
            .filter((r) => r.amount > 0)
            .sort((a, b) => b.amount - a.amount)
        );
      }
    } else if (tileKey === 'opening-balance') {
      setDrillTitle('Opening Balance - Customer Wise');
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, opening_balance')
        .eq('is_active', true);

      setDrillData(
        (customers || [])
          .filter((c) => (c.opening_balance || 0) > 0)
          .map((c) => ({ name: c.name, amount: c.opening_balance || 0 }))
          .sort((a, b) => b.amount - a.amount)
      );
    } else if (tileKey === 'routes') {
      setDrillTitle('Routes - Summary');
      setSelectedRouteId(null);
      await loadRoutesSummary();
      return;
    }

    setDrillLoading(false);
  }

  const topCards = [
    { key: 'total-credit', title: 'Total Credit', value: stats.totalCredit, icon: CreditCard, color: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-900', iconBg: 'bg-blue-100 dark:bg-blue-900/30' },
    { key: 'total-recovery', title: 'Total Recovery', value: stats.totalRecovery, icon: CircleDollarSign, color: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-900', iconBg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    { key: 'outstanding', title: 'Outstanding', value: stats.totalOutstanding, icon: AlertCircle, color: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-900', iconBg: 'bg-amber-100 dark:bg-amber-900/30' },
    { key: 'opening-balance', title: 'Opening Balance', value: stats.totalOpeningBalance, icon: Wallet, color: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-900', iconBg: 'bg-purple-100 dark:bg-purple-900/30' },
  ];

  const bottomCards = [
    { key: 'today-credit', title: "Today's Credit", value: stats.todayCredit, icon: TrendingUp, color: 'text-rose-600 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-900', iconBg: 'bg-rose-100 dark:bg-rose-900/30' },
    { key: 'today-recovery', title: "Today's Recovery", value: stats.todayRecovery, icon: TrendingDown, color: 'text-sky-600 dark:text-sky-400', border: 'border-sky-200 dark:border-sky-900', iconBg: 'bg-sky-100 dark:bg-sky-900/30' },
    { key: 'today-outstanding', title: "Today's Outstanding", value: stats.todayOutstanding, icon: ArrowDownRight, color: 'text-violet-600 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-900', iconBg: 'bg-violet-100 dark:bg-violet-900/30' },
    { key: 'routes', title: 'Routes', value: 0, icon: MapPin, color: 'text-teal-600 dark:text-teal-400', border: 'border-teal-200 dark:border-teal-900', iconBg: 'bg-teal-100 dark:bg-teal-900/30', isRoutes: true },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  function renderCard(card: typeof topCards[0]) {
    const Icon = card.icon;
    return (
      <button
        key={card.key}
        onClick={() => handleTileClick(card.key)}
        className={cn(
          "rounded-xl border p-5 transition-all text-left w-full",
          "bg-white dark:bg-slate-900",
          "hover:shadow-md hover:scale-[1.01] cursor-pointer",
          card.border,
          activeTile === card.key && "ring-2 ring-blue-500 dark:ring-blue-400"
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {card.title}
          </span>
          <div className={cn("p-2 rounded-lg", card.iconBg)}>
            <Icon className={cn("h-4 w-4", card.color)} />
          </div>
        </div>
        <p className={cn("text-2xl font-bold", card.color)}>
          {(card as any).isRoutes ? 'View Summary' : formatCurrency(card.value)}
        </p>
      </button>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/Logo.png" alt="Logo" className="h-14 w-14 rounded-xl object-contain bg-white p-1" />
          <div>
            <h1 className="text-xl font-bold text-white">ABWA Traders</h1>
            <p className="text-xs text-white/70">Distribution & Credit Management System</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditingName ? (
            <>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="text-sm font-medium outline-none border-b border-white/50 bg-transparent text-white w-48"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && saveCompanyName()}
              />
              <button onClick={saveCompanyName} className="text-white/80 hover:text-white">
                <Check className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button onClick={() => setIsEditingName(true)} className="text-white/50 hover:text-white">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {topCards.map(renderCard)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {bottomCards.map(renderCard)}
      </div>

      {/* Drill-down panel */}
      {activeTile && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{drillTitle}</h2>
              {activeTile === 'today-recovery' && (
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
                  <button
                    onClick={() => { setRecoveryView('employee'); loadTodayRecoveryDrill('employee'); }}
                    className={cn(
                      "px-3 py-1 text-xs font-medium transition-colors",
                      recoveryView === 'employee'
                        ? "bg-blue-600 text-white"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                    )}
                  >Employee</button>
                  <button
                    onClick={() => { setRecoveryView('customer'); loadTodayRecoveryDrill('customer'); }}
                    className={cn(
                      "px-3 py-1 text-xs font-medium transition-colors",
                      recoveryView === 'customer'
                        ? "bg-blue-600 text-white"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                    )}
                  >Customer</button>
                </div>
              )}
            </div>
            <button
              onClick={() => { setActiveTile(null); setSelectedRouteId(null); setRouteDrillData([]); }}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>

          {drillLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : activeTile === 'routes' ? (
            <div>
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                <select
                  value={selectedRouteId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) loadRouteCustomers(val);
                    else setSelectedRouteId(null);
                  }}
                  className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-sm w-full max-w-md"
                >
                  <option value="">Select a route...</option>
                  {(drillData || []).map((route, i) => (
                    <option key={i} value={route.sub}>
                      {route.name} — {formatCurrency(route.amount)}
                    </option>
                  ))}
                </select>
              </div>
              {selectedRouteId && (
                <div className="overflow-x-auto">
                  {routeDrillLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                  ) : routeDrillData.length === 0 ? (
                    <p className="text-center py-8 text-sm text-slate-500">No customers with outstanding</p>
                  ) : (
                    (() => {
                      const rTotal = Math.ceil(routeDrillData.length / PAGE_SIZE);
                      const rStart = (routeDrillPage - 1) * PAGE_SIZE;
                      const rPageData = routeDrillData.slice(rStart, rStart + PAGE_SIZE);
                      return (
                        <>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                <th className="px-5 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">#</th>
                                <th className="px-5 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Customer</th>
                                <th className="px-5 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Outstanding</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rPageData.map((row, i) => (
                                <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                  <td className="px-5 py-2.5 text-slate-500">{rStart + i + 1}</td>
                                  <td className="px-5 py-2.5 text-slate-900 dark:text-slate-100 font-medium">{row.name}</td>
                                  <td className="px-5 py-2.5 text-right font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(row.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {routeDrillData.length > PAGE_SIZE && (
                            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-700">
                              <span className="text-xs text-slate-500">Showing {rStart + 1}–{Math.min(rStart + PAGE_SIZE, routeDrillData.length)} of {routeDrillData.length}</span>
                              <div className="flex items-center gap-1">
                                <button onClick={() => setRouteDrillPage((p) => Math.max(1, p - 1))} disabled={routeDrillPage === 1} className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"><ChevronLeft className="h-4 w-4" /></button>
                                {Array.from({ length: rTotal }, (_, i) => i + 1).filter((p) => p === 1 || p === rTotal || Math.abs(p - routeDrillPage) <= 2).reduce<(number | string)[]>((acc, p, i, arr) => { if (i > 0 && typeof arr[i - 1] === 'number' && p - (arr[i - 1] as number) > 1) acc.push('...'); acc.push(p); return acc; }, []).map((p, i) => typeof p === 'string' ? <span key={`dots-${i}`} className="px-1 text-slate-400">...</span> : <button key={p} onClick={() => setRouteDrillPage(p)} className={cn('px-3 py-1 text-xs font-medium rounded-lg border', routeDrillPage === p ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800')}>{p}</button>)}
                                <button onClick={() => setRouteDrillPage((p) => Math.min(rTotal, p + 1))} disabled={routeDrillPage === rTotal} className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"><ChevronRight className="h-4 w-4" /></button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()
                  )}
                </div>
              )}
            </div>
          ) : drillData.length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-500">No data found</p>
          ) : (
            (() => {
              const gTotal = Math.ceil(drillData.length / PAGE_SIZE);
              const gStart = (drillPage - 1) * PAGE_SIZE;
              const gPageData = drillData.slice(gStart, gStart + PAGE_SIZE);
              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                          <th className="px-5 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">#</th>
                          <th className="px-5 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Name</th>
                          <th className="px-5 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gPageData.map((row, i) => (
                          <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-5 py-2.5 text-slate-500">{gStart + i + 1}</td>
                            <td className="px-5 py-2.5 text-slate-900 dark:text-slate-100 font-medium">{row.name}</td>
                            <td className="px-5 py-2.5 text-right font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {drillData.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-xs text-slate-500">Showing {gStart + 1}–{Math.min(gStart + PAGE_SIZE, drillData.length)} of {drillData.length}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDrillPage((p) => Math.max(1, p - 1))} disabled={drillPage === 1} className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"><ChevronLeft className="h-4 w-4" /></button>
                        {Array.from({ length: gTotal }, (_, i) => i + 1).filter((p) => p === 1 || p === gTotal || Math.abs(p - drillPage) <= 2).reduce<(number | string)[]>((acc, p, i, arr) => { if (i > 0 && typeof arr[i - 1] === 'number' && p - (arr[i - 1] as number) > 1) acc.push('...'); acc.push(p); return acc; }, []).map((p, i) => typeof p === 'string' ? <span key={`dots-${i}`} className="px-1 text-slate-400">...</span> : <button key={p} onClick={() => setDrillPage(p)} className={cn('px-3 py-1 text-xs font-medium rounded-lg border', drillPage === p ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800')}>{p}</button>)}
                        <button onClick={() => setDrillPage((p) => Math.min(gTotal, p + 1))} disabled={drillPage === gTotal} className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"><ChevronRight className="h-4 w-4" /></button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}
