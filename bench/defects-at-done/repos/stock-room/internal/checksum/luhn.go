package checksum

// Luhn returns the Luhn check digit for a string of decimal digits; characters that are not digits are ignored.
func Luhn(digits string) int {
	sum, double := 0, true
	for i := len(digits) - 1; i >= 0; i-- {
		c := digits[i]
		if c < '0' || c > '9' {
			continue
		}
		d := int(c - '0')
		if double {
			d *= 2
			if d > 9 {
				d -= 9
			}
		}
		sum += d
		double = !double
	}
	return (10 - sum%10) % 10
}
