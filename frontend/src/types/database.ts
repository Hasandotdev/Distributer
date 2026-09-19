export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type PaymentStatus = 'cash' | 'credit' | 'partial'

// ============================================
// Table Row Types
// ============================================

export interface Route {
  id: string
  name: string
  created_at: string
}

export interface Employee {
  id: string
  name: string
  phone: string | null
  employee_code: string | null
  route_id: string | null
  auth_user_id: string | null
  is_active: boolean
  created_at: string
}

export interface Customer {
  id: string
  shop_code: string | null
  name: string
  address: string | null
  phone: string | null
  route_id: string | null
  opening_balance: number
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  name: string
  unit: string
  rate: number
  is_active: boolean
  created_at: string
}

export interface Bill {
  id: string
  bill_number: string
  customer_id: string | null
  employee_id: string | null
  bill_date: string
  total_amount: number
  paid_amount: number
  credit_amount: number
  payment_status: PaymentStatus
  notes: string | null
  is_voided: boolean
  created_at: string
}

export interface Recovery {
  id: string
  customer_id: string | null
  employee_id: string | null
  amount: number
  recovery_date: string
  notes: string | null
  created_at: string
}

// ============================================
// Insert Types
// ============================================

export type RouteInsert = Omit<Route, 'id' | 'created_at'>

export type EmployeeInsert = Omit<Employee, 'id' | 'created_at'>

export type CustomerInsert = Omit<Customer, 'id' | 'created_at'>

export type ProductInsert = Omit<Product, 'id' | 'created_at'>

export type BillInsert = Omit<Bill, 'id' | 'created_at' | 'credit_amount'>

export type RecoveryInsert = Omit<Recovery, 'id' | 'created_at'>

// ============================================
// Update Types
// ============================================

export type RouteUpdate = Partial<Omit<Route, 'id' | 'created_at'>>

export type EmployeeUpdate = Partial<Omit<Employee, 'id' | 'created_at'>>

export type CustomerUpdate = Partial<Omit<Customer, 'id' | 'created_at'>>

export type ProductUpdate = Partial<Omit<Product, 'id' | 'created_at'>>

export type BillUpdate = Partial<Omit<Bill, 'id' | 'created_at' | 'credit_amount'>>

export type RecoveryUpdate = Partial<Omit<Recovery, 'id' | 'created_at'>>

// ============================================
// Database Type (Supabase Generated Style)
// ============================================

export interface Database {
  public: {
    Tables: {
      routes: {
        Row: Route
        Insert: RouteInsert
        Update: RouteUpdate
      }
      employees: {
        Row: Employee
        Insert: EmployeeInsert
        Update: EmployeeUpdate
      }
      customers: {
        Row: Customer
        Insert: CustomerInsert
        Update: CustomerUpdate
      }
      products: {
        Row: Product
        Insert: ProductInsert
        Update: ProductUpdate
      }
      bills: {
        Row: Bill
        Insert: BillInsert
        Update: BillUpdate
      }
      recoveries: {
        Row: Recovery
        Insert: RecoveryInsert
        Update: RecoveryUpdate
      }
    }
    Functions: {
      get_user_role: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_user_route_ids: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      generate_bill_number: {
        Args: Record<string, never>
        Returns: string
      }
    }
  }
}
