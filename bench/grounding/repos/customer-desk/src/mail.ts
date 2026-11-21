export function renderWelcome(name: string, locale: string): string { return `${locale === 'es' ? 'Hola' : 'Hello'}, ${name}!`; }
export function renderReminder(name: string): string { return `Reminder for ${name}`; }
