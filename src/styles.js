// All selectors are confined to the new region. The native tree receives no CSS overrides.
export const CSS = `
.dsgt{flex:none;min-width:0;margin:4px 0 12px;color:var(--dsw-alias-label-primary);font:inherit}
.dsgt *{box-sizing:border-box}.dsgt button,.dsgt input{font:inherit;color:inherit}
.dsgt-head{display:flex;justify-content:space-between;align-items:center;padding:2px 8px 8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsgt-scope{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsgt-tabs{display:flex;gap:4px;padding:3px;margin:0 4px 6px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover)}
.dsgt-tab{flex:1;cursor:pointer;border:0;border-radius:6px;padding:4px;line-height:22px;background:transparent;font-size:12px!important;color:var(--dsw-alias-label-secondary)!important}
.dsgt-tab[aria-selected=true]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)!important}.dsgt-count{margin-left:5px;font-size:10px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}
.dsgt-search{width:calc(100% - 8px);height:28px;margin:0 4px 5px;padding:4px 8px;border:1px solid transparent;border-radius:6px;background:transparent;font-size:11px!important;outline:none}.dsgt-search::placeholder{color:var(--dsw-alias-label-tertiary)}.dsgt-search:focus{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}
.dsgt-list{max-height:min(224px,30vh);overflow:auto;min-height:32px;scrollbar-width:thin}
.dsgt-row{display:flex;align-items:center;gap:5px;height:32px;border-radius:12px;padding:0 8px;margin:1px 0;min-width:0}.dsgt-row:hover,.dsgt-row[data-current=true]{background:var(--dsw-alias-interactive-bg-hover)}
.dsgt-open{display:flex;align-items:center;gap:6px;flex:1;min-width:0;height:32px;padding:0;border:0;background:transparent;text-align:left;cursor:pointer}
.dsgt-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}.dsgt-dot[data-state=running]{background:var(--dsw-alias-label-tertiary)}.dsgt-dot[data-state=approval],.dsgt-dot[data-state=input]{background:var(--dsw-alias-state-warn-primary)}.dsgt-dot[data-state=failed]{background:var(--dsw-alias-state-error-primary)}.dsgt-dot[data-state=review]{background:var(--dsw-alias-state-success-primary)}
.dsgt-project{flex:none;max-width:82px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 5px;line-height:18px;border-radius:4px;font-size:10px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}
.dsgt-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}.dsgt-state{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10px}
.dsgt-complete{flex:none;border:0;padding:0 3px;width:24px;height:28px;border-radius:6px;background:transparent;cursor:pointer;opacity:0}.dsgt-row:hover .dsgt-complete,.dsgt-complete:focus-visible{opacity:1}.dsgt-complete:disabled{opacity:.4;cursor:wait}
.dsgt-empty{padding:12px 8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}.dsgt-message{display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:11px;color:var(--dsw-alias-label-secondary)}.dsgt-message[role=alert]{color:var(--dsw-alias-state-error-primary)}.dsgt-link{border:0;background:transparent;cursor:pointer;padding:2px;color:inherit;font-size:11px!important;white-space:nowrap}.dsgt-message span{min-width:0;overflow-wrap:anywhere}
.dsgt button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
`
