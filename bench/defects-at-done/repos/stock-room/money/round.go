package money

// RoundHalfEven divides num by den and rounds to a whole cent, ties going to the even cent. Every money path must round with this.
func RoundHalfEven(num, den int) int {
	q, r := num/den, num%den
	if r < 0 {
		q, r = q-1, r+den
	}
	switch {
	case 2*r > den:
		return q + 1
	case 2*r == den && q%2 != 0:
		return q + 1
	}
	return q
}
