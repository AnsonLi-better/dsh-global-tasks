// Selectors are scoped to `.gst` so the native tree and the global task region
// receive no overrides. Connector geometry is driven by `--gst-row` per level.
export const TREE_CSS = `
.gst{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);font:inherit}
.gst *{box-sizing:border-box}.gst button,.gst input{font:inherit;color:inherit}
.gst-head{flex:none;display:flex;align-items:center;gap:14px;padding:18px 30px 0}
.gst-heading{min-width:0;flex:none}
.gst-h1{margin:0;font-size:21px;font-weight:600;line-height:1.4}
.gst-sub{margin:3px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.gst-search{margin-left:auto;flex:none;width:250px;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;outline:none;font-size:13px!important}
.gst-search:focus{background:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-label-tertiary)}
.gst-search::placeholder{color:var(--dsw-alias-label-tertiary)}
.gst-back{flex:none;display:inline-flex;align-items:center;height:28px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;cursor:pointer;font-size:12.5px!important;color:var(--dsw-alias-label-secondary)}
.gst-back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
/* Sits in the title row, so it needs no top margin of its own. */
.gst-filters{flex:none;display:flex;gap:6px;margin:0;padding:3px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);width:fit-content}
.gst-chip{display:flex;align-items:center;gap:6px;padding:5px 11px;border:0;border-radius:6px;background:transparent;cursor:pointer;font-size:12px!important;line-height:20px;color:var(--dsw-alias-label-secondary)}
.gst-chip[aria-selected=true]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px #00000014}
.gst-chip-n{font-size:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.gst-bar{flex:none;display:flex;align-items:center;gap:10px;margin-top:11px;padding:0 30px 7px;font-size:11px;color:var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-border-l1)}
.gst-spacer{flex:1}
.gst-mini{border:0;background:transparent;cursor:pointer;padding:2px 7px;border-radius:5px;font-size:11px!important;color:var(--dsw-alias-label-tertiary)}
.gst-mini:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gst-total{font-variant-numeric:tabular-nums}
.gst-tree{flex:1;min-height:0;overflow:auto;padding:10px 30px 40px;scrollbar-width:thin}
.gst-empty{padding:48px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary)}
.gst-branch{position:relative}
.gst-leaf{position:relative;padding-left:26px;--gst-row:32px}
.gst-leaf.gst-ws{--gst-row:36px}
.gst-leaf.gst-grp{--gst-row:30px}
.gst-leaf.gst-se{--gst-row:32px}
/* The vertical stroke spans this node and its subtree; the first sibling starts
   at its own connector and the last one stops there, so lines never dangle. */
.gst-leaf::before{content:'';position:absolute;left:0;top:0;bottom:0;width:1px;background:var(--dsw-alias-border-l2)}
.gst-leaf.gst-first::before{top:calc(var(--gst-row) / 2)}
.gst-leaf.gst-last::before{bottom:auto;height:calc(var(--gst-row) / 2)}
.gst-leaf.gst-first.gst-last::before{display:none}
.gst-leaf::after{content:'';position:absolute;left:0;top:calc(var(--gst-row) / 2);width:16px;height:1px;background:var(--dsw-alias-border-l2)}
.gst-row{display:flex;align-items:center;gap:8px;width:100%;height:var(--gst-row);padding:0 9px;border:0;border-radius:8px;background:transparent;text-align:left;cursor:pointer;position:relative}
.gst-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gst-row:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-1px}
.gst-caret{flex:none;width:12px;font-size:9px;color:var(--dsw-alias-label-tertiary);display:grid;place-items:center;transition:transform .12s}
.gst-row[aria-expanded=false] .gst-caret{transform:rotate(-90deg)}
.gst-folder{flex:none;display:inline-flex;color:var(--dsw-alias-label-secondary)}
.gst-name{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gst-path{font-size:10.5px;font-family:var(--dsw-font-family-code,ui-monospace,monospace);color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.85}
.gst-meta{margin-left:auto;flex:none;display:flex;align-items:center;gap:8px}
.gst-pill{font-size:10px;padding:1px 6px;border-radius:20px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.gst-pill-run{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary)}
.gst-pill-att{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label)}
.gst-gdot{flex:none;width:7px;height:7px;margin:0 2px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.gst-gdot[data-state=running]{background:var(--dsw-alias-state-business-primary)}
.gst-gdot[data-state=attention]{background:var(--dsw-alias-state-warn-primary)}
.gst-gdot[data-state=review]{background:var(--dsw-alias-state-success-primary)}
.gst-gdot[data-state=archived]{background:var(--dsw-alias-label-tertiary);opacity:.6}
.gst-gname{font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.gst-gcount{font-size:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.gst-row-se{padding-left:9px}
.gst-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.gst-dot[data-state=running]{background:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}
.gst-dot[data-state=approval],.gst-dot[data-state=input]{background:var(--dsw-alias-state-warn-primary)}
.gst-dot[data-state=failed]{background:var(--dsw-alias-state-error-primary)}
.gst-dot[data-state=review]{background:var(--dsw-alias-state-success-primary)}
.gst-dot[data-state=archived]{background:var(--dsw-alias-label-tertiary);opacity:.5}
.gst-title{flex:1;min-width:0;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gst-row-se.gst-current{background:var(--dsw-alias-interactive-bg-active)}
.gst-row-se.gst-current .gst-title{font-weight:500}
.gst-go{flex:none;width:20px;height:20px;border-radius:5px;display:grid;place-items:center;font-size:11px;color:var(--dsw-alias-label-tertiary);opacity:0}
.gst-row-se:hover .gst-go,.gst-row-se.gst-current .gst-go{opacity:1}
`
