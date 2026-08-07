import { createContext, useContext, useMemo, useState, PropsWithChildren } from "react";

type SearchContextValue = {
  searchText: string;
  setSearchText: (text: string) => void;
};

const SearchContext = createContext<SearchContextValue>({
  searchText: "",
  setSearchText: () => {},
});

export function SearchProvider({ children }: PropsWithChildren) {
  const [searchText, setSearchText] = useState("");
  const value = useMemo(
    () => ({ searchText, setSearchText }),
    [searchText]
  );
  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  return useContext(SearchContext);
}
