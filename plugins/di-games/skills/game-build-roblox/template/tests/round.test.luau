--!strict
local Config = require("../src/shared/Config")
local Round = require("../src/shared/logic/Round")

local function running()
	local r = Round.new(Config)
	Round.playerArrived(r)
	return r
end

local function findAll(r: Round.Round)
	for i = 1, Config.ITEMS_NEEDED do
		Round.addItem(r, `item{i}`)
	end
end

return function(h)
	h.test("a new round waits for the first player; time does not run", function()
		local r = Round.new(Config)
		h.eq(r.state, "waiting")
		h.eq(Round.update(r, 100), nil)
		h.near(r.timeLeft, Config.ROUND_SECONDS)
	end)

	h.test("the first player starts it; later players change nothing", function()
		local r = Round.new(Config)
		h.eq(Round.playerArrived(r), "started")
		h.eq(r.state, "running")
		h.eq(r.number, 1)
		h.eq(Round.playerArrived(r), nil)
		h.eq(r.number, 1)
	end)

	h.test("an item found by anyone counts; a repeat does not", function()
		local r = running()
		h.eq(Round.addItem(r, "item1"), true)
		h.eq(Round.addItem(r, "item1"), false)
		h.eq(Round.itemCount(r), 1)
	end)

	h.test("the last needed item opens the finish", function()
		local r = running()
		for i = 1, Config.ITEMS_NEEDED - 1 do
			h.eq(select(2, Round.addItem(r, `item{i}`)), nil)
		end
		h.eq(r.finishOpen, false)
		h.eq(select(2, Round.addItem(r, "last")), "finishOpened")
		h.eq(r.finishOpen, true)
	end)

	h.test("the finish does nothing while it is shut", function()
		local r = running()
		Round.addItem(r, "item1")
		h.eq(Round.tryFinish(r), nil)
		h.eq(r.state, "running")
	end)

	h.test("anyone reaching the open finish wins", function()
		local r = running()
		findAll(r)
		h.eq(Round.tryFinish(r), "won")
		h.eq(r.state, "won")
		h.eq(Round.tryFinish(r), nil, "second finish")
	end)

	h.test("the round is lost at 0 seconds, not before", function()
		local r = running()
		h.eq(Round.update(r, Config.ROUND_SECONDS - 1), nil)
		h.eq(r.state, "running")
		h.near(r.timeLeft, 1)
		h.eq(Round.update(r, 1), "lost")
		h.eq(r.state, "lost")
		h.near(r.timeLeft, 0)
	end)

	h.test("no items count once the round is over", function()
		local r = running()
		Round.update(r, Config.ROUND_SECONDS)
		h.eq(Round.addItem(r, "late"), false)
		h.eq(Round.itemCount(r), 0)
	end)

	h.test("a new round starts after the delay following a loss, with everything reset", function()
		local r = running()
		Round.addItem(r, "item1")
		Round.update(r, Config.ROUND_SECONDS)
		h.eq(Round.update(r, Config.NEW_ROUND_DELAY - 0.1), nil)
		h.eq(r.state, "lost")
		h.eq(Round.update(r, 0.2), "newRound")
		h.eq(r.state, "running")
		h.eq(r.number, 2)
		h.eq(Round.itemCount(r), 0)
		h.eq(r.finishOpen, false)
		h.near(r.timeLeft, Config.ROUND_SECONDS)
	end)

	h.test("a new round also follows a win after the delay", function()
		local r = running()
		findAll(r)
		Round.tryFinish(r)
		h.eq(Round.update(r, Config.NEW_ROUND_DELAY), "newRound")
		h.eq(r.number, 2)
		h.eq(r.finishOpen, false)
	end)

	h.test("three rounds in a row", function()
		local r = running()
		for n = 1, 3 do
			h.eq(r.number, n)
			h.eq(Round.update(r, Config.ROUND_SECONDS), "lost")
			Round.update(r, Config.NEW_ROUND_DELAY)
		end
		h.eq(r.number, 4)
	end)
end
