package reports

import (
	"stockroom/model"
	"stockroom/money"
)

func PriceTagLine(item model.Item) string {
	return "Unit price: " + money.FormatCents(item.UnitCents, item.Currency)
}
