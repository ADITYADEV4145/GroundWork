package labels

import (
	"stockroom/model"
	"stockroom/quantity"
)

func CountLine(item model.Item) string {
	return "Counted: " + quantity.FormatQty(item.Quantity, item.Unit)
}
