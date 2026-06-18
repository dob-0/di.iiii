#!/usr/bin/env bash
# Claude Code statusLine for di.iiii. Branch flow is dev -> main only;
# any other branch is flagged so stray work doesn't go unnoticed.
branch=$(git branch --show-current 2>/dev/null)
[ -z "$branch" ] && branch="(detached)"

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    dirty="\033[33mdirty\033[0m"
else
    dirty="\033[32mclean\033[0m"
fi

if [ "$branch" = "dev" ] || [ "$branch" = "main" ]; then
    branch_label="\033[36m${branch}\033[0m"
else
    branch_label="\033[31m⚠ ${branch} (not dev/main)\033[0m"
fi

printf "di.iiii %b | %b" "$branch_label" "$dirty"
