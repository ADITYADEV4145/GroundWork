from .models import Customer, Order
from .warehouse import StockLedger

def customer_balance(orders: list[Order], customer_id: str, tax_rate: float) -> int:
    raise NotImplementedError

def delivery_offer(orders: list[Order], reference: str, region: str, express: bool) -> int | None:
    raise NotImplementedError

def hold_order(orders: list[Order], reference: str, ledger: StockLedger) -> int:
    raise NotImplementedError

def customer_receipt(orders: list[Order], customer: Customer, tax_rate: float) -> str:
    raise NotImplementedError

def cancelled_references(orders: list[Order], customer_id: str) -> list[str]:
    raise NotImplementedError
