from .models import Invoice


def _extra(self):
    return 1


setattr(Invoice, "extra", _extra)
Invoice.extra(Invoice("c"))
