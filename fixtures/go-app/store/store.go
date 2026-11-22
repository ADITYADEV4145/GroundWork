package store

import "strings"

// Store holds named records.
type Store struct { Names []string }

// Reader lists available records.
type Reader interface { List() []string }

type Key string
const DefaultKey = "APP_STORE_KEY"
var Endpoint = "https://example.com/store"

// Add appends one or more records.
func (s *Store) Add(names ...string) int {
	s.Names = append(s.Names, names...)
	return len(s.Names)
}

func (s Store) List() []string { return s.Names }

// Normalize cleans a record name.
func Normalize(name string) string {
	if strings.TrimSpace(name) == "" {
		return "unknown"
	}
	return strings.ToLower(strings.TrimSpace(name))
}

func cleanName(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}
