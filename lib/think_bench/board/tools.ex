defmodule ThinkBench.Board.Tools do
  @moduledoc """
  Implementations behind `ThinkBench.Board.Actions`. Each write goes through
  `ThinkBench.Graph` and is its own transaction.

  The acting actor is, in order: the tool's `actor` argument, the actor the request
  resolved from its `X-Actor` header (`ThinkBenchWeb.Plugs.McpActor`), `claude-code`.
  """

  alias Ash.Error.Action.InvalidArgument
  alias ThinkBench.Board.Json
  alias ThinkBench.Graph
  alias ThinkBench.Graph.Actor

  @default_actor "claude-code"

  @doc "The default MCP actor name."
  def default_actor_name, do: @default_actor

  @doc """
  Resolves an actor name to a seeded actor. `nil` (or blank) means `claude-code`,
  which is created if the database was never seeded, so MCP writes never lack an
  actor. Any other name must already exist.
  """
  def resolve_actor(name) when name in [nil, ""], do: Graph.create_actor(@default_actor, :agent)

  def resolve_actor(name) when is_binary(name) do
    case Graph.get_actor(String.trim(name)) do
      {:ok, actor} ->
        {:ok, actor}

      {:error, _} ->
        known = Graph.list_actors!() |> Enum.map_join(", ", & &1.name)
        {:error, "no actor named #{inspect(name)}; known actors: #{known}"}
    end
  end

  def read_board(input, context) do
    opts =
      input.arguments
      |> Map.take([:kinds, :tags, :include_archived])
      |> Enum.reject(fn {_key, value} -> is_nil(value) end)

    board = Graph.read_board(opts)
    record_look(context, board.latest_seq)
    names = Json.actor_names()

    {:ok,
     %{
       latest_seq: board.latest_seq,
       cards: Enum.map(board.cards, &Json.card(&1, names)),
       links: Enum.map(board.links, &Json.link/1),
       regions: Enum.map(board.regions, &Json.region/1)
     }}
  end

  def read_card(input, _context) do
    load = [links_out: [:grammar, :to_card], links_in: [:grammar, :from_card]]

    with {:ok, card} <- Graph.get_card(input.arguments.id, load: load) do
      {:ok, Json.card_detail(card, Json.actor_names())}
    end
  end

  def read_selection(_input, _context) do
    card_ids =
      case Graph.get_selection!() do
        nil -> []
        selection -> selection.card_ids
      end

    names = Json.actor_names()
    cards = Enum.map(Graph.cards_in_order(card_ids), &Json.card(&1, names))

    {:ok, %{card_ids: Enum.map(cards, & &1.id), cards: cards}}
  end

  def changes_since(input, context) do
    page = Graph.page_changes(input.arguments.seq)
    record_look(context, page.latest_seq)
    names = Json.actor_names()

    {:ok,
     %{
       latest_seq: page.latest_seq,
       has_more: page.has_more,
       events: Enum.map(page.events, &Json.event(&1, names))
     }}
  end

  def create_card(input, context) do
    with {:ok, actor} <- actor(input, context),
         {:ok, attrs} <- with_position(input.arguments),
         {:ok, card} <- Graph.create_card(attrs, actor: actor) do
      {:ok, %{seq: card.__metadata__.seq, card: Json.card(card, Json.actor_names())}}
    end
  end

  def update_card(input, context) do
    changes = Map.take(input.arguments, [:title, :body, :tags, :status, :pinned])

    with {:ok, actor} <- actor(input, context),
         :ok <- require_changes(changes, ~w(title body tags status pinned)a),
         {:ok, card} <- Graph.get_card(input.arguments.id),
         {:ok, card} <- Graph.update_card(card, changes, actor: actor) do
      {:ok, %{seq: card.__metadata__.seq, card: Json.card(card, Json.actor_names())}}
    end
  end

  def move_card(input, context) do
    %{id: id, x: x, y: y} = input.arguments

    with {:ok, actor} <- actor(input, context),
         {:ok, card} <- Graph.get_card(id),
         {:ok, card} <- Graph.move_card(card, x, y, actor: actor) do
      {:ok, %{seq: card.__metadata__.seq, card: Json.card(card, Json.actor_names())}}
    end
  end

  def archive_card(input, context) do
    with {:ok, actor} <- actor(input, context),
         {:ok, card} <- Graph.get_card(input.arguments.id),
         {:ok, card} <- Graph.archive_card(card, actor: actor) do
      {:ok, %{seq: card.__metadata__.seq, card: Json.card(card, Json.actor_names())}}
    end
  end

  def link(input, context) do
    %{from: from, to: to, type: type} = input.arguments

    with {:ok, actor} <- actor(input, context),
         {:ok, link} <- Graph.link(from, to, type, actor: actor) do
      {:ok, %{seq: link.__metadata__.seq, link: Json.link(link)}}
    end
  end

  def unlink(input, context) do
    with {:ok, actor} <- actor(input, context),
         {:ok, link} <- find_link(input.arguments),
         {:ok, link} <- Graph.unlink(link, actor: actor) do
      {:ok, %{seq: link.__metadata__.seq, link: Json.link(link)}}
    end
  end

  def create_region(input, context) do
    with {:ok, actor} <- actor(input, context),
         {:ok, region} <-
           Graph.create_region(Map.take(input.arguments, [:title, :x, :y, :w, :h]), actor: actor) do
      {:ok, %{seq: region.__metadata__.seq, region: Json.region(region)}}
    end
  end

  def update_region(input, context) do
    changes = Map.take(input.arguments, [:title, :x, :y, :w, :h])

    with {:ok, actor} <- actor(input, context),
         :ok <- require_changes(changes, ~w(title x y w h)a),
         {:ok, region} <- Graph.get_region(input.arguments.id),
         {:ok, region} <- Graph.update_region(region, changes, actor: actor) do
      {:ok, %{seq: region.__metadata__.seq, region: Json.region(region)}}
    end
  end

  def destroy_region(input, context) do
    with {:ok, actor} <- actor(input, context),
         {:ok, region} <- Graph.get_region(input.arguments.id),
         {:ok, region} <- Graph.destroy_region(region, actor: actor) do
      {:ok, %{seq: region.__metadata__.seq, region: Json.region(region)}}
    end
  end

  # Remembers the cursor a read handed the agent. Best effort: a failed record
  # never fails the read. A missing actor is skipped — a look does not create one.
  defp record_look(context, seq) do
    case context do
      %{actor: %Actor{} = actor} -> Graph.record_agent_look(actor, seq)
      _ -> :ignored
    end
  end

  defp actor(input, context) do
    case {Map.get(input.arguments, :actor), context.actor} do
      {nil, %Actor{} = actor} ->
        {:ok, actor}

      {name, _} ->
        with {:error, message} <- resolve_actor(name), do: invalid(:actor, message)
    end
  end

  defp with_position(arguments) do
    attrs =
      arguments
      |> Map.take([:kind, :title, :body, :tags, :x, :y])
      |> Map.reject(fn {_key, value} -> is_nil(value) end)

    case {attrs[:x], attrs[:y]} do
      {nil, nil} ->
        {:ok, Map.drop(attrs, [:x, :y])}

      {x, y} when is_integer(x) and is_integer(y) ->
        {:ok, attrs}

      _ ->
        invalid(:x, "pass both x and y, or neither to place the card automatically")
    end
  end

  defp require_changes(changes, _fields) when map_size(changes) > 0, do: :ok

  defp require_changes(_changes, fields),
    do: invalid(:id, "pass at least one of #{Enum.join(fields, ", ")} to change")

  defp find_link(%{id: id}) when is_binary(id), do: Graph.get_link(id)

  defp find_link(%{from: from, to: to, type: type})
       when is_binary(from) and is_binary(to) and is_binary(type) do
    case Graph.find_link(from, to, type) do
      {:ok, nil} -> invalid(:type, "no #{type} link from #{from} to #{to}")
      other -> other
    end
  end

  defp find_link(_arguments), do: invalid(:id, "pass the link id, or from, to and type")

  defp invalid(field, message),
    do: {:error, InvalidArgument.exception(field: field, message: message)}
end
