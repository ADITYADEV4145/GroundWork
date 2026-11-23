package restock

import "stockroom/model"

// NeedsReorder lists the SKUs whose stock is at or below their reorder point.
func NeedsReorder(items []model.Item) []string {
	var out []string
	for _, it := range items {
		if it.Quantity <= ReorderPoint(it.DailyUse, it.LeadDays, 0) {
			out = append(out, it.SKU)
		}
	}
	return out
}
