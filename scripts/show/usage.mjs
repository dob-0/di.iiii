// The one help text for `di show` (scripts/di/ui.mjs and scripts/show/cli.mjs both print this).
export const usage = () => [
    'di show: the show tools, read from a venue profile (scripts/show/README.md)',
    '',
    '  di show go --venue <id> [--why "<why>"]   checkpoint, soak, then GO or NO-GO (exit 0 or 1)',
    '  di show go --venue <id> --look            one quick read; never a GO (exit 3)',
    '  di show checkpoint --venue <id> "<why>"   snapshot before a change (exit 0 whole, 3 partial, 1 failed, 2 refused)',
    '  di show profile --venue <id>              the resolved profile and where each value came from',
    '  di show profile --list                    the venue profiles this machine can read',
    '  di show mark <id>                         mark THIS machine as that venue\'s (no id: print the mark)',
    '',
    'Each value: flag > DI_* env > venue file > built-in default.',
    '  --host <h> | --local   --user <u>   --api <url>   --soak <s>   --interval <s>   --temp-nogo <C>',
    '  --venues-dir <dir> (DI_VENUES_DIR)   --marker <file> (DI_VENUE_MARKER)   --session <name> (DI_SESSION)',
    'Refused (exit 2) when the machine is marked for another venue.'
].join('\n')
