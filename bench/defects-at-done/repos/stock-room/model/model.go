package model

// Item is one stocked product.
type Item struct {
	SKU       string
	Name      string
	Bin       string
	Quantity  int
	Unit      string
	UnitCents int
	Currency  string
	LeadDays  int
	DailyUse  int
	Active    bool
}

// Supplier delivers items.
type Supplier struct {
	Code   string
	Name   string
	Region string
	Phone  string
	Active bool
}

// Parcel is a weighed package; Unit is one of g, kg, oz, lb.
type Parcel struct {
	Weight float64
	Unit   string
}
