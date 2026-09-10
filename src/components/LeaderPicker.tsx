import { useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { adminSearchUsersForLeaderAction, LeaderCandidate } from "@/lib/actions/admin-child-groups";

/**
 * Search-and-add leader picker for a ChildGroup form — replaces a plain
 * "every user" `<select multiple>`, which doesn't scale and makes finding
 * one specific person tedious. Selected leaders are submitted as repeated
 * hidden `name` inputs, so this drops straight into the surrounding
 * `<Form>` (create or edit) without its own submit — the search itself
 * runs through a `useFetcher` POST so Enter/click never submits that
 * outer form.
 */
export function LeaderPicker({
  name,
  initialLeaders = [],
}: {
  /** Form field name each selected leader's id is submitted under (`formData.getAll(name)` on the server). */
  name: string;
  initialLeaders?: LeaderCandidate[];
}) {
  const t = useTranslations("admin");
  const searchFetcher = useFetcher<typeof adminSearchUsersForLeaderAction>();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LeaderCandidate[]>(initialLeaders);

  const results = (searchFetcher.data ?? []).filter((u) => !selected.some((s) => s.id === u.id));
  const showResults = query.trim() !== "" && searchFetcher.data !== undefined;

  function search() {
    if (!query.trim()) return;
    const fd = new FormData();
    fd.set("intent", "searchLeaderCandidates");
    fd.set("q", query.trim());
    searchFetcher.submit(fd, { method: "post" });
  }

  function add(candidate: LeaderCandidate) {
    setSelected((prev) => (prev.some((s) => s.id === candidate.id) ? prev : [...prev, candidate]));
    setQuery("");
  }

  function remove(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((leader) => (
            <li key={leader.id}>
              <input type="hidden" name={name} value={leader.id} />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--bg-accent)] px-2.5 py-1 text-xs text-[var(--ink)]">
                {leader.label}
                <button
                  type="button"
                  onClick={() => remove(leader.id)}
                  aria-label={t("childGroups.leaderRemove")}
                  className="text-[var(--muted)] hover:text-[var(--danger)]"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder={t("childGroups.leaderSearchPlaceholder")}
          className="input !w-auto flex-1 !py-1 text-sm"
        />
        <button
          type="button"
          onClick={search}
          disabled={searchFetcher.state !== "idle"}
          className="btn btn-secondary !px-3 !py-1.5 text-xs"
        >
          {t("childGroups.leaderSearchSubmit")}
        </button>
      </div>

      {showResults &&
        (results.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">{t("childGroups.leaderSearchNoResults")}</p>
        ) : (
          <ul className="flex flex-col gap-1 rounded-lg border border-[var(--line)] p-1.5">
            {results.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => add(candidate)}
                  className="w-full rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-accent)]"
                >
                  {candidate.label}
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
