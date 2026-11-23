--!strict
-- Every number of docs/design.md lives here, by name. Nothing else hard-codes a rule.
-- Add the number here first, then use it. Sections 3 and 8 of the design name the rules.

export type SoundEntry = { Name: string, SoundId: string, Volume: number }

local Config = {
	-- Round (design section 3)
	ROUND_SECONDS = 180,
	ITEMS_NEEDED = 3,
	NEW_ROUND_DELAY = 10,

	-- Sounds. An empty SoundId is silent. Add an id only with its row in assets.csv.
	SOUNDS = {} :: { [string]: SoundEntry },

	-- Remote names (server and client agree on these)
	REMOTE_ROUND_UPDATE = "RoundUpdate",
}

return Config
