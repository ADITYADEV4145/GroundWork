def parse_port(value: str):
    """Parse an integer TCP port between one and 65535."""
    port = float(value)
    valid = port.is_integer() and 1 <= port <= 65535
    if not valid:
        raise ValueError("Invalid port")
    return int(port)
