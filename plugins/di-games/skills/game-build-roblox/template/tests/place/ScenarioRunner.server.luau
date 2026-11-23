--!nonstrict
-- TEST ONLY (never in the shipped place; scripts/check_no_test_code.luau fails the build if it is): scripted scenarios IN the place.
-- Method (skill game-playtest): the server sets up each case itself, waits, measures, and prints ONE line per case:
--   TEST <case> PASS|FAIL <numbers>        and at the end        TEST DONE <passed>/<total>
-- The driver (skill game-playtest, scripts/scenario.sh) only starts Play and reads Studio's log for those lines.
-- No click by screen coordinates, no client-side bot (a client bot did not see the server's NPC in the real games).
-- Build the test place with scripts/build-test.sh. Add one `addCase` per rule of docs/design.md section 8 that needs the engine.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))

local cases: { { name: string, run: () -> (boolean, string) } } = {}
local function addCase(name: string, run: () -> (boolean, string))
	table.insert(cases, { name = name, run = run })
end

local function waitForCharacter(): Model?
	local player = Players:GetPlayers()[1] or Players.PlayerAdded:Wait()
	return player.Character or player.CharacterAdded:Wait()
end

-- Example cases (generic: keep or replace). A case returns ok and the numbers that justify it.
addCase("map_has_parts", function()
	local count = 0
	for _, d in workspace:WaitForChild("Map"):GetDescendants() do
		if d:IsA("BasePart") then
			count += 1
		end
	end
	return count > 0, `parts={count}`
end)

addCase("player_spawns_on_the_map", function()
	local character = waitForCharacter()
	local root = character and character:WaitForChild("HumanoidRootPart", 10)
	if root == nil then
		return false, "no character"
	end
	task.wait(1)
	local y = (root :: BasePart).Position.Y
	return y > -5 and y < 100, `y={string.format("%.1f", y)}`
end)

addCase("round_length_is_config", function()
	return Config.ROUND_SECONDS > 0, `ROUND_SECONDS={Config.ROUND_SECONDS}`
end)

-- Template for a game case: place the player, start the situation, move it with Humanoid:MoveTo, wait, measure, return.
-- addCase("player_cannot_walk_through_wall", function() ... end)

print("TEST START")
local passed = 0
for _, c in cases do
	local ran, good, numbers = pcall(c.run)
	if not ran then
		good, numbers = false, "error: " .. tostring(good)
	end
	if good then
		passed += 1
	end
	print(`TEST {c.name} {if good then "PASS" else "FAIL"} {numbers}`)
end
print(`TEST DONE {passed}/{#cases}`)
