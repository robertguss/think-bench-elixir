defmodule ThinkBench.Graph.SelectionTest do
  use ThinkBench.DataCase, async: true

  alias ThinkBench.Graph

  test "set_selection keeps one row per session and get_selection returns the latest" do
    [a, b] = Enum.map(1..2, fn i -> card(robert(), title: "card #{i}").id end)

    Graph.set_selection!("tab-1", [a])
    Graph.set_selection!("tab-1", [a, b])

    assert %{session_id: "tab-1", card_ids: [^a, ^b]} = Graph.get_selection!()
    assert %{card_ids: [^a, ^b]} = Graph.get_selection!(%{session_id: "tab-1"})
    assert is_nil(Graph.get_selection!(%{session_id: "tab-2"}))
  end

  test "a second session that never selects does not steal read_selection" do
    [a] = Enum.map([1], fn i -> card(robert(), title: "card #{i}").id end)
    Graph.set_selection!("tab-1", [a])

    assert %{session_id: "tab-1", card_ids: [^a]} = Graph.get_selection!()
    assert is_nil(Graph.get_selection!(%{session_id: "tab-2"}))
    assert %{card_ids: [^a]} = Graph.get_selection!()
  end

  test "selecting does not write to the event log" do
    seq = Graph.latest_seq()
    Graph.set_selection!("tab-1", [])
    assert Graph.latest_seq() == seq
  end
end
