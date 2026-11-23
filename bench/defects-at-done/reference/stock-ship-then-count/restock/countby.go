package restock

import (
	"time"

	"stockroom/timeutil"
)

// CountBy is when a stock count of the given number of bins is finished: one working day per four bins, rounded up.
func CountBy(received time.Time, bins int) time.Time {
	return timeutil.AddWorkdays(received, (bins+3)/4)
}
