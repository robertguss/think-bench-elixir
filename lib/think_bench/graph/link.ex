defmodule ThinkBench.Graph.Link do
  @moduledoc """
  A typed, directed link between two cards.

  Known types are `answers resolves raised-by follows-from depends-on challenges cites`;
  other types are allowed. `grammar` maps a type onto TheBrain's structure: the
  hierarchical types are `:hierarchy`, `cites` and unknown types are `:jump`.
  """
  use Ash.Resource,
    otp_app: :think_bench,
    domain: ThinkBench.Graph,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshEvents.Events]

  alias ThinkBench.Graph.{Changes, Vocabulary}

  @hierarchy_types Vocabulary.hierarchy_types()

  postgres do
    table "links"
    repo ThinkBench.Repo

    references do
      reference :from_card, on_delete: :restrict
      reference :to_card, on_delete: :restrict
    end
  end

  events do
    event_log ThinkBench.Graph.Event
    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    read :among do
      argument :card_ids, {:array, :uuid}, allow_nil?: false

      filter expr(from_card_id in ^arg(:card_ids) and to_card_id in ^arg(:card_ids))
    end

    read :by_endpoints do
      argument :from_card_id, :uuid, allow_nil?: false
      argument :to_card_id, :uuid, allow_nil?: false
      argument :type, :string, allow_nil?: false

      filter expr(
               from_card_id == ^arg(:from_card_id) and to_card_id == ^arg(:to_card_id) and
                 type == ^arg(:type)
             )
    end

    create :create do
      accept [:from_card_id, :to_card_id, :type]
      change Changes.SetCreatedBy
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

    attribute :type, :string do
      allow_nil? false
      public? true
    end

    timestamps()
  end

  relationships do
    belongs_to :from_card, ThinkBench.Graph.Card do
      allow_nil? false
      public? true
    end

    belongs_to :to_card, ThinkBench.Graph.Card do
      allow_nil? false
      public? true
    end

    belongs_to :created_by, ThinkBench.Graph.Actor do
      allow_nil? false
      public? true
    end
  end

  calculations do
    calculate :grammar,
              :atom,
              expr(if type in ^@hierarchy_types, do: :hierarchy, else: :jump),
              constraints: [one_of: [:hierarchy, :jump]],
              public?: true
  end

  identities do
    identity :unique_link, [:from_card_id, :to_card_id, :type]
  end
end
