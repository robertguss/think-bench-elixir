defmodule ThinkBenchWeb.Plugs.McpActor do
  @moduledoc """
  Sets the Ash actor for MCP requests. The `X-Actor` header names a seeded actor;
  without it requests act as `claude-code`. An unknown name is rejected with a
  JSON-RPC error rather than silently falling back.
  """
  import Plug.Conn

  alias ThinkBench.Mcp.Tools

  def init(opts), do: opts

  def call(conn, _opts) do
    name = conn |> get_req_header("x-actor") |> List.first()

    case Tools.resolve_actor(name) do
      {:ok, actor} ->
        Ash.PlugHelpers.set_actor(conn, actor)

      {:error, message} ->
        body = %{jsonrpc: "2.0", id: nil, error: %{code: -32_600, message: message}}

        conn
        |> put_resp_content_type("application/json")
        |> send_resp(400, Jason.encode!(body))
        |> halt()
    end
  end
end
