package units

import "fmt"

var gramsPer = map[string]float64{"g": 1, "kg": 1000, "oz": 28.349523125, "lb": 453.59237}

// ToGrams converts a weight in g, kg, oz or lb to grams. Unknown units are an error.
func ToGrams(weight float64, unit string) (float64, error) {
	factor, ok := gramsPer[unit]
	if !ok {
		return 0, fmt.Errorf("unknown weight unit %q", unit)
	}
	return weight * factor, nil
}
