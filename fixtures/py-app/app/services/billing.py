from ..models import Invoice
from . import tax
import logging

log = logging.getLogger(__name__)


def charge(invoice: Invoice, region: str = "eu") -> float:
    """Charge an invoice including tax."""
    subtotal = invoice.total()
    total = subtotal * (1 + tax.rate(region))
    log.info("charged %s", total)
    return total


def _round(value, ndigits=2):
    return round(value, ndigits)
