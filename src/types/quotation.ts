export type QuotationStatus = 'draft' | 'deposit' | 'pending' | 'completed' | 'cancelled';
export type DeliveryStatus = '' | 'preparing' | 'assembling' | 'testing' | 'ready' | 'shipped' | 'delivered';

export interface Quotation {
  id: number;
  quotation_no: string;
  customer_id: number | null;
  customer_name: string;
  status: QuotationStatus;
  deposit: number;
  service_fee: number;
  total_cost: number;
  total_price: number;
  note: string;
  item_title: string;
  demand_area: string;
  ship_date: string;
  delivery_status: DeliveryStatus;
  created_at: string;
  updated_at: string;
  items?: QuotationItem[];
  images?: QuotationImage[];
}

export interface QuotationItem {
  id: number;
  quotation_id: number;
  category: string;
  name: string;
  spec: string;
  cost: number;
  price: number;
  quantity: number;
  inventory_id?: number | null;
}

export interface QuotationImage {
  id: number;
  quotation_id: number;
  filename: string;
  original_name: string;
  created_at: string;
}

