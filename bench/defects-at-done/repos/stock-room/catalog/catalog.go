package catalog

import (
	"strings"

	"stockroom/model"
)

// Catalog is the set of known items.
type Catalog struct {
	items []model.Item
}

func New(items []model.Item) *Catalog {
	return &Catalog{items: items}
}

// FindByName returns every item whose name contains the text, active or not.
func (c *Catalog) FindByName(text string) []model.Item {
	var out []model.Item
	for _, it := range c.items {
		if strings.Contains(strings.ToLower(it.Name), strings.ToLower(text)) {
			out = append(out, it)
		}
	}
	return out
}

// FindByBin returns the items stored in a bin, active or not.
func (c *Catalog) FindByBin(bin string) []model.Item {
	var out []model.Item
	for _, it := range c.items {
		if it.Bin == bin {
			out = append(out, it)
		}
	}
	return out
}

// FindBySKU matches SKUs in any letter case with surrounding spaces ignored. Inactive items are skipped unless includeInactive is set.
func (c *Catalog) FindBySKU(sku string, includeInactive bool) (model.Item, bool) {
	wanted := strings.ToUpper(strings.TrimSpace(sku))
	for _, it := range c.items {
		if strings.ToUpper(it.SKU) == wanted && (includeInactive || it.Active) {
			return it, true
		}
	}
	return model.Item{}, false
}
