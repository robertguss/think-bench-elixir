defmodule ThinkBench.Board.Json do
  @moduledoc """
  Compact shapes for graph records on the channel and in MCP tool results. Actors
  appear by name; timestamps and internal ids are left out unless they help.
  """

  @doc "A map of actor id to actor name. Pass a cached list to avoid a scan."
  def actor_names(actors \\ nil)
  def actor_names(nil), do: actor_names(ThinkBench.Graph.list_actors!())
  def actor_names(actors) when is_list(actors), do: Map.new(actors, &{&1.id, &1.name})
  def actor_names(names) when is_map(names), do: names

  def card(card, names) do
    %{
      id: card.id,
      kind: card.kind,
      title: card.title,
      tags: card.tags,
      status: card.status,
      pinned: card.pinned,
      x: card.x,
      y: card.y,
      created_by: Map.get(names, card.created_by_id)
    }
    |> put_present(:body, card.body)
    |> put_present(:archived, if(card.archived_at, do: true))
  end

  @doc "A card with its links out and in, each naming the card at the other end."
  def card_detail(card, names) do
    card
    |> card(names)
    |> Map.merge(%{
      links_out:
        Enum.map(card.links_out, fn link ->
          %{
            id: link.id,
            type: link.type,
            grammar: link.grammar,
            to: link.to_card_id,
            to_title: link.to_card.title
          }
        end),
      links_in:
        Enum.map(card.links_in, fn link ->
          %{
            id: link.id,
            type: link.type,
            grammar: link.grammar,
            from: link.from_card_id,
            from_title: link.from_card.title
          }
        end)
    })
  end

  def link(link) do
    %{id: link.id, from: link.from_card_id, to: link.to_card_id, type: link.type}
  end

  def region(region) do
    Map.take(region, [:id, :title, :x, :y, :w, :h])
  end

  @noise ~w(id inserted_at updated_at created_by_id)

  def event(event, names) do
    changes =
      (event.changed_attributes || %{})
      |> Map.merge(event.data || %{})
      |> Map.reject(fn {key, _value} -> to_string(key) in @noise end)

    %{
      seq: event.seq,
      actor: Map.get(names, event.actor_id),
      resource: resource_name(event.resource),
      action: event.action,
      record_id: event.record_id,
      changes: changes,
      at: event.occurred_at
    }
  end

  defp resource_name(resource) when is_atom(resource) do
    resource |> Module.split() |> List.last() |> Macro.underscore()
  end

  defp put_present(map, _key, nil), do: map
  defp put_present(map, key, value), do: Map.put(map, key, value)
end
