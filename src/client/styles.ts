/**
 * dsh-lighthouse client stylesheet.
 *
 * Colors ride the DeepSeek `--dsw-*` theme tokens with blue-white fallbacks,
 * and the dark branch keys off `body[data-ds-dark-theme]`, so the tab follows
 * whichever theme the shell resolved. Severity is carried by a small accent and
 * a border, never by a glow; the layout stays ink-on-ice like the rest of the
 * portfolio.
 */
const STYLE_ID = 'dsh-lighthouse-styles'

const CSS = `
.l-root{--l-bg:var(--dsw-alias-bg-layer-2,#f3f8fe);--l-deep:var(--dsw-alias-bg-base,#eaf2fc);--l-surface:var(--dsw-alias-bg-layer-1,#fff);--l-line:var(--dsw-alias-border-l1,#e4eef9);--l-line-2:var(--dsw-alias-border-l2,#d6e4f5);--l-ink:var(--dsw-alias-label-primary,#0b2347);--l-ink-2:var(--dsw-alias-label-secondary,#334f75);--l-ink-3:var(--dsw-alias-label-tertiary,#607a9d);--l-blue:var(--dsw-alias-brand-primary,#3d5af1);--l-blue-soft:var(--dsw-alias-button-info-fill,#eaf1ff);--l-green:var(--dsw-alias-state-success-primary,#0b8a68);--l-amber:var(--dsw-alias-state-warn-primary,#a96c17);--l-rose:var(--dsw-alias-state-error-primary,#b05a64);
position:relative;min-height:100%;background:linear-gradient(180deg,var(--l-deep),var(--l-bg));color:var(--l-ink);font:13px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
body[data-ds-dark-theme] .l-root{--l-bg:var(--dsw-alias-bg-layer-2,#0f1f33);--l-ink:var(--dsw-alias-label-primary,#e9f2fd);--l-ink-2:var(--dsw-alias-label-secondary,#b6cee8);--l-ink-3:var(--dsw-alias-label-tertiary,#89a8cb);--l-surface:var(--dsw-alias-bg-layer-1,#12233a);--l-deep:var(--dsw-alias-bg-base,#0c1a2c);--l-line:var(--dsw-alias-border-l1,#1c3554);--l-line-2:var(--dsw-alias-border-l2,#24446b);--l-blue:var(--dsw-alias-brand-primary,#8ea4ff);--l-blue-soft:var(--dsw-alias-button-info-fill,#16294a);--l-green:var(--dsw-alias-state-success-primary,#5fd3ad);--l-amber:var(--dsw-alias-state-warn-primary,#e3b46b);--l-rose:var(--dsw-alias-state-error-primary,#f0a3ac)}
.l-inner{max-width:1180px;margin:0 auto;padding:16px 18px 40px}
.l-state{display:flex;gap:10px;align-items:center;padding:22px 14px;color:var(--l-ink-3)}
.l-spin{width:14px;height:14px;border:2px solid var(--l-line-2);border-top-color:var(--l-blue);border-radius:50%;animation:l-spin .8s linear infinite}
@keyframes l-spin{to{transform:rotate(360deg)}}
.l-bar{position:sticky;top:0;z-index:3;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0;background:linear-gradient(180deg,var(--l-bg) 72%,transparent);backdrop-filter:blur(2px)}
.l-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border:1px solid var(--l-line-2);border-radius:9px;background:var(--l-surface);color:var(--l-ink-2);font:inherit;font-size:12px;cursor:pointer;transition:border-color .15s,color .15s,transform .1s}
.l-btn:hover{border-color:var(--l-blue);color:var(--l-blue)}
.l-btn:active{transform:translateY(1px)}
.l-btn.primary{background:var(--l-blue);border-color:var(--l-blue);color:#fff}
.l-btn.primary:hover{color:#fff;filter:brightness(1.06)}
.l-btn[disabled]{opacity:.5;cursor:default;transform:none;border-color:var(--l-line-2);color:var(--l-ink-2)}
.l-btn.primary[disabled]{border-color:var(--l-blue);color:#fff}
body[data-ds-dark-theme] .l-btn.primary,body[data-ds-dark-theme] .l-btn.primary:hover{color:#08182c}
.l-btn:focus-visible,.l-fbtn:focus-visible{outline:2px solid var(--l-blue);outline-offset:2px}
.l-spacer{flex:1 1 20px}
.l-filters{display:flex;flex-wrap:wrap;gap:4px;padding:3px;border:1px solid var(--l-line);border-radius:11px;background:var(--l-surface)}
.l-fbtn{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border:0;border-radius:8px;background:transparent;color:var(--l-ink-3);font:inherit;font-size:11.5px;cursor:pointer}
.l-fbtn:hover{color:var(--l-ink-2)}
.l-fbtn.active{background:var(--l-blue-soft);color:var(--l-blue)}
.l-fcount{font-size:10.5px;font-variant-numeric:tabular-nums;opacity:.8}
.l-empty{padding:26px 14px;text-align:center;color:var(--l-ink-3);background:var(--l-surface);border:1px dashed var(--l-line-2);border-radius:13px}
.l-empty.inline{padding:14px;margin-bottom:12px;text-align:left;font-size:12px}
.l-hero{display:flex;gap:12px;align-items:flex-start;margin:4px 0 14px}
.l-mark{flex:none;color:var(--l-blue);margin-top:2px}
.l-hero h2{margin:0;font-size:17px;font-weight:600;letter-spacing:.2px;word-break:break-word}
.l-sub{margin:3px 0 0;color:var(--l-ink-3);font-size:11.5px;word-break:break-all}
.l-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}
.l-chip{padding:2px 9px;border-radius:999px;background:var(--l-blue-soft);color:var(--l-blue);font-size:11.5px}
.l-chip.warn{background:color-mix(in srgb,var(--l-amber) 14%,transparent);color:var(--l-amber)}
.l-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:9px;margin:4px 0 14px}
.l-cell{padding:10px 12px;background:var(--l-surface);border:1px solid var(--l-line);border-radius:12px}
.l-cell b{display:block;font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
.l-cell span{color:var(--l-ink-3);font-size:11px}
.l-cell.crit b{color:var(--l-rose)}
.l-cell.warn b{color:var(--l-amber)}
.l-cols{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:16px;align-items:start}
@media (max-width:980px){.l-cols{grid-template-columns:minmax(0,1fr)}.l-side{position:static}}
@media (min-width:981px){.l-side{position:sticky;top:8px}}
.l-h{display:flex;align-items:center;gap:7px;margin:2px 0 10px;font-size:13px;font-weight:600;color:var(--l-ink-2)}
.l-panel{background:var(--l-surface);border:1px solid var(--l-line);border-radius:13px;padding:12px 13px;margin-bottom:12px}
.l-panel h4{margin:0 0 8px;font-size:12px;font-weight:600;color:var(--l-ink-2);display:flex;align-items:center;gap:6px}
.l-count{font-weight:500;color:var(--l-ink-3);font-size:10.5px;background:var(--l-deep);border-radius:999px;padding:0 7px;font-variant-numeric:tabular-nums}
.l-goal-panel{border-left:3px solid var(--l-blue)}
.l-goal{margin:0;color:var(--l-ink-2);white-space:pre-wrap;word-break:break-word;font-size:12.5px}
.l-cards{display:flex;flex-direction:column;gap:10px}
.l-card{background:var(--l-surface);border:1px solid var(--l-line);border-left:3px solid var(--l-line-2);border-radius:12px;padding:12px 13px}
.l-card.critical{border-left-color:var(--l-rose)}
.l-card.warning{border-left-color:var(--l-amber)}
.l-card.notice{border-left-color:var(--l-blue)}
.l-card-h{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-bottom:9px}
.l-badge{padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:600}
.l-badge.critical{background:color-mix(in srgb,var(--l-rose) 13%,transparent);color:var(--l-rose)}
.l-badge.warning{background:color-mix(in srgb,var(--l-amber) 14%,transparent);color:var(--l-amber)}
.l-badge.notice{background:var(--l-blue-soft);color:var(--l-blue)}
.l-card-title{font-size:13px;font-weight:600;color:var(--l-ink)}
.l-tag{padding:0 7px;border:1px solid var(--l-line-2);border-radius:999px;color:var(--l-ink-3);font-size:10.5px}
.l-meta{color:var(--l-ink-3);font-size:10.5px;font-variant-numeric:tabular-nums}
.l-kv{display:flex;align-items:baseline;gap:7px;margin:0 0 7px;font-size:11.5px}
.l-k{flex:none;color:var(--l-ink-3)}
.l-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:11px;background:var(--l-deep);border:1px solid var(--l-line);border-radius:5px;padding:1px 5px;color:var(--l-ink-2);word-break:break-all}
.l-cmd{margin:0 0 9px;padding:8px 10px;max-height:210px;overflow:auto;background:var(--l-deep);border:1px solid var(--l-line);border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:11px;line-height:1.55;color:var(--l-ink-2);white-space:pre-wrap;word-break:break-all}
.l-why,.l-safe{margin:0 0 6px;color:var(--l-ink-2);font-size:11.8px;line-height:1.6}
.l-why b,.l-safe b{display:inline-block;margin-right:7px;color:var(--l-ink);font-weight:600}
.l-safe b{color:var(--l-green)}
.l-card-f{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:9px;padding-top:8px;border-top:1px dashed var(--l-line)}
.l-outcome{padding:0 7px;border-radius:999px;font-size:10.5px}
.l-outcome.succeeded{background:color-mix(in srgb,var(--l-green) 12%,transparent);color:var(--l-green)}
.l-outcome.failed{background:color-mix(in srgb,var(--l-rose) 12%,transparent);color:var(--l-rose)}
.l-outcome.unknown{background:var(--l-deep);color:var(--l-ink-3)}
.l-hint{flex:1 1 220px;color:var(--l-ink-3);font-size:10.5px;line-height:1.5}
.l-evidence{color:var(--l-ink-3);font-size:10.5px;font-variant-numeric:tabular-nums}
.l-good{display:flex;gap:12px;align-items:flex-start;padding:20px 16px;background:var(--l-surface);border:1px solid var(--l-line);border-left:3px solid var(--l-green);border-radius:13px}
.l-good-mark{flex:none;color:var(--l-green);margin-top:1px}
.l-good h3{margin:0 0 4px;font-size:13.5px;font-weight:600}
.l-good p{margin:0 0 4px;color:var(--l-ink-2);font-size:11.8px;line-height:1.6}
.l-next{margin:0;color:var(--l-ink-2);font-size:11.8px;line-height:1.6}
.l-tally{list-style:none;margin:0;padding:0}
.l-tally li{display:flex;align-items:center;gap:7px;padding:5px 0;border-top:1px dashed var(--l-line);font-size:11.5px}
.l-tally li:first-child{border-top:0;padding-top:0}
.l-tally-label{flex:1;min-width:0;color:var(--l-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.l-dot{width:7px;height:7px;border-radius:50%;flex:none;display:inline-block;background:var(--l-blue)}
.l-dot.critical{background:var(--l-rose)}
.l-dot.warning{background:var(--l-amber)}
.l-dot.notice{background:var(--l-blue)}
.l-legend{list-style:none;margin:0;padding:0}
.l-legend li{display:grid;grid-template-columns:8px 70px minmax(0,1fr);gap:7px;align-items:start;padding:6px 0;border-top:1px dashed var(--l-line);font-size:11.5px;line-height:1.5}
.l-legend li:first-child{border-top:0;padding-top:0}
.l-legend .l-dot{margin-top:5px}
.l-legend b{color:var(--l-ink-2);font-weight:600}
.l-legend span:last-child{color:var(--l-ink-3)}
.l-local{margin:2px 0 0;color:var(--l-ink-3);font-size:10.5px;line-height:1.55}
.l-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:50;max-width:min(92vw,760px);padding:8px 16px;border-radius:14px;background:var(--l-ink);color:var(--l-surface);font-size:12px;line-height:1.5;text-align:center;box-shadow:0 10px 28px -16px color-mix(in srgb,var(--l-ink) 70%,transparent)}
`

/** Inject the view stylesheet once. */
export function adoptStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
