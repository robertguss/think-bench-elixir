defmodule ThinkBench.Graph.Region do
  @moduledoc "A titled rectangle on the map that groups a theme."
  use Ash.Resource,
    otp_app: :think_bench,
    domain: ThinkBench.Graph,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshEvents.Events]

  alias ThinkBench.Graph.Changes

  postgres do
    table "regions"
    repo ThinkBench.Repo
  end

  events do
    event_log ThinkBench.Graph.Event
    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      accept [:title, :x, :y, :w, :h]
      change Changes.SetCreatedBy
    end

    update :update do
      accept [:title, :x, :y, :w, :h]
    end

    destroy :destroy do
      primary? true
    end
  end

  policies do
    policy action_type(:read) do
      authorize_if always()
    end

    policy action_type([:create, :update, :destroy]) do
      authorize_if ThinkBench.Graph.Checks.GraphActor
    end
  end

  changes do
    change Changes.PublishEvent, on: [:create, :update, :destroy]
  end

  attributes do
    uuid_primary_key :id

    attribute :title, :string do
      allow_nil? false
      public? true
    end

    attribute :x, :integer, allow_nil?: false, public?: true
    attribute :y, :integer, allow_nil?: false, public?: true
    attribute :w, :integer, allow_nil?: false, public?: true, constraints: [min: 1]
    attribute :h, :integer, allow_nil?: false, public?: true, constraints: [min: 1]

    timestamps()
  end

  relationships do
    belongs_to :created_by, ThinkBench.Graph.Actor do
      allow_nil? false
      public? true
    end
  end
end
