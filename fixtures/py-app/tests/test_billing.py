from app.models import Invoice
from app.services.billing import charge


def test_charge():
    assert charge(Invoice("c", [10.0])) > 10
