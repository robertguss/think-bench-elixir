defmodule ThinkBench.Graph.LookTest do
  use ThinkBench.DataCase, async: true

  alias ThinkBench.Graph

  test "an older look does not lower seq" do
    claude = claude()
    card(claude, title: "one")
    card(claude, title: "two")
    head = Graph.latest_seq()

    assert {:ok, look} = Graph.record_agent_look(claude, head)
    assert look.seq == head

    assert {:ok, again} = Graph.record_agent_look(claude, head - 1)
    assert again.seq == head
    assert Graph.latest_look!().seq == head
  end

  test "a human look is ignored" do
    robert = robert()
    assert Graph.record_agent_look(robert, 1) == :ignored
    assert Graph.latest_look!() == nil
  end
end
