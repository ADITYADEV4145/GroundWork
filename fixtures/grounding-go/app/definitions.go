package app

type Worker struct{}

func (Worker) Run() {}

func fixed(n int) {}
func pair() int { return 1 }
func tuple() (int, int) { return 1, 2 }
func variadic(prefix string, extras ...string) {}
