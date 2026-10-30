import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Icon from "../components/Icon";
import AnchoredPopover from "../components/AnchoredPopover";
import ResizeHandle from "../components/ResizeHandle";
import LockGlyph from "../components/LockGlyph";

export interface RowAction {
  label: string;
  run: () => void;
  disabled?: boolean;
  title?: string;
}

/**
 * One channel's name cell: colour dot, full or short name (CSS picks by the
 * column's density), visibility and a real lock beside the name, and the row
 * menu. At dot density the dot is the menu button, so every width reaches the
 * same actions; each control keeps its accessible name at every width.
 */
export default function ChannelHeader({
  name,
  short,
  tag,
  color,
  linked = false,
  select,
  selectLabel,
  visibility,
  lock,
  actions,
  height,
  setHeight,
}: {
  name: string;
  short: string;
  tag?: string;
  color: string;
  linked?: boolean;
  select?: { run: () => void; inspect: () => void };
  selectLabel?: string;
  visibility: {
    label: string;
    pressed: boolean;
    icon: ReactNode;
    run: () => void;
    disabled?: boolean;
    title?: string;
  };
  lock: { locked: boolean; run: () => void; disabled?: boolean };
  actions: RowAction[];
  height: number;
  setHeight: (n: number) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = useCallback(() => setAnchor(null), []);
  const label = (
    <>
      <span className="dir-channel-full">{name}</span>
      <span className="dir-channel-short" aria-hidden="true">
        {short}
      </span>
      {linked && (
        <small
          className="dir-channel-linked"
          title="Follows the storyboard shots"
        >
          ↳
        </small>
      )}
    </>
  );
  return (
    <div
      className="dir-gutter dir-channel"
      style={{ "--channel-color": color } as CSSProperties}
    >
      <i className="dir-channel-dot" aria-hidden="true" />
      {select ? (
        <button
          className="dir-lane-select"
          title={tag ? `${name} · ${tag}` : name}
          aria-label={selectLabel}
          onClick={select.run}
          onDoubleClick={select.inspect}
        >
          {label}
        </button>
      ) : (
        <span className="dir-lane-select dir-channel-name" title={name}>
          {label}
        </span>
      )}
      {tag && (
        <small className="dir-channel-tag">{lock.locked ? "▣" : tag}</small>
      )}
      <span className="dir-channel-tools">
        <button
          className="dir-mute"
          disabled={visibility.disabled}
          aria-label={visibility.label}
          aria-pressed={visibility.pressed}
          title={visibility.title}
          onClick={visibility.run}
        >
          {visibility.icon}
        </button>
        <button
          className="dir-lane-lock"
          disabled={lock.disabled}
          aria-label={`${lock.locked ? "Unlock" : "Lock"} ${name}`}
          aria-pressed={lock.locked}
          title={
            lock.locked
              ? "Locked: no moves, trims or edits"
              : "Lock against edits"
          }
          onClick={lock.run}
        >
          <LockGlyph open={!lock.locked} />
        </button>
      </span>
      <button
        className="dir-channel-menu"
        aria-label={`${name} actions`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        title={`${name}${lock.locked ? " · locked" : ""}${visibility.pressed ? " · hidden" : ""}`}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <i className="dir-channel-dot" aria-hidden="true" />
        <Icon name="chevron" size={11} />
      </button>
      {anchor && (
        <AnchoredPopover
          anchor={anchor}
          label={`${name} actions`}
          role="menu"
          width={196}
          className="dir-row-menu"
          close={closeMenu}
        >
          <strong>{name}</strong>
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              data-choice
              data-dismiss
              disabled={a.disabled}
              title={a.title}
              onClick={a.run}
            >
              {a.label}
            </button>
          ))}
        </AnchoredPopover>
      )}
      <ResizeHandle
        className="dir-row-resize"
        label={`${name} row height`}
        vertical
        value={height}
        min={24}
        max={240}
        change={setHeight}
      />
    </div>
  );
}
