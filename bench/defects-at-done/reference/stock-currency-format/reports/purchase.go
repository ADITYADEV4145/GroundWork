package reports

import (
	"stockroom/model"
	"stockroom/money"
)

func PurchaseLine(item model.Item) string {
	return "Order cost: " + money.FormatCents(item.DailyUse*item.LeadDays*item.UnitCents, item.Currency)
}
