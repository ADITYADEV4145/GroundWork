package reports

import (
	"stockroom/model"
	"stockroom/pricing"
)

// SalePrices is the unit price of each item after a clearance discount, keyed by SKU.
func SalePrices(items []model.Item, percent int) map[string]int {
	out := map[string]int{}
	for _, it := range items {
		out[it.SKU] = pricing.Discounted(it.UnitCents, pricing.Options{Percent: percent})
	}
	return out
}
