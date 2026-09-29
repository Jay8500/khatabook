export type Fulfilment = 'pickup' | 'delivery';
export type PaymentMode = 'full' | 'advance' | 'cod';
export type OrderStatus = 'requested' | 'accepted' | 'packed' | 'ready' | 'completed' | 'rejected' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'pending_verification' | 'partially_paid' | 'paid';

/** Public store info from store_get. */
export interface StoreShop {
  id: string;
  name: string;
  slug: string;
  store_enabled: boolean;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  delivery_charge: number;
  delivery_note: string | null;
  min_order_amount: number;
  store_note: string | null;
  address: string | null;
  contact_phone: string | null;
}

export interface StoreItem {
  id: string;
  name: string;
  unit: string | null;
  price: number;
  category: string | null;
  description: string | null;
  image_url: string | null;
  available: number;
}

export interface Store {
  shop: StoreShop;
  items: StoreItem[];
}

export interface Order {
  id: string;
  shop_id: string;
  customer_id: string;
  order_no: number;
  status: OrderStatus;
  fulfilment: Fulfilment;
  delivery_address: string | null;
  customer_note: string | null;
  subtotal: number;
  delivery_charge: number;
  total: number;
  payment_mode: PaymentMode | null;
  amount_due_now: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  stock_id: string | null;
  product_name: string;
  unit: string | null;
  image_url: string | null;
  price: number;
  qty_requested: number;
  qty_accepted: number | null;
}

export interface OrderEvent {
  id: string;
  status: OrderStatus | null;
  remark: string | null;
  actor_role: 'customer' | 'shop' | 'system';
  created_at: string;
}

export interface OrderDetail {
  order: Order;
  items: OrderItem[];
  events: OrderEvent[];
  shop: {
    id: string;
    name: string;
    slug: string;
    upi_id: string | null;
    upi_name: string | null;
    contact_phone: string | null;
    address: string | null;
    default_payment_mode: PaymentMode;
    default_advance_percent: number;
  };
  customer: { name: string | null; phone: string | null };
  viewer: 'customer' | 'shop';
}
