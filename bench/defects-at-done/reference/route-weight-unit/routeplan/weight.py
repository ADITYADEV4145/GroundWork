def format_weight(kg: float, unit: str) -> str:
    """Render a weight with one decimal and its unit, e.g. 12.34 kg -> "12.3 kg"; pounds are converted first."""
    return f"{kg * 2.20462 if unit == 'lb' else kg:.1f} {unit}"
