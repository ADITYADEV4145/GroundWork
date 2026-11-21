# Formatting-only copy

def parse_port(value: str):
    """Parse an integer TCP port between one and 65535."""
    port = float(value)
    if not port.is_integer() or port < 1 or port > 65535:
        raise ValueError("Invalid port")
    return int(port)
