--!strict
-- Fails if the SHIPPED place holds test-only code: a script named ScenarioRunner, or any script whose source says "TEST ONLY".
-- Why: scenario runners (tests/place/) are built into a separate test place (scripts/build-test.sh); the place that is published must never hold them.
-- Run: `scripts/tools.sh lune run scripts/check_no_test_code build/__PROJECT_NAME__.rbxl` (check.sh does, after the Rojo build).
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")

local place = roblox.deserializePlace(fs.readFile(process.args[1] or "build/__PROJECT_NAME__.rbxl"))
local bad = {}
for _, d in place:GetDescendants() do
	local named = d.Name == "ScenarioRunner"
	local marked = d:IsA("LuaSourceContainer")
		and string.find((d :: any).Source, "TEST ONLY", 1, true) ~= nil
	if named or marked then
		table.insert(bad, d:GetFullName())
	end
end
if #bad > 0 then
	print("FAIL  test-only code in the shipped place: " .. table.concat(bad, ", "))
	process.exit(1)
end
print("ok    the shipped place holds no test-only script")
