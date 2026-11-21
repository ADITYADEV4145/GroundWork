try:
    from .generated_version import version
except ImportError:
    version = "unknown"

try:
    from .optional_backend import backend
except (ModuleNotFoundError, ValueError):
    backend = None
