defmodule ThinkBench.Graph.CardTest do
  use ThinkBench.DataCase, async: true

  alias ThinkBench.Graph

  setup do
    %{robert: robert(), claude: claude()}
  end

  describe "create_card" do
    test "creates an open card credited to the actor", %{claude: claude} do
      card =
        Graph.create_card!(
          %{kind: :question, title: "Board or chat?", body: "Which wins?", x: 10, y: 20},
          actor: claude
        )

      assert card.kind == :question
      assert card.title == "Board or chat?"
      assert card.status == :open
      assert card.tags == []
      assert {card.x, card.y} == {10, 20}
      assert card.created_by_id == claude.id
      assert is_nil(card.archived_at)
    end

    test "requires a title and a known kind", %{robert: robert} do
      assert {:error, _} = Graph.create_card(%{kind: :idea}, actor: robert)
      assert {:error, _} = Graph.create_card(%{kind: :musing, title: "x"}, actor: robert)
    end

    test "refuses a write without a graph actor" do
      assert {:error, %Ash.Error.Forbidden{}} =
               Graph.create_card(%{kind: :idea, title: "anonymous"})

      assert {:error, %Ash.Error.Forbidden{}} =
               Graph.create_card(%{kind: :idea, title: "stranger"},
                 actor: %{id: Ash.UUID.generate()}
               )

      assert Graph.list_cards!() == []
    end
  end

  test "update_card changes title, body, tags and status", %{robert: robert} do
    card = card(robert)

    updated =
      Graph.update_card!(
        card,
        %{title: "Sharper", body: "Now with detail", tags: ["core"], status: :resolved},
        actor: robert
      )

    assert %{title: "Sharper", body: "Now with detail", tags: ["core"], status: :resolved} =
             Graph.get_card!(card.id)

    assert updated.created_by_id == robert.id
  end

  test "cards start unpinned; update_card pins and unpins with one event each",
       %{robert: robert} do
    card = card(robert)
    refute card.pinned

    pinned = Graph.update_card!(card, %{pinned: true}, actor: robert)
    assert pinned.pinned
    assert Graph.get_card!(card.id).pinned
    assert pinned.__metadata__.event.action == :update

    unpinned = Graph.update_card!(pinned, %{pinned: false}, actor: robert)
    refute Graph.get_card!(card.id).pinned
    assert unpinned.__metadata__.seq == pinned.__metadata__.seq + 1
  end

  test "move_card sets the position and needs both coordinates", %{robert: robert} do
    card = card(robert, x: 0, y: 0)

    Graph.move_card!(card.id, 80, 480, actor: robert)
    assert %{x: 80, y: 480} = Graph.get_card!(card.id)

    assert {:error, _} = Graph.move_card(card, nil, 5, actor: robert)
  end

  test "archive_card hides the card from the board unless archived cards are asked for",
       %{robert: robert} do
    keep = card(robert, title: "keep")
    gone = card(robert, title: "gone")

    archived = Graph.archive_card!(gone, actor: robert)
    assert %DateTime{} = archived.archived_at

    assert [keep.id] == Enum.map(Graph.list_cards!(), & &1.id)

    assert MapSet.new([keep.id, gone.id]) ==
             MapSet.new(Graph.list_cards!(%{include_archived: true}), & &1.id)
  end

  test "list_cards filters by kind and by any matching tag", %{robert: robert} do
    idea = card(robert, kind: :idea, title: "idea", tags: ["core"])
    question = card(robert, kind: :question, title: "question", tags: ["docs", "later"])
    _decision = card(robert, kind: :decision, title: "decision")

    assert [question.id] == ids(Graph.list_cards!(%{kinds: [:question]}))
    assert [idea.id, question.id] == ids(Graph.list_cards!(%{tags: ["core", "later"]}))
  end

  test "get_card returns the card with its links in and out", %{robert: robert} do
    a = card(robert, title: "a")
    b = card(robert, title: "b")
    c = card(robert, title: "c")
    out = Graph.link!(b.id, a.id, "raised-by", actor: robert)
    into = Graph.link!(c.id, b.id, "answers", actor: robert)

    card = Graph.get_card!(b.id)
    assert card.created_by.name == "robert"
    assert [out.id] == ids(card.links_out)
    assert [into.id] == ids(card.links_in)
  end

  test "read_board returns live cards, links between them, regions and the cursor",
       %{robert: robert} do
    a = card(robert, title: "a")
    b = card(robert, title: "b")
    archived = card(robert, title: "archived")
    live_link = Graph.link!(a.id, b.id, "answers", actor: robert)
    Graph.link!(archived.id, a.id, "cites", actor: robert)
    region = region(robert)
    archived = Graph.archive_card!(archived, actor: robert)

    board = Graph.read_board()

    assert MapSet.new([a.id, b.id]) == MapSet.new(board.cards, & &1.id)
    assert [live_link.id] == ids(board.links)
    assert [region.id] == ids(board.regions)
    assert board.latest_seq == archived.__metadata__.seq
  end

  defp ids(records), do: Enum.map(records, & &1.id)
end
