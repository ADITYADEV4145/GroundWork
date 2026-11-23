package labels

import (
	"fmt"

	"stockroom/internal/checksum"
)

// BinLabel is the aisle and shelf followed by their Luhn check digit.
func BinLabel(aisle int, shelf int) string {
	digits := fmt.Sprintf("%02d%03d", aisle, shelf)
	return fmt.Sprintf("%s%d", digits, checksum.Luhn(digits))
}
