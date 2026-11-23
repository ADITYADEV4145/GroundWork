package pricing

import "stockroom/money"

// Discounted is the price in cents after a percentage discount: Discounted(percent, cents).
func Discounted(percent int, cents int) int {
	return cents - money.RoundHalfEven(cents*percent, 100)
}
