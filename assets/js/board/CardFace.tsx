import type { ReactNode } from "react"
import { CARD_WIDTH, type Card } from "./types"

export { CARD_WIDTH }

type Props = {
  card: Card
  // map: the draggable map card. centre: the large Focus centre with the full body.
  // neighbour: a compact, clickable Focus neighbour with the link label that placed it.
  variant?: "map" | "centre" | "neighbour"
  selected?: boolean
  entering?: boolean
  highlighted?: boolean
  rel?: ReactNode
  onClick?: () => void
  onHover?: (hovering: boolean) => void
}

/** The prototype's card: kind stripe, kind label, creator, title, body, tags. */
export function CardFace(props: Props) {
  const { card, variant = "map", selected, entering, highlighted, rel, onClick, onHover } = props
  const resolved = card.status === "resolved"
  const classes = [
    "tb-card",
    variant !== "map" && variant,
    `k-${card.kind}`,
    resolved && "resolved",
    selected && "selected",
    entering && "enter",
    highlighted && "hl",
  ]
    .filter(Boolean)
    .join(" ")

  const status = [card.kind, resolved && "resolved", card.pinned && variant !== "neighbour" && "pinned"]
    .filter(Boolean)
    .join(" · ")

  const inner = (
    <>
      <div className="stripe" />
      <div className="kind">
        <span>{status}</span>
        {variant !== "neighbour" && <span className="by">{card.created_by}</span>}
      </div>
      <h3>{card.title}</h3>
      {variant !== "neighbour" && card.body && <p>{card.body}</p>}
      {variant !== "neighbour" && card.tags.length > 0 && (
        <div className="meta">
          {card.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      {rel && <div className="rel">{rel}</div>}
    </>
  )

  if (variant === "neighbour") {
    return (
      <button
        type="button"
        className={classes}
        data-card={card.id}
        onClick={onClick}
        onMouseEnter={() => onHover?.(true)}
        onMouseLeave={() => onHover?.(false)}
        onFocus={() => onHover?.(true)}
        onBlur={() => onHover?.(false)}
      >
        {inner}
      </button>
    )
  }

  return (
    <div className={classes} style={variant === "map" ? { width: CARD_WIDTH } : undefined} data-card={card.id}>
      {inner}
    </div>
  )
}
