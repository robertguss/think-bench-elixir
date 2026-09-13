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
      tools: ThinkBench.Mcp.tool_names(),
      otp_app: :think_bench,
      mcp_name: "Think Bench",
      instructions: ThinkBench.Mcp.instructions()
  end

  scope "/", ThinkBenchWeb do
    pipe_through :browser

    get "/", PageController, :home
  end

  # Other scopes may use custom stacks.
  # scope "/api", ThinkBenchWeb do
  #   pipe_through :api
  # end

  # Enable LiveDashboard and Swoosh mailbox preview in development
  if Application.compile_env(:think_bench, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: ThinkBenchWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
