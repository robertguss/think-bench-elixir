defmodule ThinkBench.Graph.EventTest do
  # Not async: the concurrency test shares the sandbox connection with tasks, and
  # PubSub on the "graph" topic is global.
  use ThinkBench.DataCase, async: false

  alias ThinkBench.Graph
  alias ThinkBench.Graph.{Card, Event, Link, Region}

  setup do
    %{robert: robert(), claude: claude()}
  end

  describe "every write produces exactly one event with the acting actor" do
    test "across card, link and region actions", %{robert: robert, claude: claude} do
      writes = [
        {Card, :create, claude, fn -> card(claude, title: "c1") end},
        {Card, :update, robert,
         fn -> Graph.update_card!(only_card(), %{status: :resolved}, actor: robert) end},
        {Card, :move, robert, fn -> Graph.move_card!(only_card(), 5, 6, actor: robert) end},
        {Region, :create, claude, fn -> region(claude) end},
        {Region, :update, robert,
         fn -> Graph.update_region!(only_region(), %{w: 400}, actor: robert) end},
        {Region, :destroy, robert, fn -> Graph.destroy_region!(only_region(), actor: robert) end},
        {Card, :create, robert, fn -> card(robert, title: "c2") end},
        {Link, :create, claude,
         fn -> Graph.link!(card_id("c2"), card_id("c1"), "answers", actor: claude) end},
        {Link, :destroy, robert, fn -> Graph.unlink!(only_link(), actor: robert) end},
        {Card, :archive, claude, fn -> Graph.archive_card!(only_card("c2"), actor: claude) end}
      ]

      seq_before = Graph.latest_seq()

      Enum.reduce(writes, seq_before, fn {resource, action, actor, write}, last_seq ->
        record = write.()

        assert [event] = Graph.changes_since!(last_seq)
        assert event.resource == resource
        assert event.action == action
        assert event.actor_id == actor.id
        assert event.record_id == record.id
        assert event.seq > last_seq
        assert record.__metadata__.seq == event.seq
        event.seq
      end)

      assert length(Graph.changes_since!(seq_before)) == length(writes)
    end

    test "event data records the input", %{robert: robert} do
      card = card(robert, title: "with data")
      Graph.move_card!(card, 80, 480, actor: robert)

      assert [create, move] = Graph.changes_since!(0)
      assert create.data["title"] == "with data"
      assert create.changed_attributes["created_by_id"] == robert.id
      assert move.data == %{"x" => 80, "y" => 480}
    end

    test "a failed write records no event", %{claude: claude} do
      a = card(claude, title: "a")
      Graph.link!(a.id, a.id, "cites", actor: claude)
      seq = Graph.latest_seq()

      assert {:error, _} = Graph.link(a.id, a.id, "cites", actor: claude)
      assert {:error, _} = Graph.create_card(%{kind: :idea, title: "no actor"})
      assert {:error, _} = Graph.move_card(a, nil, nil, actor: claude)

      assert Graph.changes_since!(seq) == []
      assert Graph.latest_seq() == seq
    end
  end

  describe "changes_since" do
    test "returns only newer events, oldest first", %{robert: robert} do
      assert Graph.latest_seq() == 0

      first = card(robert, title: "first")
      second = card(robert, title: "second")
      third = Graph.move_card!(second, 1, 1, actor: robert)

      assert [s1, s2, s3] = Enum.map([first, second, third], & &1.__metadata__.seq)
      assert s1 < s2 and s2 < s3

      assert Enum.map(Graph.changes_since!(0), & &1.seq) == [s1, s2, s3]
      assert Enum.map(Graph.changes_since!(s1), & &1.seq) == [s2, s3]
      assert Graph.changes_since!(s3) == []
      assert Graph.latest_seq() == s3
    end

    test "rejects a negative seq" do
      assert {:error, _} = Graph.changes_since(-1)
    end
  end

  test "seq is unique and strictly increasing under concurrent writers", %{robert: robert} do
    seqs =
      1..20
      |> Task.async_stream(fn i -> card(robert, title: "card #{i}").__metadata__.seq end,
        max_concurrency: 8,
        timeout: :infinity
      )
      |> Enum.map(fn {:ok, seq} -> seq end)

    assert length(Enum.uniq(seqs)) == 20
    assert Enum.map(Graph.changes_since!(0), & &1.seq) == Enum.sort(seqs)
  end

  describe "PubSub" do
    setup do
      :ok = Graph.subscribe()
    end

    test "broadcasts each committed event on the graph topic", %{claude: claude} do
      a = card(claude, title: "a")
      assert_receive {:event, %Event{action: :create, resource: Card} = event}
      assert event.seq == a.__metadata__.seq
      assert event.record_id == a.id
      assert event.actor_id == claude.id

      b = card(claude, title: "b")
      assert_receive {:event, %Event{resource: Card}}

      link = Graph.link!(a.id, b.id, "answers", actor: claude)
      assert_receive {:event, %Event{resource: Link, action: :create}}

      Graph.unlink!(link, actor: claude)
      assert_receive {:event, %Event{resource: Link, action: :destroy, record_id: link_id}}
      assert link_id == link.id

      assert Enum.map(Graph.changes_since!(0), &{:event, &1}) |> length() == 4
    end

    test "broadcasts nothing for a failed write" do
      assert {:error, _} = Graph.create_card(%{kind: :idea, title: "no actor"})
      refute_receive {:event, _}, 50
    end
  end

  test "seeds are idempotent and leave nine cards" do
    seeds = Path.expand("../../../priv/repo/seeds.exs", __DIR__)

    Code.eval_file(seeds)
    board = Graph.read_board(include_archived: true)
    seq = Graph.latest_seq()

    Code.eval_file(seeds)

    assert length(Graph.list_cards!(%{include_archived: true})) == 9
    assert length(board.cards) == 9
    assert length(Graph.list_links!()) == 8
    assert length(Graph.list_regions!()) == 1
    assert Graph.latest_seq() == seq
    assert Graph.read_board(include_archived: true) == board

    names = Graph.list_actors!() |> Enum.map(& &1.name) |> Enum.sort()
    assert names == ["claude-code", "robert"]
  end

  defp only_card(title \\ "c1"), do: Enum.find(Graph.list_cards!(), &(&1.title == title))
  defp card_id(title), do: only_card(title).id
  defp only_region, do: hd(Graph.list_regions!())
  defp only_link, do: hd(Graph.list_links!())
end
