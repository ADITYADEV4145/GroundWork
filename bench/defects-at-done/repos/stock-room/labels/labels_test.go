package labels

import (
	"testing"

	"stockroom/model"
)

var item = model.Item{SKU: "AB-1", Name: "Bolt", Bin: "A1", Quantity: 1200, Unit: "pcs", UnitCents: 125, Currency: "EUR", LeadDays: 2, DailyUse: 30, Active: true}

func TestLines(t *testing.T) {
	want := map[string]string{
		ShelfLine(item):    "On shelf: 1,200",
		PickListLine(item): "Pick: 30",
		CountLine(item):    "Counted: 1,200",
		TransferLine(item): "Move: 1,200",
		ReserveLine(item):  "Reserved: 60",
	}
	for got, expected := range want {
		if got != expected {
			t.Errorf("got %q, want %q", got, expected)
		}
	}
}
