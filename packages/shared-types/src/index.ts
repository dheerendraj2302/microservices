export interface Product {
  id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
}

export interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: number;
  customer_id: number;
  status: "placed" | "processing" | "shipped" | "delivered" | "cancelled";
  total: number;
  created_at: string;
  items: OrderItem[];
}

export interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  created_at: string;
}

export interface CustomerSummary {
  customer: Customer;
  orders: Order[];
  orderSummary: {
    available: boolean;
    count: number;
    totalSpent: number | null;
  };
  degraded?: boolean;
  warning?: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total?: number;
  pages?: number;
}
