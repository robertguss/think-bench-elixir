defmodule ThinkBenchWeb.UserSocket do
  @moduledoc """
  The board UI's socket. No authentication: Think Bench is a localhost tool acting as
  `robert` (see README). Each browser tab passes a `session_id` it keeps for its
  lifetime, which keys its row in `ThinkBench.Graph.Selection`; one is generated if
  absent.
  """
  use Phoenix.Socket

  channel "graph:main", ThinkBenchWeb.GraphChannel

  @impl true
  def connect(params, socket, _connect_info) do
    session_id =
      case params do
        %{"session_id" => id} when is_binary(id) and byte_size(id) in 1..100 -> id
        _ -> "browser-" <> Ash.UUID.generate()
      end

    {:ok, assign(socket, :session_id, session_id)}
  end

  @impl true
  def id(_socket), do: nil
end
