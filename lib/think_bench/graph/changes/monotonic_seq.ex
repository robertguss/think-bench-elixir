defmodule ThinkBench.Graph.Changes.MonotonicSeq do
  @moduledoc "On look upsert, never let an older in-flight read lower `seq`."
  use Ash.Resource.Change
  require Ash.Query

  alias ThinkBench.Graph.Look

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &keep_greater/1)
  end

  defp keep_greater(changeset) do
    actor_id =
      Ash.Changeset.get_attribute(changeset, :actor_id) ||
        Map.get(changeset.data, :actor_id)

    incoming = Ash.Changeset.get_attribute(changeset, :seq)

    current =
      Look
      |> Ash.Query.filter(actor_id == ^actor_id)
      |> Ash.read_one!()

    case current do
      %{seq: seq} when is_integer(seq) and is_integer(incoming) and seq > incoming ->
        Ash.Changeset.force_change_attribute(changeset, :seq, seq)

      _ ->
        changeset
    end
  end
end
