package catalog

import (
	"stockroom/internal/textutil"
	"stockroom/model"
)

// ItemSlug is the item's name and SKU as one URL-safe identifier.
func ItemSlug(item model.Item) string {
	name, sku := textutil.Dashify(item.Name), textutil.Dashify(item.SKU)
	if name == "" {
		return sku
	}
	return name + "-" + sku
}
