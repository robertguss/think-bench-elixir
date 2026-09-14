defmodule ThinkBench.Graph.Changes.PlaceCard do
  @moduledoc """
  When create omits both x and y, picks a free spot next to the newest card.
  Passing only one coordinate is an error.
  """
  use Ash.Resource.Change

  alias ThinkBench.Graph.Placement

  @impl true
  def change(changeset, _opts, _context) do
    x = Ash.Changeset.get_attribute(changeset, :x)
    y = Ash.Changeset.get_attribute(changeset, :y)

    case {x, y} do
      {nil, nil} ->
        {px, py} = Placement.free_spot()

        changeset
        |> Ash.Changeset.force_change_attribute(:x, px)
        |> Ash.Changeset.force_change_attribute(:y, py)

      {x, y} when is_integer(x) and is_integer(y) ->
        changeset

      _ ->
        Ash.Changeset.add_error(changeset,
          field: :x,
          message: "pass both x and y, or neither to place the card automatically"
        )
    end
  end
end
