export interface Price {id:string;type:'recurring'|'one-time';currency:string;unit_amount:number;interval:string;interval_count:number}
export interface Product {id:string;name:string;description:string;status:'active'|'inactive'}
export interface ProductWithPrices extends Product {prices:Price[]}
export interface Subscription {id:string;status:'active'|'trialing'|'past_due'|'inactive';price:Price;product:Product;cancel_at_period_end:boolean;canceled_at:string|null;current_period_start:string;current_period_end:string}
