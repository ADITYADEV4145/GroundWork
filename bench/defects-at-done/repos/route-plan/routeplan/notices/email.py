from routeplan.duration import format_duration


def email_notice(minutes: int) -> str:
    return f"Your delivery arrives in {format_duration(minutes)}"
