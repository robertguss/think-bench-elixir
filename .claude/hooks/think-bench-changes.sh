#!/usr/bin/env bash
# Think Bench: UserPromptSubmit hook (optional, disabled by default).
#
# Before each prompt, asks the board for events after a cursor kept in a temp file.
# If the human (or another actor) changed the board since the last prompt, it prints a
# compact summary; Claude Code adds hook stdout to the prompt as context. It prints
# nothing when there is nothing new, and never blocks a prompt if the server is down.
#
# Enable: see README "Optional: board-change hook". Needs curl and jq.
# Env: THINK_BENCH_MCP_URL (default http://localhost:4000/mcp),
#      THINK_BENCH_HOOK_CURSOR (default $TMPDIR/think-bench-hook-cursor-<project hash>).

set -u

url="${THINK_BENCH_MCP_URL:-http://localhost:4000/mcp}"
project="${CLAUDE_PROJECT_DIR:-$PWD}"
hash=$(printf '%s' "$project" | shasum | cut -c1-12)
cursor_file="${THINK_BENCH_HOOK_CURSOR:-${TMPDIR:-/tmp}/think-bench-hook-cursor-$hash}"
max_lines=12

command -v jq >/dev/null 2>&1 || exit 0
cat >/dev/null # drain the hook's JSON on stdin; we don't need it

call() { # call <tool> <input-json>; prints the tool's result JSON, fails on any error
  local body
  body=$(jq -cn --arg name "$1" --argjson input "$2" \
    '{jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: $name, arguments: {input: $input}}}')
  curl -sf --max-time 3 "$url" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d "$body" |
    jq -ce 'select(.result.isError != true) | .result.content[0].text | fromjson'
}

cursor=$(cat "$cursor_file" 2>/dev/null)

if ! [[ "$cursor" =~ ^[0-9]+$ ]]; then
  # First prompt: start at the head of the log rather than replaying all history.
  head=$(call changes_since '{"seq": 9007199254740991}' | jq -r '.latest_seq') || exit 0
  [[ "$head" =~ ^[0-9]+$ ]] && printf '%s' "$head" >"$cursor_file"
  exit 0
fi

changes=$(call changes_since "{\"seq\": $cursor}") || exit 0
latest=$(jq -r '.latest_seq' <<<"$changes")
[[ "$latest" =~ ^[0-9]+$ ]] && printf '%s' "$latest" >"$cursor_file"

# Only events by someone other than claude-code are news to the AI.
count=$(jq '[.events[] | select(.actor != "claude-code")] | length' <<<"$changes")
[[ "$count" -gt 0 ]] || exit 0

board=$(call read_board '{"include_archived": true}') || board='{"cards": []}'

jq -r --argjson board "$board" --argjson max "$max_lines" --arg cursor "$cursor" '
  ($board.cards | map({(.id): .title}) | add // {}) as $titles
  | ($board.cards | map({(.id): .}) | add // {}) as $cards
  | def t($id): "\"" + ($titles[$id] // (.changes.title // ($id[0:8]))) + "\"";
    [.events[] | select(.actor != "claude-code")] as $ev
  | "Think Bench: \($ev | length) board change(s) by others since seq \($cursor) (latest_seq \(.latest_seq)). Call changes_since(\($cursor)) for details; advance your cursor only as the think-bench skill says.",
    ($ev[0:$max][] |
      "- #\(.seq) \(.actor) " +
      (if .resource == "card" then
         (if .action == "create" then "created \(.changes.kind // "card") \(t(.record_id))"
          elif .action == "archive" then "archived \(t(.record_id))"
          elif (.changes | has("x") or has("y")) and (.changes | keys - ["x","y"] | length) == 0 then "moved \(t(.record_id))"
          else "updated \(t(.record_id)): \(.changes | keys | join(", "))" end)
       elif .resource == "link" then
         "\(.action) link \(t(.changes.from_card_id // "")) \(.changes.type // "") \(t(.changes.to_card_id // ""))"
       else "\(.action) \(.resource) \(.changes.title // "")" end)),
    (if ($ev | length) > $max then "- … and \(($ev | length) - $max) more" else empty end)
' <<<"$changes"

exit 0
