import { describeEvent, describeTool, timeAgo } from "./describe"
import type { GraphEvent } from "./types"

const FEED_LIMIT = 40

export function EventFeed(props: {
  events: GraphEvent[]
  titles: Record<string, string>
  agents: Set<string>
  now: number
  empty: string
}) {
  const { events, titles, agents, now, empty } = props
  if (events.length === 0) return <div className="tb-empty">{empty}</div>
  return (
    <div className="tb-events">
      {events.slice(0, FEED_LIMIT).map((e) => (
        <div key={e.seq} className="ev">
          <i style={{ background: agents.has(e.actor) ? "var(--accent)" : "var(--term-you)" }} />
          <div>
            {describeEvent(e, titles)}
            <div className="who">
              {e.actor} · seq {e.seq} · {timeAgo(e.at, now)}
            </div>
          </div>
        </div>
      ))}
      {events.length > FEED_LIMIT && <div className="tb-empty">and {events.length - FEED_LIMIT} earlier</div>}
    </div>
  )
}

export function ToolFeed(props: { events: GraphEvent[]; titles: Record<string, string> }) {
  const { events, titles } = props
  if (events.length === 0) return <div className="tb-empty">No agent writes yet.</div>
  return (
    <div className="tb-tools">
      {events.slice(0, FEED_LIMIT).map((e) => {
        const [tool, detail] = describeTool(e, titles)
        return (
          <div key={e.seq} title={`${e.actor} · seq ${e.seq} · ${new Date(e.at).toLocaleString()}`}>
            <span className="t">{tool}</span>
            <span className="d">{detail}</span>
          </div>
        )
      })}
    </div>
  )
}
