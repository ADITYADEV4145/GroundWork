package restock

// ReorderPoint is the stock level at which an item is reordered: ReorderPoint(leadDays, dailyUse).
func ReorderPoint(leadDays int, dailyUse int) int {
	return leadDays * dailyUse
}
