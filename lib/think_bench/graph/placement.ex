defmodule ThinkBench.Graph.Placement do
  @moduledoc """
  Picks a map position for a new card when the writer gives none: the nearest free
  grid cell around the most recently created card, so the card lands next to what
  was just being discussed and never overlaps a card on the map.

  Cards are drawn 220x120. The grid steps 240 across and 140 down, leaving a 20px
  gutter. Cells are tried nearest first; among equally near cells, right and below
  win over left and above.
  """
  alias ThinkBench.Graph
  alias ThinkBench.Graph.Vocabulary

  @card_w Vocabulary.card_width()
  @card_h Vocabulary.card_height()
  @step_x @card_w + 20
  @step_y @card_h + 20
  @origin {80, 80}
  @reach 25

  @offsets for(
             i <- -@reach..@reach,
             j <- -@reach..@reach,
             {i, j} != {0, 0},
             do: {i, j}
           )
           |> Enum.sort_by(fn {i, j} -> {i * i + j * j, j < 0, i < 0, abs(j), abs(i)} end)

  @doc "The size a card takes on the map, `{w, h}`."
  def card_size, do: {@card_w, @card_h}

  @doc "A free `{x, y}` next to the newest card on the board (archived cards ignored)."
  def free_spot, do: free_spot(Graph.list_cards!())

  @doc "A free `{x, y}` next to the newest of `cards`, or a fixed origin when there are none."
  def free_spot([]), do: @origin

  def free_spot(cards) do
    anchor = Enum.max_by(cards, & &1.inserted_at, DateTime)

    Enum.find_value(@offsets, fn {i, j} ->
      spot = {anchor.x + i * @step_x, anchor.y + j * @step_y}
      if free?(spot, cards), do: spot
    end) || below_everything(anchor, cards)
  end

  defp free?({x, y}, cards) do
    Enum.all?(cards, fn card -> abs(card.x - x) >= @card_w or abs(card.y - y) >= @card_h end)
  end

  # Only reached when every cell within reach is taken.
  defp below_everything(anchor, cards) do
    {anchor.x, Enum.max_by(cards, & &1.y).y + @step_y}
  end
end
