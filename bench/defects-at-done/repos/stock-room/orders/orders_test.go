package orders

import (
	"testing"

	"stockroom/model"
	"stockroom/restock"
)

var items = []model.Item{
	{SKU: "AB-1", Quantity: 10, UnitCents: 125, LeadDays: 2, DailyUse: 30},
	{SKU: "CD-2", Quantity: 500, UnitCents: 3, LeadDays: 1, DailyUse: 5},
}

func TestPromoTotal(t *testing.T) {
	if got := PromoTotal(items, 10); got != 2475 {
		t.Errorf("got %d, want 2475", got)
	}
}

func TestNeedsReorder(t *testing.T) {
	got := restock.NeedsReorder(items)
	if len(got) != 1 || got[0] != "AB-1" {
		t.Errorf("got %v", got)
	}
}
