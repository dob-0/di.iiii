--!strict
-- A tiny test harness. No outside packages. `lune run tests` prints "N passed, 0 failed".

export type Harness = {
	test: (name: string, fn: () -> ()) -> (),
	eq: (actual: any, expected: any, note: string?) -> (),
	near: (actual: number, expected: number, note: string?) -> (),
	summary: () -> (),
}

local passed = 0
local failed = 0

local function fail(message: string)
	error(message, 3)
end

local Harness: Harness = {
	test = function(name, fn)
		local ok, err = pcall(fn)
		if ok then
			passed += 1
		else
			failed += 1
			print(`FAIL {name}: {err}`)
		end
	end,
	eq = function(actual, expected, note)
		if actual ~= expected then
			fail(`{note or "eq"}: expected {tostring(expected)}, got {tostring(actual)}`)
		end
	end,
	near = function(actual, expected, note)
		if math.abs(actual - expected) > 1e-6 then
			fail(`{note or "near"}: expected {expected}, got {actual}`)
		end
	end,
	summary = function()
		print(`{passed} passed, {failed} failed`)
		if failed > 0 then
			error("tests failed")
		end
	end,
}

return Harness
