---
description: Simplify the code just written without changing its behaviour
argument-hint: "[path or scope]"
---
Review ${@:-the changes you just made} and simplify them.

For each construct, stop at the first of these that holds:

1. Does it need to exist at all? Speculative need means delete it.
2. Does something in this codebase already do it? Reuse that.
3. Does the standard library do it? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it. Never add a new
   dependency for what a few lines can do.
6. Can it be one line? Make it one line.

Then report what you removed and what you deliberately kept. Do not change
behaviour, do not rename anything for taste, and do not touch code outside
the scope above. Run the tests afterwards and show the result.
