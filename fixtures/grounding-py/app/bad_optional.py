try:
    from .unhandled_missing import value  # expect: missing-module
except ValueError:
    value = None

try:
    value = 1
except ImportError:
    from .missing_in_handler import fallback  # expect: missing-module

from .missing_after_try import other  # expect: missing-module
