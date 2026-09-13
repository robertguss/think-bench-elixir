defmodule ThinkBench.Graph.Changes.SetCreatedBy do
  @moduledoc """
  Records the acting actor as the record's creator. Without a graph actor it changes
  nothing: the policy refuses the write, and `created_by` is required regardless.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, %{actor: %ThinkBench.Graph.Actor{id: actor_id}}) do
    Ash.Changeset.force_change_attribute(changeset, :created_by_id, actor_id)
  end

  def change(changeset, _opts, _context), do: changeset
end
