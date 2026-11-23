package reports

import (
	"stockroom/model"
	"stockroom/money"
)

func ValuationLine(item model.Item) string {
	return "Stock value: " + money.FormatCents(item.Quantity*item.UnitCents)
}
