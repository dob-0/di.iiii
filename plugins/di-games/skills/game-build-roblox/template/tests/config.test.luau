--!strict
local Config = require("../src/shared/Config")

return function(h)
	h.test("the round numbers are usable", function()
		h.eq(Config.ROUND_SECONDS > 0, true, "ROUND_SECONDS")
		h.eq(Config.ITEMS_NEEDED >= 1, true, "ITEMS_NEEDED")
		h.eq(Config.NEW_ROUND_DELAY >= 0, true, "NEW_ROUND_DELAY")
	end)

	h.test("every sound entry has its key as name and a volume from 0 to 1", function()
		for key, sound in Config.SOUNDS do
			h.eq(sound.Name, key, "name")
			h.eq(sound.Volume >= 0 and sound.Volume <= 1, true, key)
		end
	end)
end
