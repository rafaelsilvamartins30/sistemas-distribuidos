import { Icon } from "./Icon";

interface SearchFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

export function SearchField({ label, placeholder, value, onChange }: SearchFieldProps) {
  return (
    <label className="search-field page-search">
      <Icon name="search" width="18" height="18" />
      <span className="sr-only">{label}</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}
