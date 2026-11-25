package app

import (
	"fmt"

	"example.com/grounding/more"
	"example.com/grounding/tools"
	v "example.com/grounding/valid"
	_ "example.com/grounding/side"
	"github.com/example/thirdparty"
)

func check(values []string, x Worker) {
	Absent()                  // expect: unknown-member
	toolkit.Missing()         // expect: unknown-member
	fixed(1, 2)               // expect: arity
	v.Pair(1)                 // expect: arity
	variadic()                // expect: arity
	x.Run()
	fmt.Println("stdlib")
	thirdparty.External()
	variadic("ok")
	variadic("ok", "alpha", "beta")
	variadic("ok", values...)
	fixed(1)
	fixed(pair())
	v.Pair(tuple())
	toolkit.Existing()
	toolkit.Callback()
	toolkit.Count(3)
	toolkit.Generic[int](1)
	toolkit.Generic(1)
	toolkit.Function()()
	more.Tagged(1)
	_ = len(values)
	_ = int(1)
	NoReport() // gw: ignore
}

func shadow(toolkit Worker) {
	toolkit.Run()
}

func rebound() {
	toolkit := Worker{}
	toolkit.Run()
	fixed := func() {}
	fixed()
}
