import os
from dispatch import workflows as w
from dispatch.models import Order, Customer
from dispatch.warehouse import StockLedger

for n in ([int(os.environ['CASE_NUMBER'])] if 'CASE_NUMBER' in os.environ else range(1, 5)):
    orders = [Order(f'r{n}', 'a', False, 'book', n, 125, 1.5), Order('c', 'a', True, 'book', 99, 100, 2), Order('b', 'b', False, 'pen', 1, 50, 1)]
    task = os.environ['TASK_ID']
    if task == 'dispatch-balance':
        assert w.customer_balance(orders, 'a', 0.2) == n * 150
        assert w.customer_balance([], 'a', 0.2) == 0
    elif task == 'dispatch-delivery':
        assert w.delivery_offer(orders, f'r{n}', 'local', False) == 350
        assert w.delivery_offer(orders, f'r{n}', 'remote', True) == 1450
        assert w.delivery_offer(orders, 'c', 'local', False) is None
        assert w.delivery_offer(orders, 'missing', 'local', False) is None
        assert w.delivery_offer(orders, f'r{n}', 'invalid', False) is None
    elif task == 'dispatch-hold':
        ledger = StockLedger({'book': n})
        assert w.hold_order(orders, f'r{n}', ledger) == n
        assert ledger.available('book') == 0
        assert w.hold_order(orders, f'r{n}', ledger) == 0
        assert w.hold_order(orders, 'c', ledger) == 0
    elif task == 'dispatch-receipt':
        customer = Customer('a', ' PERSON@Test.local ', 'billing@test.local')
        assert w.customer_receipt(orders, customer, 0.2) == f'person@test.local: {n * 150} cents'
        assert w.customer_receipt([], customer, 0.2) == 'person@test.local: 0 cents'
    elif task == 'dispatch-cancelled':
        assert w.cancelled_references(orders, 'a') == ['c']
        assert w.cancelled_references(orders, 'missing') == []
    else:
        raise ValueError('Unknown task')
