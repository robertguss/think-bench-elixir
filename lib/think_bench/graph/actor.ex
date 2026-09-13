defmodule ThinkBench.Graph.Actor do
  @moduledoc "Who did something: Robert, or a named agent such as `claude-code`."
  use Ash.Resource,
    otp_app: :think_bench,
    domain: ThinkBench.Graph,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "actors"
    repo ThinkBench.Repo
  end

  actions do
    defaults [:read]

    create :create do
      accept [:name, :kind]
      upsert? true
      upsert_identity :unique_name
      upsert_fields [:kind]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :kind, :atom do
      allow_nil? false
      public? true
      constraints one_of: [:human, :agent]
    end

    timestamps()
  end

  identities do
    identity :unique_name, [:name]
  end
end
