package main

import (
	"fmt"
	storage "example.com/go-app/store"
)

func main() {
	s := storage.Store{}
	s.Add("Alice", "Bob")
	fmt.Println(s.List())
	fmt.Println(storage.Format("Alice"))
}

func Join(prefix string, names ...string) string {
	for _, name := range names {
		prefix += name
	}
	return prefix
}
