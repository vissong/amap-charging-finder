import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Search } from "lucide-react";

import type { StationKeywordSearchState } from "../hooks/useStationKeywordSearch";

interface StationSearchProps {
  state: StationKeywordSearchState;
}

export function StationSearch({ state }: StationSearchProps) {
  const [value, setValue] = useState("");
  const active = state.status !== "idle";

  useEffect(() => {
    if (state.query) setValue(state.query.display);
  }, [state.query]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    state.search(value);
  }

  function clear(): void {
    state.clear();
    setValue("");
  }

  const context =
    state.status === "loading" && state.query
      ? `正在按“${state.query.submitted}”搜索`
      : state.query
        ? `已按“${state.query.submitted}”搜索`
        : state.error?.message;

  return (
    <section className="station-search" aria-label="指定地点搜索">
      <form className="station-search__form" onSubmit={submit}>
        <label className="station-search__field" htmlFor="station-keywords">
          <span>指定地点</span>
          <div>
            <Search aria-hidden="true" size={19} />
            <input
              id="station-keywords"
              name="keywords"
              type="search"
              value={value}
              maxLength={76}
              required
              autoComplete="off"
              enterKeyHint="search"
              aria-label="搜索指定地点"
              placeholder="服务区、充电站或地点名称"
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
        </label>
        <button
          className="station-search__submit"
          type="submit"
          disabled={state.status === "loading"}
        >
          <Search aria-hidden="true" size={18} />
          {state.status === "loading" ? "搜索中" : "搜索充电站"}
        </button>
        {active && (
          <button
            className="station-search__clear"
            type="button"
            onClick={clear}
          >
            <ArrowLeft aria-hidden="true" size={18} />
            返回附近
          </button>
        )}
      </form>
      {context && (
        <p
          className={`station-search__context${
            state.status === "error" ? " is-error" : ""
          }`}
          aria-live="polite"
        >
          {context}
        </p>
      )}
    </section>
  );
}
