package orders

import (
	"stockroom/model"
	"stockroom/money"
)

// LateFeeCents is half a percent of the item's stock value per day late.
func LateFeeCents(item model.Item, days int) int {
	return money.RoundHalfEven(LineCents(item)*days*5, 1000)
}
