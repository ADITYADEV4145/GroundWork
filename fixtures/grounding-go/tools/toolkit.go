package toolkit

func Existing() {}
func Generic[T any](value T) {}
func Function() func() { return func() {} }

type Count int

var (
	Callback = func() {}
)
