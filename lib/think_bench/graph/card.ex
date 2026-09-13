defmodule ThinkBench.Graph.Card do
  @moduledoc "A note on the board: an idea, question, decision, source or objection."
  use Ash.Resource,
    otp_app: :think_bench,
    domain: ThinkBench.Graph,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshEvents.Events]

  alias ThinkBench.Graph.Changes

  postgres do
    table "cards"
    repo ThinkBench.Repo
  end

  events do
    event_log ThinkBench.Graph.Event
    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    read :board do
      argument :kinds, {:array, :atom} do
        constraints items: [one_of: [:idea, :question, :decision, :source, :objection]]
      end

      argument :tags, {:array, :string}
      argument :include_archived, :boolean, allow_nil?: false, default: false

      filter expr(^arg(:include_archived) or is_nil(archived_at))
      filter expr(is_nil(^arg(:kinds)) or kind in ^arg(:kinds))
      filter expr(is_nil(^arg(:tags)) or fragment("? && ?", tags, ^arg(:tags)))
      prepare build(sort: [inserted_at: :asc])
    end

    read :by_id do
      prepare build(load: [:created_by, :links_out, :links_in])
    end

    create :create do
      accept [:kind, :title, :body, :tags, :x, :y]
      change Changes.SetCreatedBy
    end

    update :update do
      accept [:title, :body, :tags, :status, :pinned]
    end

    update :move do
      accept [:x, :y]
      require_attributes [:x, :y]
    end

    update :archive do
      accept []
      change set_attribute(:archived_at, &DateTime.utc_now/0)
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

    attribute :kind, :atom do
      allow_nil? false
      public? true
      constraints one_of: [:idea, :question, :decision, :source, :objection]
    end

    attribute :title, :string do
      allow_nil? false
      public? true
    end

    attribute :body, :string do
      public? true
    end

    attribute :tags, {:array, :string} do
      allow_nil? false
      public? true
      default []
    end

    attribute :status, :atom do
      allow_nil? false
      public? true
      default :open
      constraints one_of: [:open, :resolved]
    end

    attribute :pinned, :boolean do
      allow_nil? false
      public? true
      default false
      description "Pinned cards are kept to hand in the Focus view's pins strip."
    end

    attribute :x, :integer do
      allow_nil? false
      public? true
      default 0
    end

    attribute :y, :integer do
      allow_nil? false
      public? true
      default 0
    end

    attribute :archived_at, :utc_datetime_usec do
      public? true
    end

    timestamps()
  end

  relationships do
    belongs_to :created_by, ThinkBench.Graph.Actor do
      allow_nil? false
      public? true
    end

    has_many :links_out, ThinkBench.Graph.Link do
      destination_attribute :from_card_id
      public? true
    end

    has_many :links_in, ThinkBench.Graph.Link do
      destination_attribute :to_card_id
      public? true
    end
  end
end
