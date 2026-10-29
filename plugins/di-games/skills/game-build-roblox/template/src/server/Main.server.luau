--!strict
-- Starts the game on the server: wires the logic to the engine. Rules live in Shared/Config and Shared/logic.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local RoundService = require(script.Parent:WaitForChild("RoundService"))

local map = workspace:WaitForChild("Map")

local remote = Instance.new("RemoteEvent")
remote.Name = Config.REMOTE_ROUND_UPDATE
remote.Parent = ReplicatedStorage

local service = RoundService.start(remote, function(event)
	print("round event:", event)
end)

-- The goal zone from map/plan.json: a player who touches it asks to finish. Finding items is the
-- first thing a game adds (a pickup calls service.addItem(itemId)).
local goalZone = map:WaitForChild("Zones"):WaitForChild("GoalZone") :: BasePart
goalZone.Touched:Connect(function(hit)
	local character = hit.Parent
	if character and Players:GetPlayerFromCharacter(character :: Model) then
		service.tryFinish()
	end
end)
