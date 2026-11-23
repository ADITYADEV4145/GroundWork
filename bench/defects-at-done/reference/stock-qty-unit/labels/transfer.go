package labels

import (
	"stockroom/model"
	"stockroom/quantity"
)

func TransferLine(item model.Item) string {
	return "Move: " + quantity.FormatQty(item.Quantity, item.Unit)
}
