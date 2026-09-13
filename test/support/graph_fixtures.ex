defmodule ThinkBench.GraphFixtures do
  @moduledoc "Builders for graph records in tests. All writes go through the domain."
  alias ThinkBench.Graph

  def robert, do: Graph.create_actor!("robert", :human)
  def claude, do: Graph.create_actor!("claude-code", :agent)

  def card(actor, attrs \\ %{}) do
    %{kind: :idea, title: "An idea"}
    |> Map.merge(Map.new(attrs))
    |> Graph.create_card!(actor: actor)
  end

  def region(actor, attrs \\ %{}) do
    %{title: "A region", x: 0, y: 0, w: 200, h: 100}
    |> Map.merge(Map.new(attrs))
    |> Graph.create_region!(actor: actor)
  end
end
