--!strict
-- The round: waiting -> running -> won | lost -> (NEW_ROUND_DELAY s) -> running again.
-- Pure state machine. Time comes in as `dt`; nothing here reads a clock or touches the engine.

export type RoundConfig = {
	ROUND_SECONDS: number,
	ITEMS_NEEDED: number,
	NEW_ROUND_DELAY: number,
}
export type State = "waiting" | "running" | "won" | "lost"
export type Event = "started" | "finishOpened" | "won" | "lost" | "newRound"

export type Round = {
	cfg: RoundConfig,
	state: State,
	number: number, -- 0 until the first player arrives, then 1, 2, ...
	timeLeft: number, -- seconds left in this round
	intermission: number, -- seconds until the next round (only after won / lost)
	items: { [string]: boolean }, -- ids of the items found this round
	finishOpen: boolean, -- true once ITEMS_NEEDED items are found: the way to finish is open
}

local Round = {}

local function startRound(self: Round): Event
	self.number += 1
	self.state = "running"
	self.timeLeft = self.cfg.ROUND_SECONDS
	self.intermission = 0
	self.items = {}
	self.finishOpen = false
	return if self.number == 1 then "started" else "newRound"
end

function Round.new(cfg: RoundConfig): Round
	return {
		cfg = cfg,
		state = "waiting",
		number = 0,
		timeLeft = cfg.ROUND_SECONDS,
		intermission = 0,
		items = {},
		finishOpen = false,
	}
end

-- The round starts when the first player arrives. Later calls change nothing.
function Round.playerArrived(self: Round): Event?
	if self.state == "waiting" then
		return startRound(self)
	end
	return nil
end

function Round.itemCount(self: Round): number
	local n = 0
	for _ in self.items do
		n += 1
	end
	return n
end

-- An item found by anyone counts for everyone. Returns true only for a new item in a running round,
-- and "finishOpened" as the second value when this item was the last one needed.
function Round.addItem(self: Round, itemId: string): (boolean, Event?)
	if self.state ~= "running" or self.items[itemId] then
		return false, nil
	end
	self.items[itemId] = true
	if not self.finishOpen and Round.itemCount(self) >= self.cfg.ITEMS_NEEDED then
		self.finishOpen = true
		return true, "finishOpened"
	end
	return true, nil
end

-- Anyone who reaches the finish while it is open wins for everyone.
function Round.tryFinish(self: Round): Event?
	if self.state == "running" and self.finishOpen then
		self.state = "won"
		self.intermission = self.cfg.NEW_ROUND_DELAY
		return "won"
	end
	return nil
end

-- Moves time on. Returns an event when the state changes.
function Round.update(self: Round, dt: number): Event?
	if self.state == "running" then
		self.timeLeft = math.max(0, self.timeLeft - dt)
		if self.timeLeft <= 0 then
			self.state = "lost"
			self.intermission = self.cfg.NEW_ROUND_DELAY
			return "lost"
		end
	elseif self.state == "won" or self.state == "lost" then
		self.intermission -= dt
		if self.intermission <= 0 then
			return startRound(self)
		end
	end
	return nil
end

return Round
