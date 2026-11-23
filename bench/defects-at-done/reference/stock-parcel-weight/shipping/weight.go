package shipping

import (
	"stockroom/internal/units"
	"stockroom/model"
)

// TotalGrams is the combined weight of the parcels in grams.
func TotalGrams(parcels []model.Parcel) (float64, error) {
	total := 0.0
	for _, p := range parcels {
		grams, err := units.ToGrams(p.Weight, p.Unit)
		if err != nil {
			return 0, err
		}
		total += grams
	}
	return total, nil
}
