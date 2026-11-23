package orders

import (
	"stockroom/model"
	"stockroom/pricing"
)

// LineCents is the value of the whole stock of an item.
func LineCents(item model.Item) int {
	return item.Quantity * item.UnitCents
}

// PromoTotal is the stock value of the items after a percentage discount on each line.
func PromoTotal(items []model.Item, percent int) int {
	total := 0
	for _, it := range items {
		total += pricing.Discounted(percent, LineCents(it))
	}
	return total
}
