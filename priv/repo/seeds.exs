# Seeds the actors and a sample graph: the prototype's scripted conversation
# (prototype/index.html), nine cards, their links and one region.
#
#     mix run priv/repo/seeds.exs
#
# Idempotent. Cards are matched by title, links by (from, to, type), regions by
# title. Follow-up changes in the script (resolving a question, moving a card) are
# applied only to cards created by this run, so re-running never undoes later edits.
# Every write goes through ThinkBench.Graph, so the event log records the seed too.

alias ThinkBench.Graph

robert = Graph.create_actor!("robert", :human)
claude = Graph.create_actor!("claude-code", :agent)

existing_cards = Map.new(Graph.list_cards!(%{include_archived: true}), &{&1.title, &1})

# Returns {cards_by_key, keys_created_this_run}.
put_card = fn {cards, created}, key, actor, attrs ->
  case Map.fetch(existing_cards, attrs.title) do
    {:ok, card} -> {Map.put(cards, key, card), created}
    :error -> {Map.put(cards, key, Graph.create_card!(attrs, actor: actor)), [key | created]}
  end
end

put_link = fn {cards, _created} = acc, from, to, type ->
  from_id = cards[from].id
  to_id = cards[to].id

  if is_nil(Graph.find_link!(from_id, to_id, type)) do
    Graph.link!(from_id, to_id, type, actor: claude)
  end

  acc
end

if_created = fn {cards, created} = acc, key, fun ->
  if key in created, do: fun.(cards[key])
  acc
end

{_cards, _created} =
  {%{}, []}
  # Turn 1
  |> put_card.(:c1, claude, %{
    kind: :idea,
    title: "Shared board beside chat",
    body: "A visual space both of us can read and write, alongside the conversation.",
    x: 80,
    y: 80,
    tags: ["core"]
  })
  |> put_card.(:c2, claude, %{
    kind: :question,
    title: "Source of truth: board or chat?",
    body: "If both can change things, which one wins when they disagree?",
    x: 380,
    y: 60
  })
  |> put_link.(:c2, :c1, "raised-by")
  # Turn 2
  |> put_card.(:c3, claude, %{
    kind: :decision,
    title: "Chat is primary; board is memory",
    body:
      "Turn-based. The AI updates the board as the conversation produces ideas, decisions and questions.",
    x: 380,
    y: 250,
    tags: ["settled"]
  })
  |> put_link.(:c3, :c2, "answers")
  |> if_created.(:c2, &Graph.update_card!(&1, %{status: :resolved}, actor: claude))
  |> put_card.(:c4, claude, %{
    kind: :idea,
    title: "Board as cross-session memory",
    body: "A new session starts by reading the board, not the transcript.",
    x: 80,
    y: 300
  })
  |> put_link.(:c4, :c3, "follows-from")
  # Turn 3
  |> put_card.(:c5, claude, %{
    kind: :source,
    title: "Agent SDK docs: no subscription auth",
    body:
      "“Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products.”",
    x: 720,
    y: 60,
    tags: ["docs"]
  })
  |> put_card.(:c6, claude, %{
    kind: :objection,
    title: "App cannot host the model on a subscription",
    body: "Any design where the app launches Claude sessions pays API rates.",
    x: 720,
    y: 250
  })
  |> put_link.(:c6, :c5, "cites")
  |> put_card.(:c7, claude, %{
    kind: :decision,
    title: "Invert it: app is an MCP server, Claude Code is the client",
    body:
      "Chat stays in the terminal on the subscription. The board is a tool Claude connects to.",
    x: 720,
    y: 440,
    tags: ["settled", "architecture"]
  })
  |> put_link.(:c7, :c6, "resolves")
  |> put_link.(:c7, :c3, "depends-on")
  |> tap(fn _ ->
    if not Enum.any?(Graph.list_regions!(), &(&1.title == "Model hosting")) do
      Graph.create_region!(%{title: "Model hosting", x: 700, y: 20, w: 270, h: 560},
        actor: claude
      )
    end
  end)
  # Turn 4 (the prototype proposed this card; proposals were dropped, so it is direct)
  |> put_card.(:c8, claude, %{
    kind: :objection,
    title: "Each session starts cold",
    body:
      "Claude Code forgets the last conversation. The board must be complete enough to stand in for it.",
    x: 380,
    y: 470
  })
  |> put_link.(:c8, :c7, "challenges")
  # Turn 5: Robert rearranges and adds a card, then Claude links and resolves
  |> if_created.(:c4, &Graph.move_card!(&1, 80, 480, actor: robert))
  |> put_card.(:c9, robert, %{
    kind: :question,
    title: "Voice capture from my phone?",
    body: "Ideas arrive away from the desk. How do they get onto the board?",
    x: 80,
    y: 650
  })
  |> put_link.(:c4, :c8, "answers")
  |> if_created.(:c8, &Graph.update_card!(&1, %{status: :resolved}, actor: claude))
