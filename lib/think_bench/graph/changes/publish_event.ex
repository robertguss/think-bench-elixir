defmodule ThinkBench.Graph.Changes.PublishEvent do
  @moduledoc """
  Attaches the event ash_events wrote for this action to the returned record, and
  broadcasts it on PubSub once the transaction has committed.

  ash_events inserts the event while holding a transaction-scoped advisory lock that
  every event insert takes. The lock is still held when our after_action hook runs, so
  the newest event for this record id is necessarily the one this action wrote.
  """
  use Ash.Resource.Change

  alias ThinkBench.Graph

  @impl true
  def change(changeset, _opts, _context) do
    changeset
    |> Ash.Changeset.after_action(fn _changeset, record ->
      event = Graph.Event.latest_for_record!(record.id)

      record =
        record
        |> Ash.Resource.put_metadata(:event, event)
        |> Ash.Resource.put_metadata(:seq, event.seq)

      {:ok, record}
    end)
    |> Ash.Changeset.after_transaction(fn
      _changeset, {:ok, record} ->
        Graph.broadcast(record.__metadata__.event)
        {:ok, record}

      _changeset, error ->
        error
    end)
  end
end
