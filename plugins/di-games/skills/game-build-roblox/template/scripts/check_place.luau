--!strict
-- check_place: reads the BUILT place (the .rbxl that Studio opens) and fails on what the JSON tests cannot see.
-- Why it exists (2026-10-28): Rojo ignores "Position" in a .model.json, so every part sat at (0, 0, 0) and every
-- test passed, because the tests read the same JSON. This reads the engine's view of the map.
-- Method: round trip. What map/*.model.json says must be what the built place holds, and the plan's basics must
-- hold on the placed parts (nothing at the origin, nothing outside the areas, a spawn, the scripts).
-- Game-specific rules (keys found, patrol routes, ...) go in a second section at the bottom of YOUR copy.
-- Run: `scripts/tools.sh lune run scripts/check_place build/__PROJECT_NAME__.rbxl` (check.sh does, after rojo build).
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local Vector3 = roblox.Vector3
local serde = require("@lune/serde")

local path = process.args[1] or "build/__PROJECT_NAME__.rbxl"
local place = roblox.deserializePlace(fs.readFile(path))
local plan = serde.decode("json", fs.readFile("map/plan.json"))
local workspace = place:GetService("Workspace")

local passed = 0
local failures = 0
local function check(ok: boolean, what: string, detail: string?)
	if ok then
		passed += 1
		print("ok    " .. what)
	else
		failures += 1
		print("FAIL  " .. what .. (if detail then ": " .. detail else ""))
	end
end
local function finish()
	print(("place checks: %d passed, %d failed"):format(passed, failures))
	if failures > 0 then
		process.exit(1)
	end
end

local function centre(part: Instance): Vector3
	return (part :: any).CFrame.Position
end
local function partsIn(folder: Instance?): { Instance }
	local list = {}
	if folder then
		for _, d in folder:GetDescendants() do
			if d:IsA("BasePart") then
				table.insert(list, d)
			end
		end
	end
	return list
end

local map = workspace:FindFirstChild("Map")
check(map ~= nil, "Workspace.Map exists")
if map == nil then
	finish()
	return
end

-- 1. Round trip: every property the source files name reached the place. (This alone catches "Position".)
local compared, mismatches = 0, {}
local function same(expected: any, actual: any): boolean?
	local t = type(expected)
	if t == "number" then
		return type(actual) == "number" and math.abs(expected - actual) < 1e-3
	elseif t == "boolean" or t == "string" then
		return expected == actual
			or (typeof(actual) == "EnumItem" and (actual :: any).Name == expected)
	elseif t == "table" and #expected == 3 and type(expected[1]) == "number" then
		local ty = typeof(actual)
		if ty == "Vector3" then
			return math.abs(expected[1] - actual.X) < 1e-3
				and math.abs(expected[2] - actual.Y) < 1e-3
				and math.abs(expected[3] - actual.Z) < 1e-3
		elseif ty == "Color3" then
			return math.abs(expected[1] - actual.R) < 0.01
				and math.abs(expected[2] - actual.G) < 0.01
				and math.abs(expected[3] - actual.B) < 0.01
		end
	elseif t == "table" and expected.CFrame ~= nil and typeof(actual) == "CFrame" then
		local p = expected.CFrame.position
		return (actual.Position - Vector3.new(p[1], p[2], p[3])).Magnitude < 1e-3
	end
	return nil -- a kind of value this check does not compare
end
local function compareTree(source: any, inst: Instance, where: string)
	for key, expected in source.Properties or {} do
		local ok, actual = pcall(function()
			return (inst :: any)[key]
		end)
		local verdict = if ok then same(expected, actual) else false
		if verdict ~= nil then
			compared += 1
			if not verdict then
				table.insert(mismatches, `{where}.{key}`)
			end
		end
	end
	for _, child in source.Children or {} do
		local built = inst:FindFirstChild(child.Name)
		if built == nil then
			compared += 1
			table.insert(mismatches, `{where}/{child.Name} is missing`)
		else
			compareTree(child, built, where .. "/" .. child.Name)
		end
	end
end
for _, file in fs.readDir("map") do
	local base = string.match(file, "^(.+)%.model%.json$")
	if base then
		local source = serde.decode("json", fs.readFile("map/" .. file))
		local built = map:FindFirstChild(base)
		if built then
			compareTree(source, built, base)
		else
			table.insert(mismatches, `{base} is missing from Workspace.Map`)
		end
	end
end
check(
	#mismatches == 0 and compared > 0,
	`every property named in map/*.model.json is in the built place ({compared} compared)`,
	`{#mismatches} differ, first: {table.concat(mismatches, "; ", 1, math.min(#mismatches, 4))}`
)

-- 2. Nothing at the origin, nothing outside the plan's areas, the parts are spread.
local all = partsIn(map)
local atOrigin, outside = 0, 0
local lo, hi = { x = math.huge, z = math.huge }, { x = -math.huge, z = -math.huge }
for _, a in plan.areas do
	lo.x, lo.z = math.min(lo.x, a.min[1]), math.min(lo.z, a.min[2])
	hi.x, hi.z = math.max(hi.x, a.max[1]), math.max(hi.z, a.max[2])
end
local cells: { [string]: boolean } = {}
local spread = 0
for _, part in all do
	local p = centre(part)
	if p.Magnitude < 0.01 then
		atOrigin += 1 -- the identity CFrame: where a part lands when its position was dropped
	end
	if p.X < lo.x - 10 or p.X > hi.x + 10 or p.Z < lo.z - 10 or p.Z > hi.z + 10 then
		outside += 1
	end
	local cell = math.floor(p.X / 10) .. "," .. math.floor(p.Z / 10)
	if not cells[cell] then
		cells[cell] = true
		spread += 1
	end
end
check(#all > 0, "the map has parts", `{#all}`)
check(atOrigin == 0, "no part of the map sits at the origin (0, 0, 0)", `{atOrigin} of {#all}`)
check(outside == 0, "every part is inside the plan's areas (10 studs margin)", `{outside} outside`)
check(
	spread > 1,
	"the parts are spread over the floor, not in one clump",
	`{spread} cells of 10 x 10 studs`
)

-- 3. A spawn, inside the plan, where the plan says.
local spawn = map:FindFirstChild("Markers") and (map :: any).Markers:FindFirstChild("PlayerSpawn")
check(spawn ~= nil and spawn:IsA("SpawnLocation"), "Markers.PlayerSpawn is a SpawnLocation")
if spawn then
	local s = plan.spawn
	check(
		(centre(spawn) - Vector3.new(s[1], s[2], s[3])).Magnitude < 1e-3,
		"the spawn is where map/plan.json puts it",
		tostring(centre(spawn))
	)
end

-- 4. The scripts of the repo are in the built place (a server, a client, a shared module each).
local function missingFrom(dir: string, parent: Instance?): string
	local missing = {}
	for _, file in fs.readDir(dir) do
		local name = string.match(file, "^(.+)%.luau$")
		if name then
			name = string.gsub(name, "%.server$", "")
			name = string.gsub(name, "%.client$", "")
			if parent == nil or parent:FindFirstChild(name) == nil then
				table.insert(missing, name)
			end
		end
	end
	return table.concat(missing, ", ")
end
local sss = place:GetService("ServerScriptService")
local sps = place:GetService("StarterPlayer"):FindFirstChild("StarterPlayerScripts")
local shared = place:GetService("ReplicatedStorage"):FindFirstChild("Shared")
check(
	missingFrom("src/server", sss) == "",
	"every src/server script is in ServerScriptService",
	missingFrom("src/server", sss)
)
check(
	missingFrom("src/client", sps) == "",
	"every src/client script is in StarterPlayerScripts",
	missingFrom("src/client", sps)
)
check(
	missingFrom("src/shared", shared) == "",
	"every src/shared module is in ReplicatedStorage.Shared",
	missingFrom("src/shared", shared)
)

-- 5. YOUR game's rules on the placed parts go here (each as a check(...) call).

finish()
