package suppliers

import (
	"strings"

	"stockroom/model"
)

// Book is the supplier directory.
type Book struct {
	suppliers []model.Supplier
}

func NewBook(suppliers []model.Supplier) *Book {
	return &Book{suppliers: suppliers}
}

// LookupByRegion returns every supplier in a region, active or not.
func (b *Book) LookupByRegion(region string) []model.Supplier {
	var out []model.Supplier
	for _, s := range b.suppliers {
		if s.Region == region {
			out = append(out, s)
		}
	}
	return out
}

// LookupByCode matches supplier codes with a leading "#" and letter case ignored. Inactive suppliers are skipped when activeOnly is set.
func (b *Book) LookupByCode(code string, activeOnly bool) (model.Supplier, bool) {
	wanted := strings.ToUpper(strings.TrimPrefix(strings.TrimSpace(code), "#"))
	for _, s := range b.suppliers {
		if strings.ToUpper(s.Code) == wanted && (s.Active || !activeOnly) {
			return s, true
		}
	}
	return model.Supplier{}, false
}
