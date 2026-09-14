defmodule ThinkBench.Board do
  @moduledoc """
  The application API for the one graph: generic actions the React board and the MCP
  tools both call, plus the JSON shapes they share. `ThinkBench.Mcp` only registers
  those actions as tools.
  """
  use Ash.Domain, otp_app: :think_bench, extensions: [AshAi]

  alias ThinkBench.Board.Actions

  @tools [
    :read_board,
    :read_card,
    :read_selection,
    :changes_since,
    :create_card,
    :update_card,
    :move_card,
    :archive_card,
    :link,
    :unlink,
    :create_region,
    :update_region,
    :destroy_region
  ]

  tools do
    tool :read_board, Actions, :read_board
    tool :read_card, Actions, :read_card
    tool :read_selection, Actions, :read_selection
    tool :changes_since, Actions, :changes_since
    tool :create_card, Actions, :create_card
    tool :update_card, Actions, :update_card
    tool :move_card, Actions, :move_card
    tool :archive_card, Actions, :archive_card
    tool :link, Actions, :link
    tool :unlink, Actions, :unlink
    tool :create_region, Actions, :create_region
    tool :update_region, Actions, :update_region
    tool :destroy_region, Actions, :destroy_region
  end

  resources do
    resource Actions
  end

  @doc "The names of the tools served over MCP."
  def tool_names, do: @tools

  @doc "Server-level guidance sent to MCP clients on initialize."
  def instructions do
    """
    Think Bench is a shared board of cards (ideas, questions, decisions, sources, objections) \
    joined by typed links, which a human edits alongside you. Start with read_board and remember \
    latest_seq; later call changes_since with it to catch up on what changed.
    """
  end
end
