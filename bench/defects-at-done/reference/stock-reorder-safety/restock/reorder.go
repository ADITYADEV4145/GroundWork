package restock

// ReorderPoint is the stock level at which an item is reordered: ReorderPoint(dailyUse, leadDays, safety).
func ReorderPoint(dailyUse int, leadDays int, safety int) int {
	return dailyUse*leadDays + safety
}
