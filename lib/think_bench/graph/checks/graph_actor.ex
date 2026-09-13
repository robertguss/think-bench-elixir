defmodule ThinkBench.Graph.Checks.GraphActor do
  @moduledoc "Passes when the actor is a `ThinkBench.Graph.Actor`, so every event names who wrote it."
  use Ash.Policy.SimpleCheck

  @impl true
  def describe(_opts), do: "actor is a ThinkBench.Graph.Actor"

  @impl true
  def match?(%ThinkBench.Graph.Actor{}, _context, _opts), do: true
  def match?(_actor, _context, _opts), do: false
end
