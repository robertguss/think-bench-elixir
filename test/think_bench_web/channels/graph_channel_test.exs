defmodule ThinkBenchWeb.GraphChannelTest do
  # Not async: writes broadcast on the global "graph" topic.
  use ThinkBenchWeb.ChannelCase, async: false

  alias ThinkBench.Graph
  alias ThinkBench.Mcp.Tools
  alias ThinkBenchWeb.UserSocket

  setup do
    robert = robert()
    claude = claude()
    idea = card(claude, title: "Seed idea", x: 80, y: 80)
    question = card(robert, kind: :question, title: "Seed question", x: 400, y: 80)
    link = Graph.link!(idea.id, question.id, "raised-by", actor: claude)
    region(claude, title: "Seed region")

    {:ok, socket} = connect(UserSocket, %{"session_id" => "tab-1"})
    {:ok, reply, socket} = subscribe_and_join(socket, "graph:main", %{})

    %{
      socket: socket,
      reply: reply,
      robert: robert,
      claude: claude,
      idea: idea,
      question: question,
      link: link
    }
  end

  # Asserts the newest event was written by robert and returns it.
  defp last_event_by(actor) do
    event = Graph.latest_event!()
    assert event.actor_id == actor.id
    event
  end

  describe "join" do
    test "replies with the board, latest_seq, events, actors and the AI's last look",
         %{reply: reply, idea: idea, question: question, link: link} do
      assert reply.session_id == "tab-1"
      assert reply.latest_seq == Graph.latest_seq()

      assert Enum.map(reply.cards, & &1.title) == ["Seed idea", "Seed question"]
      assert %{kind: :idea, created_by: "claude-code", x: 80, y: 80} = hd(reply.cards)
      assert reply.links == [%{id: link.id, from: idea.id, to: question.id, type: "raised-by"}]
      assert [%{title: "Seed region", w: 200, h: 100}] = reply.regions

      assert length(reply.events) == 4
      assert List.last(reply.events).seq == reply.latest_seq
      assert %{actor: "claude-code", resource: "card", action: :create} = hd(reply.events)

      assert %{name: "robert", kind: :human} in reply.actors
      assert %{name: "claude-code", kind: :agent} in reply.actors
      assert reply.look == nil
    end

    test "a socket without a session id gets one" do
      {:ok, socket} = connect(UserSocket, %{})
      assert "browser-" <> _ = socket.assigns.session_id
    end
  end

  describe "writes act as robert and push the event" do
    test "move_card", %{socket: socket, robert: robert, idea: idea} do
      ref = push(socket, "move_card", %{"id" => idea.id, "x" => 300, "y" => 420})
      assert_reply ref, :ok, %{seq: seq, card: %{x: 300, y: 420}}

      event = last_event_by(robert)
      assert {event.seq, event.action} == {seq, :move}

      assert_push "event", %{
        event: %{seq: ^seq, actor: "robert", action: :move},
        card: %{x: 300, y: 420}
      }
    end

    test "create_card, with and without a position", %{socket: socket, robert: robert} do
      ref =
        push(socket, "create_card", %{
          "kind" => "objection",
          "title" => "From the map",
          "tags" => ["ui"],
          "x" => 50,
          "y" => 600
        })

      assert_reply ref, :ok, %{seq: seq, card: %{id: id, created_by: "robert"}}
      assert last_event_by(robert).seq == seq

      assert_push "event", %{
        event: %{seq: ^seq, resource: "card", action: :create},
        card: %{id: ^id, title: "From the map", kind: :objection, tags: ["ui"]}
      }

      ref = push(socket, "create_card", %{"kind" => "idea", "title" => "Placed for me"})
      assert_reply ref, :ok, %{card: %{x: x, y: y}}
      assert is_integer(x) and is_integer(y)
    end

    test "the actor param cannot override robert", %{socket: socket, robert: robert} do
      ref =
        push(socket, "create_card", %{"kind" => "idea", "title" => "t", "actor" => "claude-code"})

      assert_reply ref, :ok, %{card: %{created_by: "robert"}}
      last_event_by(robert)
    end

    test "update_card", %{socket: socket, robert: robert, question: question} do
      ref =
        push(socket, "update_card", %{
          "id" => question.id,
          "status" => "resolved",
          "body" => "Settled"
        })

      assert_reply ref, :ok, %{seq: seq, card: %{status: :resolved, body: "Settled"}}
      assert last_event_by(robert).action == :update

      assert_push "event", %{event: %{seq: ^seq, action: :update}, card: %{status: :resolved}}
    end

    test "link", %{socket: socket, robert: robert, idea: idea, question: question} do
      ref =
        push(socket, "link", %{"from" => question.id, "to" => idea.id, "type" => "challenges"})

      assert_reply ref, :ok, %{seq: seq, link: %{id: id, type: "challenges"}}
      assert last_event_by(robert).seq == seq

      assert_push "event", %{
        event: %{seq: ^seq, resource: "link"},
        link: %{id: ^id, from: from, to: to}
      }

      assert {from, to} == {question.id, idea.id}
    end

    test "create_region", %{socket: socket, robert: robert} do
      params = %{"title" => "Capture", "x" => 0, "y" => 500, "w" => 480, "h" => 300}
      ref = push(socket, "create_region", params)
      assert_reply ref, :ok, %{seq: seq, region: %{title: "Capture"}}
      assert last_event_by(robert).seq == seq

      assert_push "event", %{event: %{seq: ^seq, resource: "region"}, region: %{w: 480}}
    end

    test "invalid input replies with an error and writes nothing", %{socket: socket} do
      before = Graph.latest_seq()

      ref = push(socket, "create_card", %{"kind" => "nope", "title" => "t"})
      assert_reply ref, :error, %{message: message}
      assert message =~ "kind"

      ref = push(socket, "update_card", %{"id" => Ash.UUID.generate(), "title" => "t"})
      assert_reply ref, :error, %{message: _}

      assert Graph.latest_seq() == before
      refute_push "event", _
    end
  end

  describe "pushes from other writers" do
    test "a card created by the AI is pushed with its creator", %{claude: claude} do
      card = card(claude, title: "From MCP")
      id = card.id

      assert_push "event", %{
        event: %{actor: "claude-code", resource: "card", action: :create},
        card: %{id: ^id, created_by: "claude-code"}
      }
    end

    test "an unlink is pushed as removed", %{claude: claude, link: link} do
      Graph.unlink!(link, actor: claude)
      id = link.id
      assert_push "event", %{event: %{action: :destroy}, removed: %{resource: "link", id: ^id}}
    end

    test "an archived card is pushed with archived set", %{claude: claude, idea: idea} do
      Graph.archive_card!(idea, actor: claude)
      assert_push "event", %{card: %{archived: true}}
    end
  end

  describe "select" do
    test "stores the selection for this session, as read_selection sees it",
         %{socket: socket, idea: idea, question: question} do
      ref = push(socket, "select", %{"card_ids" => [question.id, idea.id]})
      assert_reply ref, :ok, %{card_ids: ids}
      assert ids == [question.id, idea.id]

      assert Graph.get_selection!(%{session_id: "tab-1"}).card_ids == [question.id, idea.id]

      input = %{arguments: %{}}
      assert {:ok, %{card_ids: [q, i]}} = Tools.read_selection(input, %{})
      assert {q, i} == {question.id, idea.id}

      ref = push(socket, "select", %{"card_ids" => []})
      assert_reply ref, :ok, %{card_ids: []}
      assert Graph.get_selection!(%{session_id: "tab-1"}).card_ids == []
    end

    test "does not write events", %{socket: socket, idea: idea} do
      before = Graph.latest_seq()
      ref = push(socket, "select", %{"card_ids" => [idea.id]})
      assert_reply ref, :ok, _
      assert Graph.latest_seq() == before
    end
  end

  describe "the AI's last look" do
    test "an agent's read_board or changes_since is recorded and pushed", %{claude: claude} do
      context = %{actor: claude}

      assert {:ok, %{latest_seq: seq}} = Tools.read_board(%{arguments: %{}}, context)
      assert_push "look", %{look: %{actor: "claude-code", seq: ^seq}}

      card(claude, title: "Later")
      assert_push "event", _

      assert {:ok, %{latest_seq: seq2}} = Tools.changes_since(%{arguments: %{seq: seq}}, context)
      assert seq2 == seq + 1
      assert_push "look", %{look: %{seq: ^seq2}}

      assert %{seq: ^seq2, actor: %{name: "claude-code"}} = Graph.latest_look!()

      {:ok, socket} = connect(UserSocket, %{"session_id" => "tab-2"})
      {:ok, reply, _socket} = subscribe_and_join(socket, "graph:main", %{})
      assert %{actor: "claude-code", seq: ^seq2} = reply.look
    end

    test "a human's read is not recorded", %{robert: robert} do
      assert {:ok, _} = Tools.read_board(%{arguments: %{}}, %{actor: robert})
      refute_push "look", _
      assert Graph.latest_look!() == nil
    end
  end
end
