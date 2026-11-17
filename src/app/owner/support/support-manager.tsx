"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ClipboardList, Eye, FileText, Inbox, LifeBuoy, Loader2, Plus, RefreshCw, Search, Send, X } from "lucide-react";
import type { TicketCategory, TicketPriority, TicketStatus } from "@/server/modules/demo-store/support";
import { changeTicketStatusAction, createTicketAction, replyTicketAction, type SupportActionResult } from "./actions";
import {
  errorText,
  SUPPORT_LOCALES,
  SUPPORT_STRINGS,
  type SupportLanguage,
  type SupportStrings,
} from "./support-i18n";

export interface TicketRow {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  description: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  attachments: { id: string; name: string; mime: string; size: number }[];
  messages: { from: "restaurant" | "support"; text: string; at: string }[];
}

const CATEGORIES: TicketCategory[] = ["hardware", "software", "installation", "payment", "other"];
const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
const STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];

// Same limits the server enforces (the server re-checks everything).
const MAX_FILES = 3;
const MAX_FILE_BYTES = 300 * 1024;
const FILE_EXT = /\.(png|jpe?g|webp|pdf)$/i;
const FILE_MIME = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

type Toast = { kind: "ok" | "err"; text: string };
type When = (iso: string) => string;

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

function StatusBadge({ status, t }: { status: TicketStatus; t: SupportStrings }) {
  return (
    <span className={`sp-badge sp-st-${status}`}>
      <i aria-hidden />
      {t.st[status]}
    </span>
  );
}
function PriorityBadge({ priority, t }: { priority: TicketPriority; t: SupportStrings }) {
  return (
    <span className={`sp-badge sp-pr-${priority}`}>
      <i aria-hidden />
      {t.pri[priority]}
    </span>
  );
}

export function SupportManager({
  tickets,
  initialLanguage,
}: {
  tickets: TicketRow[];
  initialLanguage: SupportLanguage;
}) {
  const router = useRouter();
  const lang = initialLanguage;
  const t = SUPPORT_STRINGS[lang];

  const [query, setQuery] = useState("");
  const [fStatus, setFStatus] = useState<"all" | TicketStatus>("all");
  const [fCategory, setFCategory] = useState<"all" | TicketCategory>("all");
  const [fPriority, setFPriority] = useState<"all" | TicketPriority>("all");
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [refreshing, startRefresh] = useTransition();

  // Dates follow the chosen language and update the moment it changes.
  const when: When = useMemo(() => {
    const f = new Intl.DateTimeFormat(SUPPORT_LOCALES[lang], { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
    return (iso) => f.format(new Date(iso));
  }, [lang]);

  // Counts come straight from the tickets read from the database. Open includes "in progress"
  // and Resolved includes "closed", so Open + Resolved always equals Total.
  const stats = useMemo(() => {
    const open = tickets.filter((x) => x.status === "open" || x.status === "in_progress").length;
    const resolved = tickets.filter((x) => x.status === "resolved" || x.status === "closed").length;
    return { open, resolved, total: tickets.length };
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((x) => {
      if (fStatus !== "all" && x.status !== fStatus) return false;
      if (fCategory !== "all" && x.category !== fCategory) return false;
      if (fPriority !== "all" && x.priority !== fPriority) return false;
      if (!q) return true;
      return (
        x.id.toLowerCase().includes(q) ||
        x.subject.toLowerCase().includes(q) ||
        x.description.toLowerCase().includes(q) ||
        x.messages.some((m) => m.text.toLowerCase().includes(q))
      );
    });
  }, [tickets, query, fStatus, fCategory, fPriority]);

  const filtersOn = query.trim() !== "" || fStatus !== "all" || fCategory !== "all" || fPriority !== "all";
  const clearFilters = () => {
    setQuery("");
    setFStatus("all");
    setFCategory("all");
    setFPriority("all");
  };

  const openTicket = tickets.find((x) => x.id === openId) ?? null;

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  // Keep the list fresh while the page is visible (new replies, status changes).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [router]);

  function refresh() {
    startRefresh(() => {
      router.refresh();
    });
    setToast({ kind: "ok", text: t.toastRefreshed });
  }

  const empty = tickets.length === 0;

  return (
    <div lang={lang}>
      <div className="sp-head">
        <div className="rp-title">
          <LifeBuoy aria-hidden strokeWidth={1.75} />
          <div>
            <h1>{t.heading}</h1>
            <p>{t.subtitle}</p>
          </div>
        </div>
        <div className="sp-head-actions">
          <button type="button" className="rp-btn" onClick={refresh} disabled={refreshing}>
            <RefreshCw aria-hidden className={refreshing ? "sp-spin" : ""} />
            {refreshing ? t.refreshing : t.refresh}
          </button>
          <button type="button" className="rp-btn is-on sp-raise" onClick={() => setRaiseOpen(true)}>
            <Plus aria-hidden />
            {t.raise}
          </button>
        </div>
      </div>

      <div className="rp-stack">
        <div className="sp-kpis">
          <button type="button" className="rp-kpi sp-kpi" onClick={() => setFStatus("open")} title={t.openHint}>
            <span className="rp-kpi-ico"><Inbox aria-hidden strokeWidth={1.75} /></span>
            <span className="rp-kpi-txt">
              <p className="rp-kpi-val">{stats.open}</p>
              <p className="rp-kpi-lbl">{t.openTickets}</p>
              <p className="rp-kpi-hint">{t.openHint}</p>
            </span>
          </button>
          <button type="button" className="rp-kpi sp-kpi" onClick={() => setFStatus("resolved")} title={t.resolvedHint}>
            <span className="rp-kpi-ico"><CheckCircle2 aria-hidden strokeWidth={1.75} /></span>
            <span className="rp-kpi-txt">
              <p className="rp-kpi-val">{stats.resolved}</p>
              <p className="rp-kpi-lbl">{t.resolvedTickets}</p>
              <p className="rp-kpi-hint">{t.resolvedHint}</p>
            </span>
          </button>
          <button type="button" className="rp-kpi sp-kpi" onClick={clearFilters} title={t.totalHint}>
            <span className="rp-kpi-ico"><ClipboardList aria-hidden strokeWidth={1.75} /></span>
            <span className="rp-kpi-txt">
              <p className="rp-kpi-val">{stats.total}</p>
              <p className="rp-kpi-lbl">{t.totalTickets}</p>
              <p className="rp-kpi-hint">{t.totalHint}</p>
            </span>
          </button>
        </div>

        {empty ? (
          <div className="rp-card">
            <div className="sp-empty">
              <span className="sp-empty-ico"><LifeBuoy aria-hidden strokeWidth={1.75} /></span>
              <h2>{t.emptyTitle}</h2>
              <p>{t.emptyBody}</p>
              <button type="button" className="rp-btn is-on sp-raise" onClick={() => setRaiseOpen(true)}>
                <Plus aria-hidden />
                {t.raise}
              </button>
            </div>
          </div>
        ) : (
          <div className="rp-card">
            <div className="sp-toolbar">
              <div className="sp-search">
                <Search aria-hidden />
                <input type="search" className="fb-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder} />
              </div>
              <select className="fb-select" value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} aria-label={t.colStatus}>
                <option value="all">{t.allStatus}</option>
                {STATUSES.map((s) => <option key={s} value={s}>{t.st[s]}</option>)}
              </select>
              <select className="fb-select" value={fCategory} onChange={(e) => setFCategory(e.target.value as typeof fCategory)} aria-label={t.colCategory}>
                <option value="all">{t.allCategories}</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{t.cat[c]}</option>)}
              </select>
              <select className="fb-select" value={fPriority} onChange={(e) => setFPriority(e.target.value as typeof fPriority)} aria-label={t.colPriority}>
                <option value="all">{t.allPriority}</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{t.pri[p]}</option>)}
              </select>
              <span className="fb-spacer" />
              <span className="fb-count" aria-live="polite">{t.showingCount(filtered.length, tickets.length)}</span>
            </div>

            {filtered.length === 0 ? (
              <div className="rp-empty">
                {t.noMatch}&nbsp;
                <button type="button" className="rp-link" onClick={clearFilters}>{t.clearFilters}</button>
              </div>
            ) : (
              <>
                <div className="rp-tablewrap sp-tablewrap">
                  <table className="rp-table sp-table">
                    <thead>
                      <tr>
                        {[t.colId, t.colSubject, t.colCategory, t.colPriority, t.colStatus, t.colCreated, t.colUpdated, t.colActions].map((h) => (
                          <th key={h} scope="col">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((x) => (
                        <tr
                          key={x.id}
                          tabIndex={0}
                          role="button"
                          aria-label={`${t.view} ${x.id}`}
                          onClick={() => setOpenId(x.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOpenId(x.id);
                            }
                          }}
                        >
                          <td className="id">{x.id}</td>
                          <td className="sub"><span className="sp-clamp">{x.subject}</span></td>
                          <td>{t.cat[x.category]}</td>
                          <td><PriorityBadge priority={x.priority} t={t} /></td>
                          <td><StatusBadge status={x.status} t={t} /></td>
                          <td className="sp-date" suppressHydrationWarning>{when(x.createdAt)}</td>
                          <td className="sp-date" suppressHydrationWarning>{when(x.updatedAt)}</td>
                          <td>
                            <div className="sp-actions">
                              <button type="button" className="sp-act" onClick={(e) => { e.stopPropagation(); setOpenId(x.id); }}>
                                <Eye aria-hidden /> {t.view}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="sp-cards">
                  {filtered.map((x) => (
                    <div key={x.id} className="sp-card" role="button" tabIndex={0} onClick={() => setOpenId(x.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(x.id); } }}>
                      <div className="sp-card-top">
                        <span className="sp-id">{x.id}</span>
                        <StatusBadge status={x.status} t={t} />
                      </div>
                      <h3>{x.subject}</h3>
                      <div className="sp-card-meta">
                        <span className="sp-badge sp-st-closed">{t.cat[x.category]}</span>
                        <PriorityBadge priority={x.priority} t={t} />
                      </div>
                      <div className="sp-card-foot">
                        <span suppressHydrationWarning>{t.colUpdated}: {when(x.updatedAt)}</span>
                        <Eye aria-hidden size={16} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {raiseOpen && (
        <RaiseModal
          t={t}
          onClose={() => setRaiseOpen(false)}
          onCreated={(id) => {
            setRaiseOpen(false);
            setToast({ kind: "ok", text: t.toastCreated(id) });
          }}
        />
      )}

      {openTicket && <TicketDrawer key={openTicket.id} ticket={openTicket} t={t} when={when} onClose={() => setOpenId(null)} onToast={setToast} />}

      {toast && (
        <div className={`sp-toast${toast.kind === "err" ? " err" : ""}`} role={toast.kind === "err" ? "alert" : "status"}>
          {toast.kind === "err" ? <AlertCircle aria-hidden /> : <CheckCircle2 aria-hidden />}
          <span>{toast.text}</span>
          <button type="button" aria-label={t.closeDialog} onClick={() => setToast(null)}><X size={16} /></button>
        </div>
      )}
    </div>
  );
}

/** Locks page scroll and closes on Escape while a layer is open. */
function useLayer(onClose: () => void, locked: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, locked]);
}

function RaiseModal({ t, onClose, onCreated }: { t: SupportStrings; onClose: () => void; onCreated: (id: string) => void }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Partial<Record<"subject" | "category" | "priority" | "description" | "files", string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const picker = useRef<HTMLInputElement>(null);
  useLayer(onClose, pending);

  function addFiles(list: FileList | null) {
    if (!list) return;
    let error: string | undefined;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) { error = t.errFileCount; break; }
      if (!FILE_EXT.test(f.name) || (f.type && !FILE_MIME.includes(f.type))) { error = t.errFileType(f.name); continue; }
      if (f.size > MAX_FILE_BYTES) { error = t.errFileSize(f.name); continue; }
      next.push(f);
    }
    setFiles(next);
    setErrors((e) => ({ ...e, files: error }));
    if (picker.current) picker.current.value = "";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const s = subject.trim();
    const d = description.trim();
    if (s.length < 3) next.subject = t.errSubjectShort;
    else if (s.length > 120) next.subject = t.errSubjectLong;
    if (!category) next.category = t.errCategory;
    if (!priority) next.priority = t.errPriority;
    if (d.length < 10) next.description = t.errDescShort;
    else if (d.length > 2000) next.description = t.errDescLong;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    const fd = new FormData();
    fd.set("subject", s);
    fd.set("category", category);
    fd.set("priority", priority);
    fd.set("description", d);
    files.forEach((f) => fd.append("attachments", f));
    start(async () => {
      try {
        const r = await createTicketAction(fd);
        if (r.ok) onCreated(r.ticketId ?? "");
        else setFormError(errorText(t, r.code, r.detail));
      } catch {
        setFormError(t.errGeneric);
      }
    });
  }

  return (
    <div className="fb-overlay sp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }}>
      <form className="fb-modal" role="dialog" aria-modal="true" aria-labelledby="sp-raise-title" onSubmit={submit} noValidate>
        <div className="fb-modal-head">
          <div>
            <h3 id="sp-raise-title">{t.raiseTitle}</h3>
            <p>{t.raiseSub}</p>
          </div>
          <button type="button" className="fb-x" aria-label={t.closeDialog} onClick={onClose} disabled={pending}>×</button>
        </div>

        <div className="sp-field">
          <label htmlFor="sp-subject">{t.fSubject} *</label>
          <input id="sp-subject" className={`sp-input${errors.subject ? " is-bad" : ""}`} value={subject} maxLength={140} placeholder={t.subjectPh} onChange={(e) => setSubject(e.target.value)} aria-invalid={Boolean(errors.subject)} autoFocus />
          {errors.subject && <p className="sp-err" role="alert">{errors.subject}</p>}
        </div>

        <div className="sp-row2">
          <div className="sp-field">
            <label htmlFor="sp-category">{t.fCategory} *</label>
            <select id="sp-category" className={`sp-input${errors.category ? " is-bad" : ""}`} value={category} onChange={(e) => setCategory(e.target.value)} aria-invalid={Boolean(errors.category)}>
              <option value="">{t.selectCategory}</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t.cat[c]}</option>)}
            </select>
            {errors.category && <p className="sp-err" role="alert">{errors.category}</p>}
          </div>
          <div className="sp-field">
            <label htmlFor="sp-priority">{t.fPriority} *</label>
            <select id="sp-priority" className={`sp-input${errors.priority ? " is-bad" : ""}`} value={priority} onChange={(e) => setPriority(e.target.value)} aria-invalid={Boolean(errors.priority)}>
              <option value="">{t.selectPriority}</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{t.pri[p]}</option>)}
            </select>
            {errors.priority && <p className="sp-err" role="alert">{errors.priority}</p>}
          </div>
        </div>

        <div className="sp-field">
          <label htmlFor="sp-desc">{t.fDescription} *</label>
          <textarea id="sp-desc" className={`sp-input${errors.description ? " is-bad" : ""}`} value={description} maxLength={2100} placeholder={t.descPh} onChange={(e) => setDescription(e.target.value)} aria-invalid={Boolean(errors.description)} />
          {errors.description && <p className="sp-err" role="alert">{errors.description}</p>}
        </div>

        <div className="sp-field">
          <span className="sp-label">{t.fAttachment}</span>
          <div>
            <input ref={picker} id="sp-files" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            <label htmlFor="sp-files" className="rp-btn" style={{ display: "inline-flex" }}>
              <FileText aria-hidden /> {t.chooseFiles}
            </label>
          </div>
          <p className="sp-hint">{t.attachHint}</p>
          {errors.files && <p className="sp-err" role="alert">{errors.files}</p>}
          {files.length > 0 && (
            <ul className="sp-files">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="sp-file">
                  <FileText aria-hidden />
                  <span>{f.name}</span>
                  <small>{kb(f.size)}</small>
                  <button type="button" onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>{t.removeFile}</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {formError && <p className="sp-err" role="alert" style={{ marginBottom: 10 }}>{formError}</p>}

        <div className="sp-modal-foot">
          <button type="button" className="rp-btn" onClick={onClose} disabled={pending}>{t.cancel}</button>
          <button type="submit" className="rp-btn is-on" disabled={pending}>
            {pending && <Loader2 aria-hidden className="sp-spin" />}
            {pending ? t.submitting : t.submit}
          </button>
        </div>
      </form>
    </div>
  );
}

function TicketDrawer({ ticket, t, when, onClose, onToast }: { ticket: TicketRow; t: SupportStrings; when: When; onClose: () => void; onToast: (x: Toast) => void }) {
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pending, start] = useTransition();
  const threadEnd = useRef<HTMLDivElement>(null);
  useLayer(onClose, confirmClose || pending);

  // The first message is the description (shown above), so the thread starts after it.
  const first = ticket.messages[0];
  const thread = first && first.from === "restaurant" && first.text === ticket.description ? ticket.messages.slice(1) : ticket.messages;
  const closed = ticket.status === "closed";

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [thread.length]);

  // Escape closes the confirmation dialog (the drawer ignores Escape while it is open).
  useEffect(() => {
    if (!confirmClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setConfirmClose(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmClose, pending]);

  function run(fn: () => Promise<SupportActionResult>, okText: string, after?: () => void) {
    setError(null);
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          onToast({ kind: "ok", text: okText });
          after?.();
        } else {
          setError(errorText(t, r.code, r.detail));
        }
      } catch {
        setError(t.errGeneric);
      }
    });
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) {
      setError(t.errReplyEmpty);
      return;
    }
    run(() => replyTicketAction(ticket.id, reply), t.toastReplied, () => setReply(""));
  }

  return (
    <div className="sp-drawer-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget && !confirmClose) onClose(); }}>
      <aside className="sp-drawer" role="dialog" aria-modal="true" aria-labelledby="sp-detail-title">
        <div className="sp-drawer-head">
          <div style={{ minWidth: 0 }}>
            <span className="sp-id">{ticket.id}</span>
            <h3 id="sp-detail-title">{ticket.subject}</h3>
            <div className="sp-card-meta" style={{ marginBottom: 0 }}>
              <StatusBadge status={ticket.status} t={t} />
              <PriorityBadge priority={ticket.priority} t={t} />
            </div>
          </div>
          <button type="button" className="fb-x" aria-label={t.closeDialog} onClick={onClose}>×</button>
        </div>

        <div className="sp-drawer-body">
          <h4 className="fb-h4" style={{ marginTop: 0 }}>{t.ticketInfo}</h4>
          <dl className="sp-info" style={{ margin: 0 }}>
            <div><dt>{t.colId}</dt><dd>{ticket.id}</dd></div>
            <div><dt>{t.colCategory}</dt><dd>{t.cat[ticket.category]}</dd></div>
            <div><dt>{t.colCreated}</dt><dd suppressHydrationWarning>{when(ticket.createdAt)}</dd></div>
            <div><dt>{t.colUpdated}</dt><dd suppressHydrationWarning>{when(ticket.updatedAt)}</dd></div>
          </dl>

          <h4 className="fb-h4">{t.description}</h4>
          <p className="fb-comment">{ticket.description}</p>

          <h4 className="fb-h4">{t.attachments}</h4>
          {ticket.attachments.length === 0 ? (
            <p className="sp-hint">{t.noAttachments}</p>
          ) : (
            <div className="sp-atts">
              {ticket.attachments.map((a) => {
                const href = `/api/support-attachment/${encodeURIComponent(ticket.id)}/${encodeURIComponent(a.id)}`;
                return (
                  <a key={a.id} className="sp-att" href={href} target="_blank" rel="noopener noreferrer" title={t.openFile}>
                    <span className="th">
                      {a.mime.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element -- served by our own authenticated route
                        <img src={href} alt="" />
                      ) : (
                        <FileText aria-hidden />
                      )}
                    </span>
                    <span className="nm"><b>{a.name}</b><small>{kb(a.size)}</small></span>
                  </a>
                );
              })}
            </div>
          )}

          <h4 className="fb-h4">{t.conversation}</h4>
          {thread.length === 0 ? (
            <p className="sp-hint">{t.noReplies}</p>
          ) : (
            <div className="sp-thread">
              {thread.map((m, i) => (
                <div key={i} className={`sp-msg ${m.from === "restaurant" ? "me" : "them"}`}>
                  <span className="who">{m.from === "restaurant" ? t.you : t.supportTeam}</span>
                  {m.text}
                  <small suppressHydrationWarning>{when(m.at)}</small>
                </div>
              ))}
            </div>
          )}
          <div ref={threadEnd} />
        </div>

        <div className="sp-drawer-foot">
          {error && <p className="sp-err" role="alert">{error}</p>}
          {closed ? (
            <p className="sp-note">{t.closedNote}</p>
          ) : (
            <>
              <form className="sp-reply" onSubmit={send}>
                <textarea className="sp-input" rows={2} value={reply} maxLength={2000} placeholder={t.replyPh} aria-label={t.replyPh} onChange={(e) => setReply(e.target.value)} />
                <button type="submit" className="rp-btn is-on" disabled={pending}>
                  {pending ? <Loader2 aria-hidden className="sp-spin" /> : <Send aria-hidden />}
                  {pending ? t.sending : t.send}
                </button>
              </form>
              <div className="sp-foot-actions">
                {ticket.status === "resolved" ? (
                  <button type="button" className="sp-act" disabled={pending} onClick={() => run(() => changeTicketStatusAction(ticket.id, "reopen"), t.toastReopened)}>{t.reopen}</button>
                ) : (
                  <button type="button" className="sp-act" disabled={pending} onClick={() => run(() => changeTicketStatusAction(ticket.id, "resolve"), t.toastResolved)}>
                    <CheckCircle2 aria-hidden /> {t.resolve}
                  </button>
                )}
                <button type="button" className="sp-act danger" disabled={pending} onClick={() => setConfirmClose(true)}>{t.closeTicket}</button>
              </div>
            </>
          )}
        </div>
      </aside>

      {confirmClose && (
        <div className="fb-overlay sp-confirm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) setConfirmClose(false); }}>
          <div className="fb-modal" style={{ maxWidth: 440 }} role="alertdialog" aria-modal="true" aria-labelledby="sp-confirm-title" aria-describedby="sp-confirm-body">
            <div className="fb-modal-head">
              <div>
                <h3 id="sp-confirm-title">{t.confirmCloseTitle}</h3>
                <p id="sp-confirm-body">{t.confirmCloseBody}</p>
              </div>
            </div>
            <div className="sp-modal-foot">
              <button type="button" className="rp-btn" autoFocus disabled={pending} onClick={() => setConfirmClose(false)}>{t.keepOpen}</button>
              <button type="button" className="rp-btn is-on" disabled={pending} onClick={() => run(() => changeTicketStatusAction(ticket.id, "close"), t.toastClosed, () => setConfirmClose(false))}>
                {pending && <Loader2 aria-hidden className="sp-spin" />}
                {t.confirmClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
