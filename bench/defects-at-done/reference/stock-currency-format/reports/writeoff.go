package reports

import (
	"stockroom/model"
	"stockroom/money"
)

func WriteOffLine(item model.Item) string {
	return "Written off: " + money.FormatCents(item.Quantity*item.UnitCents, item.Currency)
}
