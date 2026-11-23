--!strict
-- Thin service: connects the pure Round logic to the engine. No rules here.
-- Every decision lives in src/shared/logic/Round.luau and is tested with Lune.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Round = require(Shared:WaitForChild("logic"):WaitForChild("Round"))

local RoundService = {}

export type Service = {
	round: Round.Round,
	addItem: (itemId: string) -> (),
	tryFinish: () -> (),
}

-- Starts the round loop. `onEvent` hears every event the logic returns ("started", "won", ...).
function RoundService.start(remote: RemoteEvent, onEvent: (event: Round.Event) -> ()): Service
	local round = Round.new(Config)

	local function publish()
		remote:FireAllClients({
			state = round.state,
			timeLeft = math.ceil(round.timeLeft),
			items = Round.itemCount(round),
			itemsNeeded = Config.ITEMS_NEEDED,
			finishOpen = round.finishOpen,
		})
	end

	local function handle(event: Round.Event?)
		if event then
			onEvent(event)
			publish()
		end
	end

	Players.PlayerAdded:Connect(function()
		handle(Round.playerArrived(round))
	end)
	if #Players:GetPlayers() > 0 then
		handle(Round.playerArrived(round))
	end

	local sinceSend = 0
	RunService.Heartbeat:Connect(function(dt)
		handle(Round.update(round, dt))
		sinceSend += dt
		if sinceSend >= 1 then
			sinceSend = 0
			publish()
		end
	end)

	return {
		round = round,
		addItem = function(itemId)
			local _, event: Round.Event? = Round.addItem(round, itemId)
			handle(event)
		end,
		tryFinish = function()
			handle(Round.tryFinish(round))
		end,
	}
end

return RoundService
