package pricing

import "stockroom/money"

// Options controls a discount: the percentage taken off and the lowest price allowed.
type Options struct {
	Percent  int
	MinCents int
}

// Discounted is the price in cents after a discount: Discounted(cents, Options{Percent: 10}). The price never drops below MinCents.
func Discounted(cents int, opts Options) int {
	price := cents - money.RoundHalfEven(cents*opts.Percent, 100)
	if price < opts.MinCents {
		return opts.MinCents
	}
	return price
}
