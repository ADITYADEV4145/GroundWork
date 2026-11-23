package orders

import (
	"time"

	"stockroom/model"
	"stockroom/timeutil"
)

// ShipBy is the order date plus the item's lead time in working days.
func ShipBy(ordered time.Time, item model.Item) time.Time {
	return timeutil.AddWorkdays(ordered, item.LeadDays)
}
