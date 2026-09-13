defmodule ThinkBenchWeb.PageController do
  use ThinkBenchWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
