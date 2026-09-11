import { useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { adminSearchUsersForLeaderAction, LeaderCandidate } from "@/lib/actions/admin-child-groups";

/**
 * Search-and-add existing-user picker for a ChildGroup's member list — same
 * search-as-you-type UX as LeaderPicker (and the same server search, any
 * user by name/email), but each result adds immediately via `onAdd`
 * instead of accumulating into hidden inputs for a later form submit: a
 * member is added one at a time straight through `adminSetUserChildGroupAction`
 * (see ChildGroupCard's `handleMove`), there's no "replace the whole set"
 * step to batch like leaders have.
 */
export function AddMemberPicker({
  onAdd,
  excludeIds,
  disabled = false,
}: {
  /** Called when a search result is clicked — the caller submits the actual "set child group" action. */
  onAdd: (candidate: LeaderCandidate) => void;
  /** User ids to hide from results — typically the group's current members, so you can't "add" someone already in it. */
  excludeIds: string[];
  disabled?: boolean;
}) {
  const t = useTranslations("admin");
  const searchFetcher = useFetcher<typeof adminSearchUsersForLeaderAction>();
  const [query, setQuery] = useState("");

  const results = (searchFetcher.data ?? []).filter((u) => !excludeIds.includes(u.id));
  const showResults = query.trim() !== "" && searchFetcher.data !== undefined;

  function search() {
    if (!query.trim()) return;
    const fd = new FormData();
    fd.set("intent", "searchLeaderCandidates");
    fd.set("q", query.trim());
    searchFetcher.submit(fd, { method: "post" });
  }

  function add(candidate: LeaderCandidate) {
    onAdd(candidate);
    setQuery("");
  }

  return (
    <div className="flex flex-col gap-2">
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
          disabled={disabled}
          placeholder={t("childGroups.leaderSearchPlaceholder")}
          className="input !w-auto flex-1 !py-1 text-sm"
        />
        <button
          type="button"
          onClick={search}
          disabled={disabled || searchFetcher.state !== "idle"}
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
                  disabled={disabled}
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
