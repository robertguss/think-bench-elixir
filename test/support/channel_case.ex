defmodule ThinkBenchWeb.ChannelCase do
  @moduledoc "Test case for channel tests, with the SQL sandbox and graph fixtures."
  use ExUnit.CaseTemplate

  using do
    quote do
      import Phoenix.ChannelTest
      import ThinkBenchWeb.ChannelCase
      import ThinkBench.GraphFixtures

      @endpoint ThinkBenchWeb.Endpoint
    end
  end

  setup tags do
    ThinkBench.DataCase.setup_sandbox(tags)
    :ok
  end
end
