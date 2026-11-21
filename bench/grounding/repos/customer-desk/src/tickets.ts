import type { Ticket } from './types.ts';
export class TicketStore {
  tickets: Ticket[];
  constructor(tickets: Ticket[]) { this.tickets = tickets; }
  listOpenForUser(userId: string): Ticket[] {
    return this.tickets.filter((t) => t.userId === userId && t.state === 'open').sort((a, b) => a.id.localeCompare(b.id));
  }
  listClosedForUser(userId: string): Ticket[] { return this.tickets.filter((t) => t.userId === userId && t.state === 'closed'); }
}
