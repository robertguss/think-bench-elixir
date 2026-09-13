defmodule ThinkBench.Graph.PlacementTest do
  use ExUnit.Case, async: true

  alias ThinkBench.Graph.Placement

  defp card(x, y, second), do: %{x: x, y: y, inserted_at: DateTime.from_unix!(second)}

  test "an empty board starts at the origin" do
    assert Placement.free_spot([]) == {80, 80}
  end

  test "places to the right of the newest card when that is free" do
    cards = [card(0, 0, 1), card(500, 300, 2)]
    assert Placement.free_spot(cards) == {740, 300}
  end

  test "walks the grid around the newest card, skipping cells that overlap" do
    # Newest card at (0, 0); right, below and left of it are taken.
    cards = [card(240, 10, 1), card(-30, 140, 2), card(-240, 0, 3), card(0, 0, 4)]
    {x, y} = spot = Placement.free_spot(cards)

    assert spot == {0, -140}

    for c <- cards do
      refute abs(c.x - x) < 220 and abs(c.y - y) < 120
    end
  end
end
