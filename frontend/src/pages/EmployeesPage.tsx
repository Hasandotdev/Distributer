import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import DetailModal from '@/components/DetailModal';
import { Plus, Edit, UserX, UserCheck, X } from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  phone: string;
  employee_code: string;
  route_names: string[];
  is_active: boolean;
}

interface Route {
  id: string;
  name: string;
}

interface EmployeeFormData {
  name: string;
  phone: string;
  employee_code: string;
  selectedRoutes: string[];
  is_active: boolean;
  create_auth_user: boolean;
  email: string;
  password: string;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detailModal, setDetailModal] = useState<{ type: 'shop' | 'employee'; id: string; name: string } | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>({
    name: '',
    phone: '',
    employee_code: '',
    selectedRoutes: [],
    is_active: true,
    create_auth_user: false,
    email: '',
    password: '',
  });

  useEffect(() => {
    fetchEmployees();
    fetchRoutes();
  }, []);

  async function fetchEmployees() {
    setLoading(true);

    const { data: empData, error } = await supabase
      .from('employees')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching employees:', error);
    } else {
      const empIds = (empData || []).map((e) => e.id);

      const routeMap: Record<string, string[]> = {};

      if (empIds.length > 0) {
        const { data: erData, error: erError } = await supabase
          .from('employee_routes')
          .select('employee_id, route_id')
          .in('employee_id', empIds);

        if (!erError && erData && erData.length > 0) {
          const routeIds = [...new Set(erData.map((er) => er.route_id))];
          const { data: routeData } = await supabase
            .from('routes')
            .select('id, name')
            .in('id', routeIds);

          const routeNameMap: Record<string, string> = {};
          (routeData || []).forEach((r: any) => {
            routeNameMap[r.id] = r.name;
          });

          erData.forEach((er: any) => {
            if (!routeMap[er.employee_id]) routeMap[er.employee_id] = [];
            const name = routeNameMap[er.route_id];
            if (name) routeMap[er.employee_id].push(name);
          });
        }
      }

      setEmployees(
        (empData || []).map((e) => ({
          ...e,
          route_names: routeMap[e.id] || [],
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

    let authUserId = null;

    if (formData.create_auth_user && formData.email && formData.password) {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) {
        console.error('Error creating auth user:', authError);
        alert(`Could not create login account: ${authError.message}. Employee will be saved without a login account.`);
      } else {
        authUserId = authData.user?.id;
      }
    }

    const employeeData = {
      name: formData.name,
      phone: formData.phone,
      employee_code: formData.employee_code,
      is_active: formData.is_active,
      auth_user_id: authUserId,
    };

    let empId: string | null = null;

    if (editingEmployee) {
      const { error } = await supabase
        .from('employees')
        .update(employeeData)
        .eq('id', editingEmployee.id);

      if (error) {
        console.error('Error saving employee:', error);
        alert('Error saving employee');
        setSubmitting(false);
        return;
      }
      empId = editingEmployee.id;
    } else {
      if (!formData.employee_code) {
        alert('Employee Code is required');
        setSubmitting(false);
        return;
      }
      const { data, error } = await supabase
        .from('employees')
        .insert({ ...employeeData, id: formData.employee_code })
        .select('id')
        .single();

      if (error) {
        console.error('Error saving employee:', error);
        alert('Error saving employee');
        setSubmitting(false);
        return;
      }
      empId = data.id;
    }

    if (empId) {
      await supabase.from('employee_routes').delete().eq('employee_id', empId);

      if (formData.selectedRoutes.length > 0) {
        const inserts = formData.selectedRoutes.map((routeId) => ({
          employee_id: empId,
          route_id: routeId,
        }));
        await supabase.from('employee_routes').insert(inserts);
      }
    }

    setShowForm(false);
    setEditingEmployee(null);
    resetForm();
    fetchEmployees();
    setSubmitting(false);
  }

  function resetForm() {
    setFormData({
      name: '',
      phone: '',
      employee_code: '',
      selectedRoutes: [],
      is_active: true,
      create_auth_user: false,
      email: '',
      password: '',
    });
  }

  async function openEditForm(employee: Employee) {
    setEditingEmployee(employee);

    const { data: erData } = await supabase
      .from('employee_routes')
      .select('route_id')
      .eq('employee_id', employee.id);

    setFormData({
      name: employee.name,
      phone: employee.phone || '',
      employee_code: employee.employee_code || '',
      selectedRoutes: (erData || []).map((er) => er.route_id),
      is_active: employee.is_active,
      create_auth_user: false,
      email: '',
      password: '',
    });
    setShowForm(true);
  }

  async function handleToggleStatus(employee: Employee) {
    const { error } = await supabase
      .from('employees')
      .update({ is_active: !employee.is_active })
      .eq('id', employee.id);

    if (error) {
      console.error('Error toggling employee status:', error);
    } else {
      fetchEmployees();
    }
  }

  function toggleRoute(routeId: string) {
    setFormData((prev) => {
      const exists = prev.selectedRoutes.includes(routeId);
      return {
        ...prev,
        selectedRoutes: exists
          ? prev.selectedRoutes.filter((id) => id !== routeId)
          : [...prev.selectedRoutes, routeId],
      };
    });
  }

  const columns = [
    {
      key: 'employee_code',
      header: 'ID',
      render: (value: string) => (
        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{value || '—'}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (value: string, row: Employee) => (
        <button
          onClick={() => setDetailModal({ type: 'employee', id: row.id, name: value })}
          className="text-blue-600 hover:underline font-medium"
        >
          {value}
        </button>
      ),
    },
    { key: 'phone', header: 'Phone' },
    {
      key: 'route_names',
      header: 'Assigned Routes',
      render: (value: string[]) => (
        <div className="flex flex-wrap gap-1">
          {value && value.length > 0 ? (
            value.map((name, i) => (
              <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                {name}
              </span>
            ))
          ) : (
            <span className="text-gray-400">No routes</span>
          )}
        </div>
      ),
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
    {
      key: 'actions',
      header: '',
      render: (_: any, row: Employee) => (
        <div className="flex gap-2">
          <button
            onClick={() => openEditForm(row)}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
          >
            <Edit className="h-4 w-4 text-gray-600" />
          </button>
          <button
            onClick={() => handleToggleStatus(row)}
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
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Employees</h1>
        <button
          onClick={() => {
            resetForm();
            setEditingEmployee(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Employee
        </button>
      </div>

      <DataTable
        columns={columns}
        data={employees}
        loading={loading}
        emptyMessage="No employees found"
      />

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingEmployee(null);
        }}
        title={editingEmployee ? 'Edit Employee' : 'Add Employee'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Employee ID</label>
              <input
                type="text"
                value={formData.employee_code}
                onChange={(e) =>
                  setFormData({ ...formData, employee_code: e.target.value })
                }
                placeholder="e.g. DSR-1"
                required
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
          </div>

          <div>
              <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
              Assigned Routes
            </label>
            <div className="flex flex-wrap gap-2">
              {routes.map((route) => {
                const isSelected = formData.selectedRoutes.includes(route.id);
                return (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => toggleRoute(route.id)}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-lg border transition',
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    {route.name}
                  </button>
                );
              })}
              {routes.length === 0 && (
                <p className="text-sm text-gray-500">No routes available. Create routes first.</p>
              )}
            </div>
            {formData.selectedRoutes.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {formData.selectedRoutes.length} route(s) selected
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
              className="rounded"
            />
            <label htmlFor="is_active" className="text-sm font-medium">
              Active
            </label>
          </div>

          {!editingEmployee && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="create_auth"
                  checked={formData.create_auth_user}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      create_auth_user: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                <label htmlFor="create_auth" className="text-sm font-medium">
                  Create login account for this employee
                </label>
              </div>

              {formData.create_auth_user && (
                <div className="grid grid-cols-2 gap-4 ml-6">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      required={formData.create_auth_user}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      required={formData.create_auth_user}
                      minLength={6}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingEmployee(null);
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
              {submitting
                ? 'Saving...'
                : editingEmployee
                ? 'Update'
                : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

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
