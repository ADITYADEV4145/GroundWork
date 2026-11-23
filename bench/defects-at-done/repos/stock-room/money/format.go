package money

import "fmt"

// FormatCents renders whole cents as a decimal amount: FormatCents(cents).
func FormatCents(cents int) string {
	sign := ""
	if cents < 0 {
		sign, cents = "-", -cents
	}
	return fmt.Sprintf("%s%d.%02d", sign, cents/100, cents%100)
}
