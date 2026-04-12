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
  qc_data: string;
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
}

export interface QuotationImage {
  id: number;
  quotation_id: number;
  filename: string;
  original_name: string;
  created_at: string;
}

export interface CreateQuotationInput {
  customer_id?: number | null;
  customer_name?: string;
  items?: Omit<QuotationItem, 'id' | 'quotation_id'>[];
  deposit?: number;
  service_fee?: number;
  note?: string;
  item_title?: string;
  demand_area?: string;
  ship_date?: string;
  delivery_status?: DeliveryStatus;
  qc_data?: Record<string, boolean>;
}

export interface UpdateQuotationInput extends CreateQuotationInput {
  status?: QuotationStatus;
}

export interface QuotationStatsSummary {
  status: QuotationStatus;
  count: number;
  revenue: number;
  profit: number;
  deposits: number;
}
