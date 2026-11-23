export interface Account { id: string; handle: string; email: string; name: string; active: boolean; region: string }
export interface Line { sku: string; quantity: number; unitCents: number }
export interface Invoice { number: number; accountId: string; customer: string; currency: string; lines: Line[] }
export interface FiledInvoice extends Invoice { status: 'open' | 'paid' | 'void' }
export interface Product { sku: string; name: string; unitCents: number; retired: boolean }
export type DateStyle = 'iso' | 'eu' | 'us';
export interface Dated { number: number; date: string; dateStyle: DateStyle }
