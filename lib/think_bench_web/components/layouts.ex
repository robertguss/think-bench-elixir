defmodule ThinkBenchWeb.Layouts do
  @moduledoc """
  Root HTML skeleton. The board UI is React in `#root`; there is no Phoenix app chrome.
  """
  use ThinkBenchWeb, :html

  embed_templates "layouts/*"
end
