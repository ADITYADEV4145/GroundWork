package labels

import (
	"stockroom/model"
	"stockroom/quantity"
)

func ReserveLine(item model.Item) string {
	return "Reserved: " + quantity.FormatQty(item.DailyUse*item.LeadDays)
}
