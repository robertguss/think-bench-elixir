defmodule ThinkBench.Graph.Selection do
  @moduledoc """
  The cards the human has selected in the UI, one row per browser channel session.
  Not evented: selection is pointing, not a change to the graph.
  """
  use Ash.Resource,
    otp_app: :think_bench,
    domain: ThinkBench.Graph,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "selections"
    repo ThinkBench.Repo
  end

  actions do
    defaults [:read]

    create :set do
      accept [:session_id, :card_ids]
      upsert? true
      upsert_identity :unique_session
      upsert_fields [:card_ids, :updated_at]
    end

    read :current do
      description "The most recently updated selection, or the one for `session_id`."
      argument :session_id, :string
      filter expr(is_nil(^arg(:session_id)) or session_id == ^arg(:session_id))
      prepare build(sort: [updated_at: :desc], limit: 1)
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :session_id, :string do
      allow_nil? false
      public? true
    end

    attribute :card_ids, {:array, :uuid} do
      allow_nil? false
      public? true
      default []
    end

    timestamps()
  end

  identities do
    identity :unique_session, [:session_id]
  end
end
