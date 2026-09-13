defmodule ThinkBench.Graph do
  @moduledoc """
  The one graph: cards, typed links between them, regions on the map, the actors who
  write them, and the append-only event log of every change.

  Writes to cards, links and regions need an actor (`actor: %ThinkBench.Graph.Actor{}`).
  Each successful write records exactly one `ThinkBench.Graph.Event` in the same
  transaction and, after commit, broadcasts `{:event, event}` on `ThinkBench.PubSub`
  topic `"graph"`. The written record carries that event in its metadata:
  `record.__metadata__.event` and `record.__metadata__.seq`.
  """
  use Ash.Domain, otp_app: :think_bench

  alias ThinkBench.Graph.Event

  @pubsub ThinkBench.PubSub
  @topic "graph"
  @looks_topic "graph:looks"

  resources do
    resource ThinkBench.Graph.Actor do
      define :create_actor, action: :create, args: [:name, :kind]
      define :get_actor, action: :read, get_by: [:name]
      define :list_actors, action: :read
    end

    resource ThinkBench.Graph.Card do
      define :list_cards, action: :board
      define :get_card, action: :by_id, get_by: [:id]
      define :create_card, action: :create
      define :update_card, action: :update
      define :move_card, action: :move, args: [:x, :y]
      define :archive_card, action: :archive
    end

    resource ThinkBench.Graph.Link do
      define :list_links, action: :read
      define :get_link, action: :read, get_by: [:id]

      define :find_link,
        action: :by_endpoints,
        args: [:from_card_id, :to_card_id, :type],
        get?: true,
        not_found_error?: false

      define :link, action: :create, args: [:from_card_id, :to_card_id, :type]

      define :unlink,
        action: :destroy,
        default_options: [return_destroyed?: true]
    end

    resource ThinkBench.Graph.Region do
      define :list_regions, action: :read
      define :create_region, action: :create
      define :update_region, action: :update

      define :destroy_region,
        action: :destroy,
        default_options: [return_destroyed?: true]
    end

    resource ThinkBench.Graph.Event do
      define :changes_since, action: :since, args: [:seq]
      define :latest_event, action: :latest, get?: true, not_found_error?: false
    end

    resource ThinkBench.Graph.Selection do
      define :set_selection, action: :set, args: [:session_id, :card_ids]
      define :get_selection, action: :current, get?: true, not_found_error?: false
    end

    resource ThinkBench.Graph.Look do
      define :record_look, action: :record, args: [:actor_id, :seq]
      define :latest_look, action: :latest, get?: true, not_found_error?: false
    end
  end

  @doc "The PubSub topic every graph event is broadcast on."
  def topic, do: @topic

  @doc "Subscribes the calling process to `{:event, %Event{}}` messages."
  def subscribe, do: Phoenix.PubSub.subscribe(@pubsub, @topic)

  @doc false
  def broadcast(%Event{} = event), do: Phoenix.PubSub.broadcast(@pubsub, @topic, {:event, event})

  @doc """
  Records that an agent looked at the board up to `seq` (the `latest_seq` a
  `read_board` or `changes_since` returned) and broadcasts `{:look, %Look{}}` on the
  `"graph:looks"` topic. Looks by human actors are not recorded.
  """
  def record_agent_look(%ThinkBench.Graph.Actor{kind: :agent} = actor, seq)
      when is_integer(seq) do
    with {:ok, look} <- record_look(actor.id, seq) do
      look = %{look | actor: actor}
      Phoenix.PubSub.broadcast(@pubsub, @looks_topic, {:look, look})
      {:ok, look}
    end
  end

  def record_agent_look(_actor, _seq), do: :ignored

  @doc "Subscribes the calling process to `{:look, %Look{}}` messages."
  def subscribe_looks, do: Phoenix.PubSub.subscribe(@pubsub, @looks_topic)

  @doc "The seq of the newest event, or 0 when the log is empty."
  def latest_seq do
    case latest_event!() do
      nil -> 0
      event -> event.seq
    end
  end

  @doc """
  The whole graph in one read: cards, the links between the returned cards, regions,
  and the `latest_seq` the snapshot is current to.

  Options: `kinds` (list of card kinds), `tags` (cards having any of these tags),
  `include_archived` (default false).
  """
  def read_board(opts \\ []) do
    # Read the cursor first so a write landing mid-read is replayed, never missed.
    latest_seq = latest_seq()

    card_input =
      opts
      |> Keyword.take([:kinds, :tags, :include_archived])
      |> Map.new()

    cards = list_cards!(card_input)
    card_ids = MapSet.new(cards, & &1.id)

    links =
      Enum.filter(list_links!(), fn link ->
        MapSet.member?(card_ids, link.from_card_id) and MapSet.member?(card_ids, link.to_card_id)
      end)

    %{cards: cards, links: links, regions: list_regions!(), latest_seq: latest_seq}
  end
end
