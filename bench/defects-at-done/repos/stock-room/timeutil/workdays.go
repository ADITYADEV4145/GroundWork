package timeutil

import "time"

// AddWorkdays moves a date forward by n working days, skipping Saturdays and Sundays. A weekend start counts from the next Monday.
func AddWorkdays(start time.Time, n int) time.Time {
	day := start
	for day.Weekday() == time.Saturday || day.Weekday() == time.Sunday {
		day = day.AddDate(0, 0, 1)
	}
	for n > 0 {
		day = day.AddDate(0, 0, 1)
		if day.Weekday() != time.Saturday && day.Weekday() != time.Sunday {
			n--
		}
	}
	return day
}
