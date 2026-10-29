--!strict
-- The map files place every part by an explicit CFrame. Rojo ignores "Position" (measured 2026-10-28:
-- every part sat at 0, 0, 0). A test reads a part's place from Properties.CFrame.CFrame.position.
local fs = require("@lune/fs")
local serde = require("@lune/serde")

local function walk(node: any, visit: (any) -> ())
	visit(node)
	for _, child in node.Children or {} do
		walk(child, visit)
	end
end

return function(h)
	local parts, positioned, origin, ignored = 0, 0, 0, 0
	for _, file in fs.readDir("map") do
		if string.match(file, "%.model%.json$") then
			walk(serde.decode("json", fs.readFile("map/" .. file)), function(node)
				local props = node.Properties
				if props and props.Size then
					parts += 1
					if props.Position ~= nil then
						ignored += 1
					end
					if props.CFrame then
						positioned += 1
						local p = props.CFrame.CFrame.position
						if p[1] == 0 and p[2] == 0 and p[3] == 0 then
							origin += 1
						end
					end
				end
			end)
		end
	end

	h.test("every part of the map has an explicit CFrame, none at the origin", function()
		h.eq(parts > 0, true, "the map has parts")
		h.eq(ignored, 0, "parts using Position, which Rojo ignores")
		h.eq(positioned, parts, "parts with a CFrame")
		h.eq(origin, 0, "parts at the origin")
	end)
end
