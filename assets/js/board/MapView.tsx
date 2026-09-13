import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  useInternalNode,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnNodeDrag,
  type OnSelectionChangeParams,
} from "@xyflow/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { NewCardForm } from "./NewCardForm"
import type { Card, Move, Region } from "./types"
import type { BoardActions, BoardState } from "./useBoard"

export const CARD_WIDTH = 220

type CardNode = Node<{ card: Card; entering: boolean }, "card">
type RegionNode = Node<{ region: Region }, "region">
type MapNode = CardNode | RegionNode
type TypedEdge = Edge<{ label: string; hl: boolean }, "typed">

// ---- nodes ---------------------------------------------------------------

const CardNodeView = memo(function CardNodeView({ data, selected }: NodeProps<CardNode>) {
  const { card, entering } = data
  const resolved = card.status === "resolved"
  const classes = ["tb-card", `k-${card.kind}`, resolved && "resolved", selected && "selected", entering && "enter"]

  return (
    <div className={classes.filter(Boolean).join(" ")} style={{ width: CARD_WIDTH }}>
      <Handle type="target" position={Position.Top} className="tb-handle" isConnectable={false} />
      <div className="stripe" />
      <div className="kind">
        <span>
          {card.kind}
          {resolved && " · resolved"}
        </span>
        <span className="by">{card.created_by}</span>
      </div>
      <h3>{card.title}</h3>
      {card.body && <p>{card.body}</p>}
      {card.tags.length > 0 && (
        <div className="meta">
          {card.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="tb-handle" isConnectable={false} />
    </div>
  )
})

function RegionNodeView({ data }: NodeProps<RegionNode>) {
  return (
    <div className="tb-region" style={{ width: data.region.w, height: data.region.h }}>
      {data.region.title}
    </div>
  )
}

const nodeTypes = { card: CardNodeView, region: RegionNodeView }

// ---- edges: floating, box edge to box edge, as in the prototype -------------

function box(node: InternalNode) {
  const w = node.measured.width ?? CARD_WIDTH
  const h = node.measured.height ?? 90
  return { cx: node.internals.positionAbsolute.x + w / 2, cy: node.internals.positionAbsolute.y + h / 2, w, h }
}

// The point on a's border along the line toward b's centre.
function edgePoint(a: ReturnType<typeof box>, b: ReturnType<typeof box>) {
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  const s = Math.min(a.w / 2 / Math.abs(dx || 1e-6), a.h / 2 / Math.abs(dy || 1e-6))
  return { x: a.cx + dx * s, y: a.cy + dy * s }
}

function TypedEdgeView({ id, source, target, data }: EdgeProps<TypedEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode || !data) return null

  const a = box(sourceNode)
  const b = box(targetNode)
  const p1 = edgePoint(a, b)
  const p2 = edgePoint(b, a)
  const mx = (p1.x + p2.x) / 2
  const my = (p1.y + p2.y) / 2
  const path = `M${p1.x},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${p2.x},${p2.y}`

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${data.hl ? "tb-arrow-hl" : "tb-arrow"})`}
        style={{ stroke: data.hl ? "var(--accent)" : "var(--line-strong)", strokeWidth: data.hl ? 2 : 1.5 }}
      />
      <EdgeLabelRenderer>
        <div
          className={`tb-edge-label${data.hl ? " hl" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)` }}
        >
          {data.label}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const edgeTypes = { typed: TypedEdgeView }

// ---- the map ---------------------------------------------------------------

type Props = {
  board: BoardState
  actions: BoardActions
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onError: (message: string) => void
}

export function MapView({ board, actions, selectedIds, onSelect, onError }: Props) {
  const { screenToFlowPosition, fitView } = useReactFlow()
  const wrapper = useRef<HTMLDivElement>(null)
  const [nodes, setNodes] = useState<MapNode[]>([])
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  // Rebuild nodes from the board, keeping React Flow's bookkeeping (measured size,
  // in-flight drag position) from the previous node objects.
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]))

      const regions: RegionNode[] = Object.values(board.regions).map((region) => {
        const id = `region:${region.id}`
        const old = prevById.get(id)
        return {
          ...(old as RegionNode | undefined),
          id,
          type: "region",
          position: { x: region.x, y: region.y },
          data: { region },
          draggable: false,
          selectable: false,
          focusable: false,
          zIndex: -1,
        }
      })

      const cards: CardNode[] = Object.values(board.cards).map((card) => {
        const old = prevById.get(card.id) as CardNode | undefined
        return {
          ...old,
          id: card.id,
          type: "card",
          position: old?.dragging ? old.position : { x: card.x, y: card.y },
          data: { card, entering: !!board.entering[card.id] },
          selected: selected.has(card.id),
        }
      })

      return [...regions, ...cards]
    })
  }, [board.cards, board.regions, board.entering, selected])

  const edges = useMemo<TypedEdge[]>(
    () =>
      Object.values(board.links)
        .filter((l) => board.cards[l.from] && board.cards[l.to])
        .map((l) => ({
          id: l.id,
          source: l.from,
          target: l.to,
          type: "typed",
          selectable: false,
          focusable: false,
          data: { label: l.type, hl: selected.has(l.from) || selected.has(l.to) },
        })),
    [board.links, board.cards, selected],
  )

  // Fit the board once, after the first snapshot has been measured.
  const initialized = useNodesInitialized()
  const fitted = useRef(false)
  useEffect(() => {
    if (initialized && board.ready && !fitted.current && nodes.length > 0) {
      fitted.current = true
      fitView({ padding: 0.12, maxZoom: 1 })
    }
  }, [initialized, board.ready, nodes.length, fitView])

  const onNodesChange = useCallback(
    (changes: NodeChange<MapNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  )

  const onSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams<MapNode>) =>
      onSelect(nodes.filter((n) => n.type === "card").map((n) => n.id)),
    [onSelect],
  )

  const onNodeDragStop: OnNodeDrag<MapNode> = useCallback(
    (_event, _node, dragged) => {
      const moves: Move[] = []
      const undo: Move[] = []
      for (const n of dragged) {
        const card = n.type === "card" ? board.cards[n.id] : undefined
        if (!card) continue
        const x = Math.round(n.position.x)
        const y = Math.round(n.position.y)
        if (x === card.x && y === card.y) continue
        moves.push({ id: n.id, x, y })
        undo.push({ id: n.id, x: card.x, y: card.y })
      }
      if (moves.length === 0) return

      actions.moveLocal(moves)
      moves.forEach((move, i) =>
        actions.call("move_card", move).catch((e: Error) => {
          actions.moveLocal([undo[i]])
          onError(`Move failed: ${e.message}`)
        }),
      )
    },
    [board.cards, actions, onError],
  )

  const openDraftAt = (clientX: number, clientY: number) => {
    const p = screenToFlowPosition({ x: clientX, y: clientY })
    setDraft({ x: Math.round(p.x - CARD_WIDTH / 2), y: Math.round(p.y - 30) })
  }

  const onDoubleClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("react-flow__pane")) openDraftAt(e.clientX, e.clientY)
  }

  const onNewCard = () => {
    const rect = wrapper.current?.getBoundingClientRect()
    if (rect) openDraftAt(rect.left + rect.width / 2, rect.top + rect.height / 3)
  }

  return (
    <div className="tb-board-wrap flex min-h-0 flex-col">
      <div className="tb-board-head flex flex-wrap items-center gap-2.5">
        <div className="tb-tabs" role="tablist">
          <button role="tab" aria-selected="true">
            Map
          </button>
        </div>
        <button className="tb-btn" onClick={onNewCard} disabled={!board.ready}>
          + Card
        </button>
        <span className="tb-hint">double-click the map to add · shift-click to select several</span>
        <div className="tb-legend ml-auto flex flex-wrap gap-2.5">
          {(["idea", "question", "decision", "source", "objection"] as const).map((k) => (
            <span key={k}>
              <i style={{ background: `var(--${k})` }} />
              {k[0].toUpperCase() + k.slice(1)}
            </span>
          ))}
        </div>
      </div>

      <div ref={wrapper} className="tb-map relative min-h-0 flex-1" onDoubleClick={onDoubleClick}>
        <svg className="absolute h-0 w-0" aria-hidden>
          <defs>
            {[
              ["tb-arrow", "var(--line-strong)"],
              ["tb-arrow-hl", "var(--accent)"],
            ].map(([id, fill]) => (
              <marker
                key={id}
                id={id}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" style={{ fill }} />
              </marker>
            ))}
          </defs>
        </svg>

        <ReactFlow<MapNode, TypedEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onSelectionChange={onSelectionChange}
          onNodeDragStop={onNodeDragStop}
          multiSelectionKeyCode={["Shift", "Meta"]}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--line)" />
          <Controls showInteractive={false} />
        </ReactFlow>

        {draft && (
          <NewCardForm
            position={draft}
            actions={actions}
            onDone={(card) => {
              setDraft(null)
              if (card) onSelect([card.id])
            }}
            onError={onError}
          />
        )}
      </div>
    </div>
  )
}
