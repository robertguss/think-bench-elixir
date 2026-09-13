defmodule ThinkBench.Mcp do
  @moduledoc """
  The MCP tool surface over the graph, served by ash_ai at `/mcp`
  (see `ThinkBenchWeb.Router`). Tools are generic actions on `ThinkBench.Mcp.Board`.
  """
  use Ash.Domain, otp_app: :think_bench, extensions: [AshAi]

  alias ThinkBench.Mcp.Board

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
    :create_region
  ]

  tools do
    tool :read_board, Board, :read_board
    tool :read_card, Board, :read_card
    tool :read_selection, Board, :read_selection
    tool :changes_since, Board, :changes_since
    tool :create_card, Board, :create_card
    tool :update_card, Board, :update_card
    tool :move_card, Board, :move_card
    tool :archive_card, Board, :archive_card
    tool :link, Board, :link
    tool :unlink, Board, :unlink
    tool :create_region, Board, :create_region
  end

  resources do
    resource Board
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
