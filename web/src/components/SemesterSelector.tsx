import type { Semester } from "../services/campus.js";

export function SemesterSelector({
  id,
  value,
  semesters,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  semesters: Semester[];
  onChange: (term: string) => void;
  disabled?: boolean;
}) {
  if (semesters.length === 0) return null;

  return (
    <label className="semester-filter" htmlFor={id}>
      <span>Semestre</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {semesters.map((semester) => (
          <option key={semester.id} value={semester.name}>
            {semester.name}
          </option>
        ))}
      </select>
    </label>
  );
}
