package reports

import (
	"testing"

	"stockroom/model"
)

var item = model.Item{SKU: "AB-1", Name: "Bolt", Bin: "A1", Quantity: 1200, Unit: "pcs", UnitCents: 125, Currency: "EUR", LeadDays: 2, DailyUse: 30, Active: true}

func TestLines(t *testing.T) {
	want := map[string]string{
		ValuationLine(item): "Stock value: 1500.00 EUR",
		PriceTagLine(item):  "Unit price: 1.25 EUR",
		WriteOffLine(item):  "Written off: 1500.00 EUR",
		InsuranceLine(item): "Insured for: 1500.00 EUR",
		PurchaseLine(item):  "Order cost: 75.00 EUR",
	}
	for got, expected := range want {
		if got != expected {
			t.Errorf("got %q, want %q", got, expected)
		}
	}
}

func TestSalePrices(t *testing.T) {
	if got := SalePrices([]model.Item{item}, 10)["AB-1"]; got != 113 {
		t.Errorf("got %d, want 113", got)
	}
}
