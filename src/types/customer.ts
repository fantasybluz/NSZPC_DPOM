export type CustomerSource = 'YouTube' | 'Instagram' | 'Line' | '門市' | '朋友介紹' | '其他' | '';

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  source: CustomerSource;
  city: string;
  district: string;
  address: string;
  note: string;
  created_at: string;
  updated_at: string;
  services?: ServiceRecord[];
  quotations?: CustomerQuotation[];
}

export interface ServiceRecord {
  id: number;
  customer_id: number;
  service_type: string;
  description: string;
  service_date: string;
  created_at: string;
}

export interface CustomerQuotation {
  id: number;
  quotation_no: string;
  status: string;
  total_price: number;
  created_at: string;
}

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  source?: CustomerSource;
  city?: string;
  district?: string;
  address?: string;
  note?: string;
}

export interface CustomerDistribution {
  byCity: { city: string; count: number }[];
  bySource: { source: string; count: number }[];
  total: number;
}

export interface CreateServiceInput {
  service_type?: string;
  description?: string;
  service_date?: string;
}
