package quantity

import "strconv"

// FormatQty renders a stock count with thousands separators followed by its unit: FormatQty(n, unit).
func FormatQty(n int, unit string) string {
	s := strconv.Itoa(n)
	neg := ""
	if n < 0 {
		neg, s = "-", s[1:]
	}
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return neg + s + " " + unit
}
