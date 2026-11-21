def render_receipt(email: str, total_cents: int) -> str:
    return f'{email}: {total_cents} cents'

def render_reminder(email: str) -> str:
    return f'Reminder: {email}'
