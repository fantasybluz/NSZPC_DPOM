export interface SupplierPrice {
  id: number;
  supplier_name: string;
  product_name: string;
  price: number;
  source_text: string;
  quote_date: string;
  parsed_at: string;
}

export interface ParsedPrice {
  product: string;
  price: number;
  original: string;
}

export interface ParseInput {
  text: string;
  supplier_name?: string;
}

export interface ParseResult {
  parsed: ParsedPrice[];
  count: number;
}
