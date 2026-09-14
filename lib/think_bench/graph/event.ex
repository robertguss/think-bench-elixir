defmodule ThinkBench.Graph.Event do
  @moduledoc """
  Append-only log of every create, update and destroy on cards, links and regions,
  written by ash_events in the same transaction as the change.

  `id` is a bigserial and is exposed as `seq`. ash_events takes a global
  transaction-scoped advisory lock before inserting an event, so events are inserted
  one transaction at a time and `seq` order is commit order: a reader that has seen
  seq N will never later see a new event with seq <= N.

  `data` holds the action input; `changed_attributes` holds everything else the action
  set (ids, defaults, timestamps, creator).
  """
  use Ash.Resource,
    otp_app: :think_bench,
    domain: ThinkBench.Graph,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshEvents.EventLog]

  postgres do
    table "events"
    repo ThinkBench.Repo
  end

  event_log do
    primary_key_type :integer
    persist_actor_primary_key :actor_id, ThinkBench.Graph.Actor
    public_fields :all
  end

  code_interface do
    define :latest_for_record, action: :latest_for_record, args: [:record_id], get?: true
  end

  actions do
    defaults [:read]

    read :since do
      argument :seq, :integer, allow_nil?: false, constraints: [min: 0]
      filter expr(id > ^arg(:seq))
      prepare build(sort: [id: :asc])
    end

    read :latest do
      prepare build(sort: [id: :desc], limit: 1)
    end

    read :recent do
      prepare build(sort: [id: :desc])
    end

    read :latest_for_record do
      argument :record_id, :uuid, allow_nil?: false
      filter expr(record_id == ^arg(:record_id))
      prepare build(sort: [id: :desc], limit: 1)
    end
  end

  preparations do
    prepare build(load: [:seq])
  end

  relationships do
    belongs_to :actor, ThinkBench.Graph.Actor do
      define_attribute? false
      source_attribute :actor_id
      attribute_type :uuid
      public? true
    end
  end

  calculations do
    calculate :seq, :integer, expr(id), public?: true
  end
end
