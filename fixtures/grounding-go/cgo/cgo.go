package cgo

import "C"

func useC() {
	C.DoSomething()
	generatedByCgo()
}
