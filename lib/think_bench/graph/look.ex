defmodule ThinkBench.Graph.Look do
  @moduledoc """
  When an agent last looked at the board: the `latest_seq` its most recent `read_board`
  or `changes_since` returned. One row per actor. Not evented: looking is not a change
  to the graph. The UI uses it to show "changes since the AI last looked".
  """
  use Ash.Resource,
    otp_app: :think_bench,
    domain: ThinkBench.Graph,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "looks"
    repo ThinkBench.Repo

    references do
      reference :actor, on_delete: :delete
    end
  end

  actions do
    defaults [:read]

    create :record do
      accept [:actor_id, :seq]
      upsert? true
      upsert_identity :unique_actor
      upsert_fields [:seq, :updated_at]
    end

    read :latest do
      description "The most recent look by any agent."
      filter expr(actor.kind == :agent)
      prepare build(sort: [updated_at: :desc], limit: 1, load: [:actor])
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :seq, :integer do
      allow_nil? false
      public? true
      constraints min: 0
    end

    timestamps()
  end

  relationships do
    belongs_to :actor, ThinkBench.Graph.Actor do
      allow_nil? false
      public? true
    end
  end

  identities do
    identity :unique_actor, [:actor_id]
  end
end
