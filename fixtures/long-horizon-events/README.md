# Gather

A small event-operations library. Events have `{title, startsAt, capacity}`;
signups have `{name, email}`. `src/lib/` contains the shared primitives used by
the existing catalog preview. New features belong in `src/features/` and should
compose existing operations rather than introduce parallel helper libraries.
Inputs are plain JSON objects; dates are ISO timestamps. There is no network or
database requirement. Do not mutate caller-owned objects or arrays.
