package orders

import (
	"stockroom/model"
	"stockroom/money"
)

// RestockFeeCents is a percentage of the item's stock value.
func RestockFeeCents(item model.Item, percent int) int {
	return money.RoundHalfEven(LineCents(item)*percent, 100)
}
