from .models import Order

def list_orders(orders: list[Order], customer_id: str, *, include_cancelled: bool = False) -> list[Order]:
    return [o for o in orders if o.customer_id == customer_id and (include_cancelled or not o.cancelled)]

def get_order(orders: list[Order], reference: str) -> Order | None:
    return next((o for o in orders if o.reference == reference), None)
