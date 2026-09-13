defmodule ThinkBench.Mcp.Board do
  @moduledoc """
  The board as the AI sees it: one generic action per MCP tool. Descriptions here are
  what the model reads, so they say what to pass and what comes back.
  Implementations live in `ThinkBench.Mcp.Tools`.
  """
  use Ash.Resource, domain: ThinkBench.Mcp

  alias ThinkBench.Mcp.Tools

  @kinds [:idea, :question, :decision, :source, :objection]
  @actor_doc "Seeded actor to write as, e.g. robert. Omit to write as claude-code."

  actions do
    action :read_board, :map do
      description """
      Read the whole board: cards, the links between them, and regions. Call this at the start of a session. \
      Optional filters: kinds, tags (cards with any of them), include_archived. \
      Returns {latest_seq, cards, links, regions}. \
      Remember latest_seq: pass it to changes_since later to see only what changed since this read.
      """

      argument :kinds, {:array, :atom} do
        constraints items: [one_of: @kinds]
        description "Only cards of these kinds."
      end

      argument :tags, {:array, :string}, description: "Only cards having any of these tags."

      argument :include_archived, :boolean,
        default: false,
        description: "Also return archived cards."

      run &Tools.read_board/2
    end

    action :read_card, :map do
      description """
      Read one card by id, with its links. \
      Returns the card plus links_out ({id, type, grammar, to, to_title}) and links_in ({id, type, grammar, from, from_title}).
      """

      argument :id, :uuid, allow_nil?: false, description: "The card id."
      run &Tools.read_card/2
    end

    action :read_selection, :map do
      description """
      Read the cards the human has selected on the board right now. \
      Call this when they say "this", "that one" or "these". \
      Returns {card_ids, cards}; both are empty when nothing is selected.
      """

      run &Tools.read_selection/2
    end

    action :changes_since, :map do
      description """
      List every change to the board after a seq, oldest first, by anyone (human or agent). \
      Pass the latest_seq you remembered from read_board or your last changes_since (0 for all history). \
      Returns {latest_seq, has_more, events}; each event has seq, actor, resource (card, link, region), action, record_id, changes, at. \
      Remember the returned latest_seq for next time. If has_more is true, call again with it.
      """

      argument :seq, :integer do
        allow_nil? false
        constraints min: 0
        description "Return events with a seq greater than this."
      end

      run &Tools.changes_since/2
    end

    action :create_card, :map do
      description """
      Create a card. Pass kind and title; body, tags, x and y are optional. \
      Omit x and y to place the card in a free spot next to the newest card. \
      Returns {seq, card}, where seq is the event this write produced.
      """

      argument :kind, :atom do
        allow_nil? false
        constraints one_of: @kinds
        description "idea, question, decision, source or objection."
      end

      argument :title, :string, allow_nil?: false, description: "A short title."
      argument :body, :string, description: "Longer text."
      argument :tags, {:array, :string}, description: "Tags, e.g. a project name."
      argument :x, :integer, description: "Map x (left edge, pixels). Pass with y."
      argument :y, :integer, description: "Map y (top edge, pixels). Pass with x."
      argument :actor, :string, description: @actor_doc
      run &Tools.create_card/2
    end

    action :update_card, :map do
      description """
      Change a card's title, body, tags, status or pinned. Pass id and only the fields to change; \
      tags replaces the whole list. Set status to resolved when a question is answered. \
      Set pinned to true to keep a card in the human's pins (false unpins). \
      Returns {seq, card}.
      """

      argument :id, :uuid, allow_nil?: false, description: "The card id."
      argument :title, :string
      argument :body, :string
      argument :tags, {:array, :string}, description: "The complete new tag list."

      argument :status, :atom do
        constraints one_of: [:open, :resolved]
        description "open or resolved."
      end

      argument :pinned, :boolean, description: "true pins the card, false unpins it."

      argument :actor, :string, description: @actor_doc
      run &Tools.update_card/2
    end

    action :move_card, :map do
      description "Move a card on the map. Pass id, x and y (top-left, pixels). Returns {seq, card}."
      argument :id, :uuid, allow_nil?: false, description: "The card id."
      argument :x, :integer, allow_nil?: false
      argument :y, :integer, allow_nil?: false
      argument :actor, :string, description: @actor_doc
      run &Tools.move_card/2
    end

    action :archive_card, :map do
      description """
      Archive a card: it disappears from read_board (unless include_archived) but stays in history. \
      Pass id. Returns {seq, card}.
      """

      argument :id, :uuid, allow_nil?: false, description: "The card id."
      argument :actor, :string, description: @actor_doc
      run &Tools.archive_card/2
    end

    action :link, :map do
      description """
      Link two cards with a typed, directed link that reads "from <type> to", \
      e.g. a decision answers a question, an objection challenges an idea. \
      Pass from, to (card ids) and type. Returns {seq, link}.
      """

      argument :from, :uuid, allow_nil?: false, description: "The card the link starts at."
      argument :to, :uuid, allow_nil?: false, description: "The card the link points to."

      argument :type, :string do
        allow_nil? false

        description "answers, resolves, raised-by, follows-from, depends-on, challenges or cites. Other types are allowed."
      end

      argument :actor, :string, description: @actor_doc
      run &Tools.link/2
    end

    action :unlink, :map do
      description "Remove a link. Pass its id, or from, to and type. Returns {seq, link} for the removed link."
      argument :id, :uuid, description: "The link id."
      argument :from, :uuid, description: "The card the link starts at."
      argument :to, :uuid, description: "The card the link points to."
      argument :type, :string, description: "The link type."
      argument :actor, :string, description: @actor_doc
      run &Tools.unlink/2
    end

    action :create_region, :map do
      description """
      Draw a titled region on the map to group a theme. \
      Pass title, x, y, w and h in pixels (a card is 220 wide and 120 tall). Returns {seq, region}.
      """

      argument :title, :string, allow_nil?: false
      argument :x, :integer, allow_nil?: false, description: "Left edge."
      argument :y, :integer, allow_nil?: false, description: "Top edge."
      argument :w, :integer, allow_nil?: false, constraints: [min: 1], description: "Width."
      argument :h, :integer, allow_nil?: false, constraints: [min: 1], description: "Height."
      argument :actor, :string, description: @actor_doc
      run &Tools.create_region/2
    end
  end
end
