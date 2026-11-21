from .models import Order

def subtotal(order: Order) -> int:
    return order.unit_cents * order.quantity

def total_due(order: Order, *, tax_rate: float = 0.0) -> int:
    return round(subtotal(order) * (1 + tax_rate))
