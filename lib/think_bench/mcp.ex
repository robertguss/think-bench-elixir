defmodule ThinkBench.Mcp do
  @moduledoc """
  Thin MCP registration over `ThinkBench.Board`. The streamable HTTP server is mounted
  at `/mcp` (see `ThinkBenchWeb.Router`).
  """

  def tool_names, do: ThinkBench.Board.tool_names()
  def instructions, do: ThinkBench.Board.instructions()
end
