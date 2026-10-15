export interface Price {
  id: string;
  unit_amount: number;
  currency: string;
  type?: 'recurring' | 'one-time';
  interval: 'month' | 'year';
  interval_count: number;
  // Add other price properties if needed
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  prices: Price[];
  // Add other product properties if needed
} 