package reports

import (
	"stockroom/model"
	"stockroom/money"
)

func InsuranceLine(item model.Item) string {
	return "Insured for: " + money.FormatCents(item.Quantity*item.UnitCents, item.Currency)
}
