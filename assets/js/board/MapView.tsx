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
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeSelectionChange,
  type OnNodeDrag,
  type Viewport,
} from "@xyflow/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { BoardHead } from "./BoardHead"
import { CardFace } from "./CardFace"
import { box, edgePoint } from "./mapGeometry"
import { NewCardForm } from "./NewCardForm"
import { CARD_WIDTH, type Card, type Move, type Region } from "./types"
import type { BoardActions, BoardState } from "./useBoard"

type CardNode = Node<{ card: Card; entering: boolean }, "card">
type RegionNode = Node<{ region: Region }, "region">
type MapNode = CardNode | RegionNode
type TypedEdge = Edge<{ label: string; hl: boolean }, "typed">

// ---- nodes ---------------------------------------------------------------

const CardNodeView = memo(function CardNodeView({ data, selected }: NodeProps<CardNode>) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="tb-handle" isConnectable={false} />
      <CardFace card={data.card} selected={selected} entering={data.entering} />
      <Handle type="source" position={Position.Bottom} className="tb-handle" isConnectable={false} />
    </>
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

function buildNodes(prev: MapNode[], board: BoardState, selected: Set<string>): MapNode[] {
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
      draggable: true,
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
}

// ---- the map ---------------------------------------------------------------

type Props = {
  board: BoardState
  actions: BoardActions
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onError: (message: string) => void
  tabs: ReactNode
  // The viewport the map had when it was last left, so switching views keeps your place.
  viewport: Viewport | null
  onLeave: (viewport: Viewport) => void
}

export function MapView({ board, actions, selectedIds, onSelect, onError, tabs, viewport, onLeave }: Props) {
  const { screenToFlowPosition, fitView, getViewport } = useReactFlow()
  const wrapper = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  // Build the first nodes during the first render, with the current selection already
  // on them. Starting empty and filling them in an effect made React Flow report an
  // empty selection first when the map mounted with cards already selected (coming back
  // from Focus or Outline), and the two selections undid each other until React bailed.
  const [nodes, setNodes] = useState<MapNode[]>(() => buildNodes([], board, selected))

  // Rebuild nodes from the board, keeping React Flow's bookkeeping (measured size,
  // in-flight drag position) from the previous node objects.
  useEffect(() => {
    setNodes((prev) => buildNodes(prev, board, selected))
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
  const fitted = useRef(viewport !== null)
  useEffect(() => {
    if (initialized && board.ready && !fitted.current && nodes.length > 0) {
      fitted.current = true
      fitView({ padding: 0.12, maxZoom: 1 })
    }
  }, [initialized, board.ready, nodes.length, fitView])

  // Remember the viewport when the map unmounts (another view was chosen). The React
  // Flow store lives in App's provider, so it is still readable here.
  const leave = useRef(() => onLeave(getViewport()))
  leave.current = () => onLeave(getViewport())
  useEffect(() => () => leave.current(), [])

  // Selection flows one way: React Flow reports what the user clicked as `select` node
  // changes (click, shift or cmd click, box select, pane click), and we pass it up. Its
  // onSelectionChange also fires whenever the nodes prop syncs into its store (on mount
  // with an empty store, say), and feeding that back made the two selections chase each
  // other forever when the map mounted with cards already selected.
  const selectedRef = useRef(selectedIds)
  selectedRef.current = selectedIds

  const onNodesChange = useCallback(
    (changes: NodeChange<MapNode>[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns))

      const picks = changes.filter((c): c is NodeSelectionChange => c.type === "select")
      if (picks.length === 0) return
      const next = new Set(selectedRef.current)
      for (const pick of picks) {
        if (pick.selected) next.add(pick.id)
        else next.delete(pick.id)
      }
      onSelect([...next].filter((id) => !id.startsWith("region:")))
    },
    [onSelect],
  )

  const onNodeDragStop: OnNodeDrag<MapNode> = useCallback(
    (_event, _node, dragged) => {
      const moves: Move[] = []
      const undo: Move[] = []
      for (const n of dragged) {
        if (n.type === "region") {
          const id = n.id.replace(/^region:/, "")
          const region = board.regions[id]
          if (!region) continue
          const x = Math.round(n.position.x)
          const y = Math.round(n.position.y)
          if (x === region.x && y === region.y) continue
          actions.call("update_region", { id, x, y }).catch((e: Error) => onError(`Region move failed: ${e.message}`))
          continue
        }
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
    [board.cards, board.regions, actions, onError],
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
      <BoardHead tabs={tabs}>
        <button className="tb-btn" onClick={onNewCard} disabled={!board.ready}>
          + Card
        </button>
        <span className="tb-hint">double-click the map to add · shift-click to select several</span>
      </BoardHead>

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
          onNodeDragStop={onNodeDragStop}
          multiSelectionKeyCode={["Shift", "Meta"]}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          minZoom={0.2}
          maxZoom={2}
          defaultViewport={viewport ?? undefined}
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
