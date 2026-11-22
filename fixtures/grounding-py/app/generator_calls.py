def consume(values):
    return list(values)


def consume_pair(left, right):
    return list(left), list(right)


def keyword_only(*, values):
    return list(values)


consume(x for x in [])
consume(x for x in [1, 2])
consume((x for x in [1, 2]))
consume(values=(x for x in [1, 2]))
keyword_only(values=(x for x in [1, 2]))
consume(*[[1, 2]])
consume(**{"values": [1, 2]})
consume(*(x for x in [[1, 2]]))
consume_pair(x for x in [1, 2])  # expect: arity
consume()  # expect: arity
consume([], [])  # expect: arity
keyword_only(x for x in [1, 2])  # expect: arity
