defmodule ThinkBenchWeb.GraphChannel do
  @moduledoc """
  `graph:main`: the board UI's live connection to the one graph.

  On join the reply carries the whole board, `latest_seq`, recent events, the actors,
  and the AI's last look. Afterwards every graph event is pushed as `"event"` with the
  current state of the record it touched, and every agent look as `"look"`.

  Inbound writes (`move_card`, `create_card`, `update_card`, `link`, `create_region`)
  run the same generic actions the MCP tools do (`ThinkBench.Mcp.Board`), acting as
  `robert`. `select` stores the selection for this socket's session, which the MCP
  `read_selection` tool returns.
  """
  use ThinkBenchWeb, :channel

  alias ThinkBench.Graph
  alias ThinkBench.Graph.{Card, Event, Link, Region}
  alias ThinkBench.Mcp.{Board, Json}

  @recent_events 200
  @writes ~w(move_card create_card update_card link create_region)

  @impl true
  def join("graph:main", _payload, socket) do
    # Subscribe before reading so nothing committed in between is missed; the pushed
    # record snapshots are idempotent, so a duplicate is harmless.
    Graph.subscribe()
    Graph.subscribe_looks()

    with {:ok, robert} <- robert() do
      {:ok, board_payload(socket), assign(socket, :robert, robert)}
    end
  end

  @impl true
  def handle_in("select", %{"card_ids" => ids}, socket) when is_list(ids) do
    case Graph.set_selection(socket.assigns.session_id, ids) do
      {:ok, selection} -> {:reply, {:ok, %{card_ids: selection.card_ids}}, socket}
      {:error, error} -> {:reply, {:error, %{message: message(error)}}, socket}
    end
  end

  def handle_in(action, params, socket) when action in @writes and is_map(params) do
    params = Map.delete(params, "actor")

    result =
      Board
      |> Ash.ActionInput.for_action(String.to_existing_atom(action), params,
        actor: socket.assigns.robert
      )
      |> Ash.run_action()

    case result do
      {:ok, result} -> {:reply, {:ok, result}, socket}
      {:error, error} -> {:reply, {:error, %{message: message(error)}}, socket}
    end
  end

  def handle_in(event, _params, socket) do
    {:reply, {:error, %{message: "unknown message #{inspect(event)}"}}, socket}
  end

  @impl true
  def handle_info({:event, %Event{} = event}, socket) do
    names = Json.actor_names()
    push(socket, "event", Map.merge(%{event: Json.event(event, names)}, record(event, names)))
    {:noreply, socket}
  end

  def handle_info({:look, look}, socket) do
    push(socket, "look", %{look: look_json(look)})
    {:noreply, socket}
  end

  defp robert do
    case Graph.get_actor("robert") do
      {:ok, actor} -> {:ok, actor}
      {:error, _} -> {:error, %{reason: "no robert actor; run the seeds"}}
    end
  end

  defp board_payload(socket) do
    board = Graph.read_board()
    names = Json.actor_names()

    events =
      Event
      |> Ash.Query.sort(id: :desc)
      |> Ash.Query.limit(@recent_events)
      |> Ash.read!()
      |> Enum.reverse()

    %{
      session_id: socket.assigns.session_id,
      latest_seq: board.latest_seq,
      cards: Enum.map(board.cards, &Json.card(&1, names)),
      links: Enum.map(board.links, &Json.link/1),
      regions: Enum.map(board.regions, &Json.region/1),
      events: Enum.map(events, &Json.event(&1, names)),
      actors: Enum.map(Graph.list_actors!(), &%{name: &1.name, kind: &1.kind}),
      look: look_json(Graph.latest_look!())
    }
  end

  # The current state of the record an event touched, so the UI applies a snapshot
  # rather than replaying event payloads. A record that no longer exists is `removed`.
  defp record(%Event{resource: Card, record_id: id}, names) do
    case Ash.get(Card, id) do
      {:ok, card} -> %{card: Json.card(card, names)}
      _ -> %{removed: %{resource: "card", id: id}}
    end
  end

  defp record(%Event{resource: Link, record_id: id}, _names) do
    case Ash.get(Link, id) do
      {:ok, link} -> %{link: Json.link(link)}
      _ -> %{removed: %{resource: "link", id: id}}
    end
  end

  defp record(%Event{resource: Region, record_id: id}, _names) do
    case Ash.get(Region, id) do
      {:ok, region} -> %{region: Json.region(region)}
      _ -> %{removed: %{resource: "region", id: id}}
    end
  end

  defp record(_event, _names), do: %{}

  defp look_json(nil), do: nil
  defp look_json(look), do: %{actor: look.actor.name, seq: look.seq, at: look.updated_at}

  defp message(error) do
    error
    |> Ash.Error.to_error_class()
    |> Map.get(:errors, [])
    |> Enum.map_join("; ", fn
      %{field: field} = e when not is_nil(field) -> "#{field}: #{Exception.message(e)}"
      e -> Exception.message(e)
    end)
  end
end
