export interface Account { id: string; handle: string; email: string; name: string; active: boolean; region: string }
export interface Line { sku: string; quantity: number; unitCents: number }
export interface Invoice { number: number; accountId: string; customer: string; currency: string; lines: Line[] }
