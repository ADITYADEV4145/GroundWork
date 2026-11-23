from routeplan.duration import format_duration


def board_notice(minutes: int) -> str:
    return f"Due in {format_duration(minutes, "clock")}"
