import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { X, Loader2 } from 'lucide-react';

interface DetailModalProps {
  type: 'shop' | 'employee';
  id: string;
  name: string;
  onClose: () => void;
}

interface ShopDetail {
  name: string;
  phone: string;
  route_name: string;
  total_credit: number;
  total_recovery: number;
  outstanding: number;
  bills: { bill_number: string; credit_amount: number; bill_date: string }[];
}

interface EmployeeDetail {
  name: string;
  phone: string;
  routes: string[];
  total_bills: number;
  total_credit: number;
  total_recovery: number;
  shops: { name: string; credit: number; recovery: number }[];
}

export default function DetailModal({ type, id, name, onClose }: DetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [shopDetail, setShopDetail] = useState<ShopDetail | null>(null);
  const [employeeDetail, setEmployeeDetail] = useState<EmployeeDetail | null>(null);

  useEffect(() => {
    fetchDetails();
  }, [id, type]);

  async function fetchDetails() {
    setLoading(true);
    if (type === 'shop') {
      await fetchShopDetails();
    } else {
      await fetchEmployeeDetails();
    }
    setLoading(false);
  }

  async function fetchShopDetails() {
    const { data: custData } = await supabase
      .from('customers')
      .select('name, phone, route_id')
      .eq('id', id)
      .single();

    const { data: routeData } = custData?.route_id
      ? await supabase.from('routes').select('name').eq('id', custData.route_id).single()
      : { data: null };

    const { data: bills } = await supabase
      .from('bills')
      .select('bill_number, credit_amount, bill_date')
      .eq('customer_id', id)
      .eq('is_voided', false)
      .order('bill_date', { ascending: false });

    const { data: recoveries } = await supabase
      .from('recoveries')
      .select('amount')
      .eq('customer_id', id);

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
  }

  async function fetchEmployeeDetails() {
    const { data: empData } = await supabase
      .from('employees')
      .select('name, phone, employee_code')
      .eq('id', id)
      .single();

    const { data: empRoutes } = await supabase
      .from('employee_routes')
      .select('route:routes(name)')
      .eq('employee_id', id);

    const routeNames = (empRoutes || []).map((er: any) => er.route?.name).filter(Boolean);

    const { data: bills } = await supabase
      .from('bills')
      .select('customer_id, credit_amount')
      .eq('employee_id', id)
      .eq('is_voided', false);

    const { data: recoveries } = await supabase
      .from('recoveries')
      .select('customer_id, amount')
      .eq('employee_id', id);

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
      name: (empData?.employee_code || empData?.name || name) + (empData?.employee_code ? ` (${empData.name})` : ''),
      phone: empData?.phone || 'N/A',
      routes: routeNames,
      total_bills: (bills || []).length,
      total_credit: totalCredit,
      total_recovery: totalRecovery,
      shops: allCustIds.map((cid) => ({
        name: custMap[cid] || 'N/A',
        credit: creditMap[cid] || 0,
        recovery: recoveryMap[cid] || 0,
      })),
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-auto shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {type === 'shop' ? 'Shop Details' : 'Employee Details'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!loading && type === 'shop' && shopDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500">Name</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{shopDetail.name}</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500">Phone</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{shopDetail.phone}</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500">Route</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{shopDetail.route_name}</p>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <p className="text-xs text-slate-500">Outstanding</p>
                  <p className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(shopDetail.outstanding)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-xs text-slate-500">Total Credit</p>
                  <p className="font-bold text-red-600 dark:text-red-400">{formatCurrency(shopDetail.total_credit)}</p>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <p className="text-xs text-slate-500">Total Recovery</p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(shopDetail.total_recovery)}</p>
                </div>
              </div>
              {shopDetail.bills.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2 text-slate-900 dark:text-slate-100">Bills</h3>
                  <table className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-600 dark:text-slate-400">Bill No</th>
                        <th className="px-3 py-2 text-left text-slate-600 dark:text-slate-400">Credit</th>
                        <th className="px-3 py-2 text-left text-slate-600 dark:text-slate-400">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shopDetail.bills.map((b, i) => (
                        <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                          <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{b.bill_number}</td>
                          <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{formatCurrency(b.credit_amount)}</td>
                          <td className="px-3 py-2 text-slate-500">{formatDate(b.bill_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!loading && type === 'employee' && employeeDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500">Name</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{employeeDetail.name}</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500">Phone</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{employeeDetail.phone}</p>
                </div>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Assigned Routes</p>
                <div className="flex flex-wrap gap-1">
                  {employeeDetail.routes.map((r, i) => (
                    <span key={i} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500">Total Bills</p>
                  <p className="font-bold text-slate-900 dark:text-slate-100">{employeeDetail.total_bills}</p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-xs text-slate-500">Total Credit</p>
                  <p className="font-bold text-red-600 dark:text-red-400">{formatCurrency(employeeDetail.total_credit)}</p>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <p className="text-xs text-slate-500">Total Recovery</p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(employeeDetail.total_recovery)}</p>
                </div>
              </div>
              {employeeDetail.shops.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2 text-slate-900 dark:text-slate-100">Shops</h3>
                  <table className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-600 dark:text-slate-400">Shop Name</th>
                        <th className="px-3 py-2 text-left text-slate-600 dark:text-slate-400">Credit</th>
                        <th className="px-3 py-2 text-left text-slate-600 dark:text-slate-400">Recovery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeDetail.shops.map((s, i) => (
                        <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                          <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{s.name}</td>
                          <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{formatCurrency(s.credit)}</td>
                          <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{formatCurrency(s.recovery)}</td>
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
  );
}
