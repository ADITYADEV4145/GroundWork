export interface Order { reference: string; account: string; cancelled: boolean; sku: string; quantity: number; unitCents: number; weight: number }
export interface Rate { zone: string; baseCents: number; perKgCents: number }
