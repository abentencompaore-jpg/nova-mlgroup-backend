// ============================================================
// types/index.ts
// Types TypeScript partagés dans toute l'application mobile
// ============================================================

export type ConversationStatus = 'new' | 'in_progress' | 'awaiting_payment' | 'delivered' | 'disputed';
export type OrderStatus = 'pending' | 'payment_received' | 'validated' | 'delivered' | 'disputed' | 'cancelled';
export type AccountStatus = 'available' | 'assigned' | 'expired';

export interface Client {
  id: string;
  whatsapp_phone: string;
  display_name: string | null;
  total_orders: number;
  total_spent: number;
  created_at: string;
  last_seen_at: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  price_fcfa: number;
  duration_unit: string;
  description: string | null;
  is_active: boolean;
}

export interface Account {
  id: string;
  service_id: string;
  email: string;
  password_enc: string;
  duration_months: number | null;
  expires_at: string | null;
  status: AccountStatus;
  client_id: string | null;
  order_id: string | null;
  assigned_at: string | null;
  created_at: string;
  // Relations jointes
  services?: Service;
  clients?: Client;
}

export interface Order {
  id: string;
  client_id: string;
  service_id: string;
  account_id: string | null;
  duration_months: number;
  amount_fcfa: number;
  status: OrderStatus;
  created_at: string;
  validated_at: string | null;
  delivered_at: string | null;
  // Relations jointes
  clients?: Client;
  services?: Service;
}

export interface Message {
  role: 'user' | 'bot';
  content: string;
  type: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  client_id: string;
  status: ConversationStatus;
  current_order_id: string | null;
  messages: Message[];
  is_admin_takeover: boolean;
  last_message_at: string;
  created_at: string;
  // Relations jointes
  clients?: Client;
  orders?: Order;
}

export interface Payment {
  id: string;
  order_id: string;
  client_id: string;
  amount_fcfa: number;
  payment_method: string;
  proof_value: string | null;
  proof_type: 'transaction_code' | 'screenshot_url' | null;
  status: 'pending' | 'validated' | 'rejected';
  validated_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface TreasurySummary {
  service_name: string;
  revenue: number;
  count: number;
}
