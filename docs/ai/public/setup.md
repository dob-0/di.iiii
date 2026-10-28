# Connect your assistant to di.iiii

> Any assistant can read what di.iiii shows the public: give it an address. To let it read more, or act for you, give it a key; the key decides how far it reaches.

The same page, for people: https://diiii.xyz/ai/setup

## Any assistant, no key

Claude on the web, ChatGPT, duck.ai, Gemini, Perplexity: anything that can open a web address. Paste one of these into the chat and ask it to read it first.

- `https://diiii.xyz/llms.txt`: the map. What di.iiii is, and where everything else is.
- `https://diiii.xyz/ai/context`: the context. What di.iiii is and the words it uses, in one page.
- `https://diiii.xyz/ai/words.md`: the words alone, one meaning each.

A line to start with:

    Read https://diiii.xyz/ai/context first, then answer in its words.

Without a key, an assistant reads only what anyone can read. A chat on the web cannot send a key, so this is as far as it goes.

## Your level, with a key

di.iiii keeps its context at six levels: public, registered, partner, crew, core, owner. Your key decides yours; the server reads it from the key, never from what the assistant says. You can ask for a lower level, never a higher one: that answer is 403.

Get a key by signing in from a terminal, once:

    curl -fsSL https://diiii.xyz/get | sh
    di login --to https://diiii.xyz

Then read your level, with the key the login saved in `~/.config/di/credentials.json` (or set `DI_TOKEN`):

    curl -H "Authorization: Bearer $DI_TOKEN" https://diiii.xyz/ai/context

## An assistant on your own machine

Claude Code, and any other assistant that speaks MCP (the Model Context Protocol), can use di.iiii as a set of tools. After `di login`, add it once:

    claude mcp add di -- di mcp --base https://diiii.xyz/serverXR

The tools: `di_find`, `di_describe`, `di_call`, `di_run`, and `di_context` (the context at your level). The assistant acts as you, never past your own access. Anything public (making a space public, an invite link, deleting) is refused unless you started it with `DI_MCP_ALLOW_PUBLIC=1`, and each call still has to carry your yes.

## The door over HTTP

For an assistant that adds tools by address, the same door runs over HTTP on a machine you choose:

    node sdk/mcp.mjs --http 8787 --base https://diiii.xyz/serverXR

Every request to it must carry `Authorization: Bearer` with an act token from the studio's Telegram bot; without one it answers 401. Over HTTP it never makes anything public.

## More

- [For apps](https://diiii.xyz/for-apps): how a program should name itself, and the limits
- [API & agents](https://diiii.xyz/wiki/api-and-agents): the API and the tools in full
- Questions: info@thedi.studio
