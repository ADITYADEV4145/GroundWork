export interface User { id: string; email: string; name: string; plan: string }
export interface Ticket { id: string; userId: string; state: 'open' | 'closed' }
export interface Policy { userId: string; contact: boolean; billing: boolean }
export interface Plan { code: string; priority: boolean }
