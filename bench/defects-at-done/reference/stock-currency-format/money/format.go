package money

import "fmt"

// FormatCents renders whole cents as a decimal amount followed by its currency: FormatCents(cents, currency).
func FormatCents(cents int, currency string) string {
	sign := ""
	if cents < 0 {
		sign, cents = "-", -cents
	}
	return fmt.Sprintf("%s%d.%02d %s", sign, cents/100, cents%100, currency)
}
