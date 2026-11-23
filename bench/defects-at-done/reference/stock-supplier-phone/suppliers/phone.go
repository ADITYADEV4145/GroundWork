package suppliers

// SupplierPhone is the phone number of the active supplier with the given code.
func SupplierPhone(b *Book, code string) (string, bool) {
	s, ok := b.LookupByCode(code, true)
	if !ok {
		return "", false
	}
	return s.Phone, true
}
