package textutil

import "strings"

// Dashify lowercases s, drops everything except ASCII letters and digits, and joins the remaining runs with single dashes.
func Dashify(s string) string {
	var b strings.Builder
	pending := false
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			if pending && b.Len() > 0 {
				b.WriteByte('-')
			}
			pending = false
			b.WriteRune(r)
		} else {
			pending = true
		}
	}
	return b.String()
}
