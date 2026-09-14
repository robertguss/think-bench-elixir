defmodule ThinkBenchWeb.GraphChannel do
  @moduledoc """
  `graph:main`: the board UI's live connection to the one graph.

  On join the reply carries the whole board, `latest_seq`, recent events, the actors,
  and the AI's last look. Afterwards every graph event is pushed as `"event"` with the
  current state of the record it touched, and every agent look as `"look"`.

  Inbound writes run the same generic actions the MCP tools do (`ThinkBench.Board.Actions`),
  acting as `robert`. `select` stores the selection for this socket's session, which the
  MCP `read_selection` tool returns.
  """
  use ThinkBenchWeb, :channel

  alias ThinkBench.Board.{Actions, Json}
  alias ThinkBench.Graph
  alias ThinkBench.Graph.{Card, Event, Link, Region}

  @writes ~w(move_card create_card update_card link unlink archive_card create_region update_region destroy_region)

  @impl true
  def join("graph:main", _payload, socket) do
    Graph.subscribe()
    Graph.subscribe_looks()

    with {:ok, robert} <- robert() do
      actors = Graph.list_actors!()
      names = Json.actor_names(actors)

      {:ok, board_payload(socket, actors, names),
       assign(socket, robert: robert, actor_names: names)}
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
      Actions
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
    {names, socket} = names_for(socket, event.actor_id)
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

  defp board_payload(socket, actors, names) do
    board = Graph.read_board()

    %{
      session_id: socket.assigns.session_id,
      latest_seq: board.latest_seq,
      cards: Enum.map(board.cards, &Json.card(&1, names)),
      links: Enum.map(board.links, &Json.link/1),
      regions: Enum.map(board.regions, &Json.region/1),
      events: Enum.map(Graph.recent_events(), &Json.event(&1, names)),
      actors: Enum.map(actors, &%{name: &1.name, kind: &1.kind}),
      look: look_json(Graph.latest_look!())
    }
  end

  defp names_for(socket, actor_id) do
    names = socket.assigns.actor_names

    if is_nil(actor_id) or Map.has_key?(names, actor_id) do
      {names, socket}
    else
      names = Json.actor_names()
      {names, assign(socket, :actor_names, names)}
    end
  end

  defp record(%Event{resource: Card, record_id: id}, names) do
    case Graph.get_card(id) do
      {:ok, card} -> %{card: Json.card(card, names)}
      _ -> %{removed: %{resource: "card", id: id}}
    end
  end

  defp record(%Event{resource: Link, record_id: id}, _names) do
    case Graph.get_link(id) do
      {:ok, link} -> %{link: Json.link(link)}
      _ -> %{removed: %{resource: "link", id: id}}
    end
  end

  defp record(%Event{resource: Region, record_id: id}, _names) do
    case Graph.get_region(id) do
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
