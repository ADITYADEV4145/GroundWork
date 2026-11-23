package labels

import (
	"stockroom/model"
	"stockroom/quantity"
)

func PickListLine(item model.Item) string {
	return "Pick: " + quantity.FormatQty(item.DailyUse)
}
