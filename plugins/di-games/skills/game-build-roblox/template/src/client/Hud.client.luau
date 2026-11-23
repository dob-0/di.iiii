--!strict
-- Thin client: shows what the server sends about the round. No rules here.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local remote = ReplicatedStorage:WaitForChild(Config.REMOTE_ROUND_UPDATE) :: RemoteEvent

type RoundUpdate = {
	state: string,
	timeLeft: number,
	items: number,
	itemsNeeded: number,
	finishOpen: boolean,
}

local gui = Instance.new("ScreenGui")
gui.Name = "Hud"
gui.ResetOnSpawn = false
gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")

local label = Instance.new("TextLabel")
label.Size = UDim2.fromOffset(360, 44)
label.Position = UDim2.fromOffset(12, 12)
label.BackgroundColor3 = Color3.new(0, 0, 0)
label.BackgroundTransparency = 0.4
label.TextColor3 = Color3.new(1, 1, 1)
label.TextSize = 22
label.Font = Enum.Font.GothamMedium
label.Text = "Waiting for players"
label.Parent = gui

remote.OnClientEvent:Connect(function(update: RoundUpdate)
	if update.state == "won" then
		label.Text = "Round won"
	elseif update.state == "lost" then
		label.Text = "Time is up"
	elseif update.state == "running" then
		label.Text = `Items {update.items}/{update.itemsNeeded}   Time {update.timeLeft}`
	end
end)
