defmodule ThinkBenchWeb.Router do
  use ThinkBenchWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {ThinkBenchWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :mcp do
    plug ThinkBenchWeb.Plugs.McpActor
  end

  # MCP server (streamable HTTP) for Claude Code and other MCP clients. No
  # authentication: Think Bench is a localhost tool. See README.
  scope "/" do
    pipe_through :mcp

    forward "/mcp", AshAi.Mcp.Router,
      tools: ThinkBench.Board.tool_names(),
      otp_app: :think_bench,
      mcp_name: "Think Bench",
      instructions: ThinkBench.Board.instructions()
  end

  scope "/", ThinkBenchWeb do
    pipe_through :browser

    get "/", PageController, :home
  end

  # Other scopes may use custom stacks.
  # scope "/api", ThinkBenchWeb do
  #   pipe_through :api
  # end

  if Application.compile_env(:think_bench, :dev_routes) do
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: ThinkBenchWeb.Telemetry
    end
  end
end
