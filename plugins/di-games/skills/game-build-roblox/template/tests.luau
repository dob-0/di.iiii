--!strict
-- Entry point: `lune run tests` (from the repo root, with Lune from rokit.toml).
-- Add one line per test file, before h.summary().
local h = require("./tests/harness")

require("./tests/config.test")(h)
require("./tests/round.test")(h)

h.summary()
