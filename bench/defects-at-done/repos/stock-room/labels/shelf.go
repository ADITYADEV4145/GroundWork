package labels

import (
	"stockroom/model"
	"stockroom/quantity"
)

func ShelfLine(item model.Item) string {
	return "On shelf: " + quantity.FormatQty(item.Quantity)
}
