package catalog

// ItemName is the name of the active item with the given SKU.
func ItemName(c *Catalog, sku string) (string, bool) {
	item, ok := c.FindBySKU(sku, false)
	if !ok {
		return "", false
	}
	return item.Name, true
}
