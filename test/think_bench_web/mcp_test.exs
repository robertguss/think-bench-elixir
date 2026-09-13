defmodule ThinkBenchWeb.McpTest do
  # Not async: writes broadcast on the global "graph" topic.
  use ThinkBenchWeb.ConnCase, async: false

  alias ThinkBench.Graph
  alias ThinkBench.Graph.Placement

  @seeds Path.expand("../../priv/repo/seeds.exs", __DIR__)

  setup %{conn: conn} do
    Code.eval_file(@seeds)
    {session, init} = initialize(conn)
    %{session: session, init: init}
  end

  # JSON-RPC over the streamable HTTP transport, JSON responses.

  defp post_rpc(conn, body, headers) do
    conn
    |> put_req_header("content-type", "application/json")
    |> put_req_header("accept", "application/json, text/event-stream")
    |> then(fn conn ->
      Enum.reduce(headers, conn, fn {k, v}, c -> put_req_header(c, k, v) end)
    end)
    |> post("/mcp", Jason.encode!(body))
  end

  defp initialize(conn) do
    conn =
      post_rpc(
        conn,
        %{
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: %{
            protocolVersion: "2025-06-18",
            capabilities: %{},
            clientInfo: %{name: "test", version: "1"}
          }
        },
        []
      )

    [session] = get_resp_header(conn, "mcp-session-id")
    {session, json_response(conn, 200)["result"]}
  end

  defp rpc(session, method, params, headers \\ []) do
    build_conn()
    |> post_rpc(
      %{jsonrpc: "2.0", id: System.unique_integer([:positive]), method: method, params: params},
      [{"mcp-session-id", session} | headers]
    )
    |> json_response(200)
  end

  # Calls a tool and returns {:ok, decoded result} or {:error, message}.
  defp call(session, tool, input \\ %{}, headers \\ []) do
    %{"result" => result} =
      rpc(session, "tools/call", %{name: tool, arguments: %{input: input}}, headers)

    [%{"type" => "text", "text" => text}] = result["content"]
    if result["isError"], do: {:error, text}, else: {:ok, Jason.decode!(text)}
  end

  defp card_by_title(title) do
    Enum.find(Graph.list_cards!(%{include_archived: true}), &(&1.title == title))
  end

  defp overlaps?(a, b) do
    {w, h} = Placement.card_size()
    abs(a["x"] - b["x"]) < w and abs(a["y"] - b["y"]) < h
  end

  describe "handshake" do
    test "initialize names the server and gives instructions", %{init: init} do
      assert init["serverInfo"]["name"] == "Think Bench"
      assert init["instructions"] =~ "latest_seq"
      assert init["capabilities"]["tools"]
    end

    test "tools/list serves exactly the planned tools", %{session: session} do
      %{"result" => %{"tools" => tools}} = rpc(session, "tools/list", %{})

      assert Enum.map(tools, & &1["name"]) |> Enum.sort() ==
               ~w(archive_card changes_since create_card create_region link move_card read_board read_card read_selection unlink update_card)

      by_name = Map.new(tools, &{&1["name"], &1})
      assert by_name["read_board"]["description"] =~ "Remember latest_seq"
      assert by_name["changes_since"]["description"] =~ "Remember the returned latest_seq"

      create_input = by_name["create_card"]["inputSchema"]["properties"]["input"]
      assert Enum.sort(create_input["required"]) == ["kind", "title"]
      assert create_input["properties"]["actor"]
    end
  end

  describe "reads" do
    test "read_board returns the seeded graph and the cursor", %{session: session} do
      assert {:ok, board} = call(session, "read_board")

      assert length(board["cards"]) == 9
      assert length(board["links"]) == 8
      assert [%{"title" => _, "w" => _}] = board["regions"]
      assert board["latest_seq"] == Graph.latest_seq()

      card = Enum.find(board["cards"], &(&1["title"] == "Voice capture from my phone?"))
      assert %{"kind" => "question", "created_by" => "robert", "status" => "open"} = card

      assert {:ok, %{"cards" => questions}} = call(session, "read_board", %{kinds: ["question"]})
      assert questions != [] and Enum.all?(questions, &(&1["kind"] == "question"))
    end

    test "read_card returns links in and out with the other card's title", %{session: session} do
      link = hd(Graph.list_links!())
      from = Ash.get!(Graph.Card, link.from_card_id)
      to = Ash.get!(Graph.Card, link.to_card_id)

      assert {:ok, card} = call(session, "read_card", %{id: from.id})
      assert card["title"] == from.title

      assert Enum.any?(
               card["links_out"],
               &(&1["id"] == link.id and &1["to"] == to.id and &1["to_title"] == to.title and
                   &1["type"] == link.type and &1["grammar"] in ["hierarchy", "jump"])
             )

      assert {:ok, card} = call(session, "read_card", %{id: to.id})

      assert Enum.any?(
               card["links_in"],
               &(&1["from"] == from.id and &1["from_title"] == from.title)
             )

      assert {:error, message} = call(session, "read_card", %{id: Ash.UUID.generate()})
      assert message =~ "not be found"
    end

    test "read_selection returns what the human selected, in order", %{session: session} do
      assert {:ok, %{"card_ids" => [], "cards" => []}} = call(session, "read_selection")

      [a, b | _] = Graph.list_cards!()
      Graph.set_selection!("browser-1", [b.id, a.id])

      assert {:ok, %{"card_ids" => ids, "cards" => cards}} = call(session, "read_selection")
      assert ids == [b.id, a.id]
      assert Enum.map(cards, & &1["title"]) == [b.title, a.title]
    end

    test "changes_since returns newer events and the new cursor", %{session: session} do
      assert {:ok, all} = call(session, "changes_since", %{seq: 0})
      assert length(all["events"]) == length(Graph.changes_since!(0))
      assert all["latest_seq"] == Graph.latest_seq()
      refute all["has_more"]

      seqs = Enum.map(all["events"], & &1["seq"])
      assert seqs == Enum.sort(seqs)

      assert %{"actor" => _, "resource" => "card", "action" => "create", "changes" => changes} =
               hd(all["events"])

      assert changes["title"]
      refute Map.has_key?(changes, "inserted_at")

      assert {:ok, %{"events" => [], "latest_seq" => latest}} =
               call(session, "changes_since", %{seq: all["latest_seq"]})

      assert latest == all["latest_seq"]
    end
  end

  describe "writes" do
    test "create_card at a given position records one event as claude-code", %{session: session} do
      before = Graph.latest_seq()

      assert {:ok, %{"seq" => seq, "card" => card}} =
               call(session, "create_card", %{
                 kind: "idea",
                 title: "Pinned position",
                 body: "b",
                 tags: ["mcp"],
                 x: 900,
                 y: 40
               })

      assert %{"x" => 900, "y" => 40, "created_by" => "claude-code", "tags" => ["mcp"]} = card
      assert [event] = Graph.changes_since!(before)
      assert event.seq == seq
      assert event.actor_id == Graph.get_actor!("claude-code").id
    end

    test "create_card without x/y lands in a free spot next to the newest card",
         %{session: session} do
      newest = List.last(Graph.list_cards!())

      assert {:ok, %{"card" => first}} =
               call(session, "create_card", %{kind: "question", title: "Where?"})

      assert {:ok, %{"card" => second}} =
               call(session, "create_card", %{kind: "question", title: "And me?"})

      assert {:ok, board} = call(session, "read_board")

      for placed <- [first, second], other <- board["cards"], other["id"] != placed["id"] do
        refute overlaps?(placed, other), "#{placed["title"]} overlaps #{other["title"]}"
      end

      assert abs(first["x"] - newest.x) <= 480 and abs(first["y"] - newest.y) <= 280
      assert abs(second["x"] - first["x"]) <= 480 and abs(second["y"] - first["y"]) <= 280

      assert {:error, message} = call(session, "create_card", %{kind: "idea", title: "t", x: 5})
      assert message =~ "both x and y"

      assert {:error, message} = call(session, "create_card", %{kind: "nope", title: "t"})
      assert message =~ "kind"
    end

    test "update_card, move_card and archive_card", %{session: session} do
      card = card_by_title("Voice capture from my phone?")

      assert {:ok, %{"seq" => s1, "card" => updated}} =
               call(session, "update_card", %{id: card.id, status: "resolved", tags: ["capture"]})

      assert %{"status" => "resolved", "tags" => ["capture"], "title" => title} = updated
      assert title == card.title

      assert {:ok, %{"seq" => s2, "card" => %{"x" => 10, "y" => 20}}} =
               call(session, "move_card", %{id: card.id, x: 10, y: 20})

      assert {:ok, %{"seq" => s3, "card" => %{"archived" => true}}} =
               call(session, "archive_card", %{id: card.id})

      assert s1 < s2 and s2 < s3

      assert [:update, :move, :archive] ==
               Graph.changes_since!(s1 - 1) |> Enum.map(& &1.action)

      assert {:ok, board} = call(session, "read_board")
      refute Enum.any?(board["cards"], &(&1["id"] == card.id))

      assert {:error, message} = call(session, "update_card", %{id: card.id})
      assert message =~ "at least one"
    end

    test "link and unlink by id or by endpoints", %{session: session} do
      a = card_by_title("Voice capture from my phone?")
      b = hd(Graph.list_cards!())

      assert {:ok, %{"seq" => seq, "link" => link}} =
               call(session, "link", %{from: a.id, to: b.id, type: "depends-on"})

      assert %{"from" => from, "to" => to, "type" => "depends-on"} = link
      assert {from, to} == {a.id, b.id}
      assert seq == Graph.latest_seq()

      assert {:error, _} = call(session, "link", %{from: a.id, to: b.id, type: "depends-on"})

      assert {:ok, %{"link" => %{"id" => id}}} =
               call(session, "unlink", %{from: a.id, to: b.id, type: "depends-on"})

      assert id == link["id"]
      assert Graph.find_link!(a.id, b.id, "depends-on") == nil

      assert {:ok, %{"link" => again}} =
               call(session, "link", %{from: a.id, to: b.id, type: "cites"})

      assert {:ok, %{"seq" => unlink_seq}} = call(session, "unlink", %{id: again["id"]})
      assert [%{action: :destroy}] = Graph.changes_since!(unlink_seq - 1)

      assert {:error, message} = call(session, "unlink", %{from: a.id})
      assert message =~ "link id"
    end

    test "create_region", %{session: session} do
      assert {:ok, %{"seq" => seq, "region" => region}} =
               call(session, "create_region", %{title: "Capture", x: 0, y: 600, w: 500, h: 300})

      assert %{"title" => "Capture", "w" => 500, "h" => 300} = region
      assert [%{resource: Graph.Region}] = Graph.changes_since!(seq - 1)
    end
  end

  describe "actor" do
    test "X-Actor header names the actor", %{session: session} do
      assert {:ok, %{"card" => card}} =
               call(session, "create_card", %{kind: "idea", title: "Mine"}, [
                 {"x-actor", "robert"}
               ])

      assert card["created_by"] == "robert"
    end

    test "the actor argument wins over the header", %{session: session} do
      assert {:ok, %{"seq" => seq}} =
               call(session, "create_card", %{kind: "idea", title: "Mine", actor: "robert"}, [
                 {"x-actor", "claude-code"}
               ])

      assert [event] = Graph.changes_since!(seq - 1)
      assert event.actor_id == Graph.get_actor!("robert").id
    end

    test "unknown actors are rejected, never written as nil", %{session: session} do
      before = Graph.latest_seq()

      assert {:error, message} =
               call(session, "create_card", %{kind: "idea", title: "x", actor: "mallory"})

      assert message =~ "no actor named"

      conn =
        build_conn()
        |> post_rpc(
          %{jsonrpc: "2.0", id: 9, method: "tools/list", params: %{}},
          [{"mcp-session-id", session}, {"x-actor", "mallory"}]
        )

      assert %{"error" => %{"message" => "no actor named" <> _}} = json_response(conn, 400)
      assert Graph.latest_seq() == before
    end
  end

  test "integration: create a card, link it, and changes_since sees both events",
       %{session: session} do
    assert {:ok, %{"latest_seq" => cursor}} = call(session, "read_board")
    question = card_by_title("Voice capture from my phone?")

    assert {:ok, %{"seq" => card_seq, "card" => card}} =
             call(session, "create_card", %{
               kind: "idea",
               title: "Dictate into Drafts, sync later"
             })

    assert {:ok, %{"seq" => link_seq}} =
             call(session, "link", %{from: card["id"], to: question.id, type: "answers"})

    assert {:ok, %{"events" => events, "latest_seq" => latest}} =
             call(session, "changes_since", %{seq: cursor})

    assert [
             %{
               "seq" => ^card_seq,
               "resource" => "card",
               "action" => "create",
               "actor" => "claude-code"
             },
             %{
               "seq" => ^link_seq,
               "resource" => "link",
               "action" => "create",
               "changes" => changes
             }
           ] = events

    assert changes["type"] == "answers"
    assert changes["from_card_id"] == card["id"]
    assert latest == link_seq
  end
end
