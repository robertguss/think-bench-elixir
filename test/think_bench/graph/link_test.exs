defmodule ThinkBench.Graph.LinkTest do
  use ThinkBench.DataCase, async: true

  alias ThinkBench.Graph

  setup do
    claude = claude()
    %{claude: claude, a: card(claude, title: "a"), b: card(claude, title: "b")}
  end

  test "link connects two cards with a type, credited to the actor", %{claude: claude, a: a, b: b} do
    link = Graph.link!(a.id, b.id, "answers", actor: claude)

    assert {link.from_card_id, link.to_card_id, link.type} == {a.id, b.id, "answers"}
    assert link.created_by_id == claude.id
    assert Graph.find_link!(a.id, b.id, "answers").id == link.id
  end

  test "a (from, to, type) link exists at most once", %{claude: claude, a: a, b: b} do
    Graph.link!(a.id, b.id, "answers", actor: claude)

    assert {:error, _} = Graph.link(a.id, b.id, "answers", actor: claude)
    assert {:ok, _} = Graph.link(a.id, b.id, "cites", actor: claude)
    assert {:ok, _} = Graph.link(b.id, a.id, "answers", actor: claude)
    assert length(Graph.list_links!()) == 3
  end

  test "link refuses a card that does not exist", %{claude: claude, a: a} do
    assert {:error, _} = Graph.link(a.id, Ash.UUID.generate(), "answers", actor: claude)
  end

  test "unlink removes the link", %{claude: claude, a: a, b: b} do
    link = Graph.link!(a.id, b.id, "depends-on", actor: claude)

    Graph.unlink!(link.id, actor: claude)

    assert is_nil(Graph.find_link!(a.id, b.id, "depends-on"))
    assert Graph.list_links!() == []
  end

  describe "grammar" do
    test "hierarchical types are :hierarchy", %{claude: claude, a: a, b: b} do
      for type <- ~w(answers resolves raised-by follows-from depends-on challenges) do
        link = Graph.link!(a.id, b.id, type, actor: claude)
        assert Graph.get_link!(link.id, load: [:grammar]).grammar == :hierarchy, type
      end
    end

    test "cites and unknown types are :jump", %{claude: claude, a: a, b: b} do
      for type <- ~w(cites inspired-by) do
        link = Graph.link!(a.id, b.id, type, actor: claude)
        assert Graph.get_link!(link.id, load: [:grammar]).grammar == :jump, type
      end
    end
  end
end
